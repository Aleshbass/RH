"""Outbound WhatsApp alerts are delivered at least once; failed deliveries are recorded; logs split.

Before Nov 2026 a physio alert, family safety alert or care-team notice was popped off Redis and
lost for good if the send failed once. No Redis or database needed: a small in-memory stand-in.
"""
import json
import logging
import time

import httpx
import pytest

from app.queue import tasks
from app.queue import worker


class FakeRedis:
    def __init__(self):
        self.lists: dict[str, list[str]] = {}

    def _l(self, key):
        return self.lists.setdefault(key, [])

    def lpush(self, key, value):
        self._l(key).insert(0, value)

    def rpoplpush(self, source, destination):
        items = self._l(source)
        if not items:
            return None
        value = items.pop()
        self._l(destination).insert(0, value)
        return value

    def brpoplpush(self, source, destination, timeout=0):
        return self.rpoplpush(source, destination)

    def lrem(self, key, count, value):
        items = self._l(key)
        if value in items:
            items.remove(value)

    def ltrim(self, key, start, end):
        self.lists[key] = self._l(key)[start:end + 1]

    def pipeline(self, transaction=True):
        redis, ops = self, []

        class Pipe:
            def __getattr__(self, name):
                return lambda *a, **k: ops.append((name, a, k))

            def execute(self):
                for name, a, k in ops:
                    getattr(redis, name)(*a, **k)

        return Pipe()


QUEUE = tasks.PHYSIO_BOOKING_ALERT_QUEUE


@pytest.fixture
def redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(worker, "_redis", lambda: fake)
    return fake


def queue_job(redis, payload):
    redis.lpush(QUEUE, json.dumps(payload))


def meta_error(code):
    request = httpx.Request("POST", "https://graph.facebook.com/x")
    response = httpx.Response(400, request=request)
    return httpx.HTTPStatusError(f'400 for Graph messages: {{"error":{{"code":{code}}}}}', request=request, response=response)


def test_a_delivered_alert_is_acknowledged(monkeypatch, redis):
    sent = []
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda phone, text: sent.append((phone, text)))
    queue_job(redis, {"phone": "+2348030000000", "text": "New booking request"})  # the old payload shape
    assert worker._drain_text_queue(QUEUE, timeout=0)
    assert sent == [("+2348030000000", "New booking request")]
    assert redis.lists[QUEUE] == [] and redis.lists[tasks.processing_list(QUEUE)] == []


def test_a_failed_send_is_kept_and_retried_later(monkeypatch, redis):
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda *a: (_ for _ in ()).throw(httpx.ConnectError("down")))
    queue_job(redis, {"phone": "+2348030000000", "text": "Family safety alert"})
    worker._drain_text_queue(QUEUE, timeout=0)
    assert redis.lists[tasks.processing_list(QUEUE)] == []
    (retry,) = redis.lists[QUEUE]
    payload = json.loads(retry)
    assert payload["attempts"] == 1 and payload["next_attempt_at"] > time.time()
    # Not due yet: left alone, not sent again
    called = []
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda *a: called.append(a))
    worker._drain_text_queue(QUEUE, timeout=0)
    assert not called and len(redis.lists[QUEUE]) == 1
    # Due: delivered
    payload["next_attempt_at"] = time.time() - 1
    redis.lists[QUEUE] = [json.dumps(payload)]
    worker._drain_text_queue(QUEUE, timeout=0)
    assert called and redis.lists[QUEUE] == []


def test_after_the_last_attempt_it_goes_to_the_dead_letter_list(monkeypatch, redis, caplog):
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda *a: (_ for _ in ()).throw(httpx.ConnectError("down")))
    queue_job(redis, {"phone": "+2348030000000", "text": "x", "attempts": tasks.OUTBOUND_MAX_ATTEMPTS - 1})
    with caplog.at_level(logging.ERROR):
        worker._drain_text_queue(QUEUE, timeout=0)
    assert redis.lists[QUEUE] == [] and len(redis.lists[tasks.dead_letter_list(QUEUE)]) == 1
    assert "joy_outbound_dead_letter" in caplog.text and "+234" not in caplog.text


def test_a_permanent_meta_error_is_not_retried(monkeypatch, redis):
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda *a: (_ for _ in ()).throw(meta_error(131026)))
    queue_job(redis, {"phone": "+2348030000000", "text": "x"})
    worker._drain_text_queue(QUEUE, timeout=0)
    assert redis.lists[QUEUE] == [] and len(redis.lists[tasks.dead_letter_list(QUEUE)]) == 1


def test_a_closed_24h_window_retries_as_the_template(monkeypatch, redis):
    forgotten = []
    monkeypatch.setattr(worker, "forget_service_window", lambda phone: forgotten.append(phone))
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda *a: (_ for _ in ()).throw(meta_error(131047)))
    queue_job(redis, {"phone": "+2348030000000", "text": "x"})
    worker._drain_text_queue(QUEUE, timeout=0)
    assert forgotten == ["+2348030000000"] and json.loads(redis.lists[QUEUE][0])["attempts"] == 1


def test_bad_json_is_dead_lettered(monkeypatch, redis):
    redis.lpush(QUEUE, "not json")
    worker._drain_text_queue(QUEUE, timeout=0)
    assert redis.lists[QUEUE] == [] and redis.lists[tasks.dead_letter_list(QUEUE)] == ["not json"]


def test_jobs_a_crashed_worker_claimed_go_back_on_their_queue(monkeypatch, redis):
    monkeypatch.setattr(worker, "recover_booking_email_processing", lambda: 0)
    redis.lpush(tasks.processing_list(QUEUE), json.dumps({"phone": "+234", "text": "x"}))
    assert worker._recover_processing_lists() == 1
    assert len(redis.lists[QUEUE]) == 1 and redis.lists[tasks.processing_list(QUEUE)] == []


@pytest.mark.parametrize("sent_as,code,action", [
    ("text", 131047, "window_closed"),
    ("interactive", "131047", "window_closed"),
    ("template", 131047, "not_retried"),
    ("text", 131049, "not_retried"),
    (None, 131026, "not_retried"),
])
def test_what_joy_does_about_a_failed_delivery(sent_as, code, action):
    assert tasks.delivery_failure_action(sent_as, code) == action


def test_only_failed_statuses_are_queued(monkeypatch):
    from app.api.webhooks import whatsapp

    queued = []
    monkeypatch.setattr(whatsapp, "enqueue_delivery_failure", lambda wa_id, **k: queued.append((wa_id, k)))
    whatsapp._failed_delivery({"id": "wamid.1", "status": "delivered", "recipient_id": "2348030000000"})
    whatsapp._failed_delivery({"id": "wamid.2", "status": "failed", "recipient_id": "2348030000000",
                               "errors": [{"code": 131047, "title": "Re-engagement message"}]})
    assert queued == [("wamid.2", {"recipient": "+2348030000000", "code": 131047, "title": "Re-engagement message"})]


def test_info_goes_to_stdout_and_errors_to_stderr(capsys):
    from app.logging_setup import configure_logging

    configure_logging()
    configure_logging()  # idempotent: no doubled lines
    log = logging.getLogger("joy.test.logging")
    log.info("hello-info")
    log.error("hello-error")
    out, err = capsys.readouterr()
    assert out.count("hello-info") == 1 and "hello-error" not in out
    assert err.count("hello-error") == 1 and "hello-info" not in err
