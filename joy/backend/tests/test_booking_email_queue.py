import json


class _FakeRedis:
    def __init__(self, queues: dict[str, list[str]]):
        self.queues = queues

    def rpoplpush(self, source: str, destination: str):
        values = self.queues.setdefault(source, [])
        if not values:
            return None
        value = values.pop()
        self.queues.setdefault(destination, []).insert(0, value)
        return value

    def brpoplpush(self, source: str, destination: str, timeout: int):
        return self.rpoplpush(source, destination)

    def lrem(self, queue: str, count: int, value: str) -> int:
        values = self.queues.setdefault(queue, [])
        try:
            values.remove(value)
        except ValueError:
            return 0
        return 1

    def lpush(self, queue: str, value: str) -> int:
        self.queues.setdefault(queue, []).insert(0, value)
        return len(self.queues[queue])


def test_booking_email_requeues_failure_without_losing_payload(monkeypatch):
    from app.queue import worker
    from app.queue.tasks import BOOKING_EMAIL_PROCESSING_QUEUE, BOOKING_EMAIL_QUEUE

    initial = json.dumps(
        {
            "email": "ada@example.com",
            "booking_id": "booking-123",
            "subject": "Appointment details",
            "text": "Your appointment is confirmed.",
        }
    )
    queues = {BOOKING_EMAIL_QUEUE: [initial]}
    fake_redis = _FakeRedis(queues)
    monkeypatch.setattr(worker, "_redis", lambda: fake_redis)

    def _unavailable(*args, **kwargs):
        raise RuntimeError("Resend is temporarily unavailable")

    monkeypatch.setattr(worker, "send_appointment_email", _unavailable)

    assert worker.process_booking_email_once(timeout=0) is False
    assert queues[BOOKING_EMAIL_PROCESSING_QUEUE] == []
    retry_payload = json.loads(queues[BOOKING_EMAIL_QUEUE][0])
    assert retry_payload["attempts"] == 1

    sent: list[dict[str, object]] = []
    monkeypatch.setattr(worker, "send_appointment_email", lambda *args, **kwargs: sent.append(kwargs))

    assert worker.process_booking_email_once(timeout=0) is True
    assert queues[BOOKING_EMAIL_PROCESSING_QUEUE] == []
    assert queues[BOOKING_EMAIL_QUEUE] == []
    assert sent[0]["idempotency_key"].startswith("joy-details-booking-123-")


def test_booking_email_startup_recovery_returns_unacknowledged_job(monkeypatch):
    from app.queue import worker
    from app.queue.tasks import BOOKING_EMAIL_PROCESSING_QUEUE, BOOKING_EMAIL_QUEUE

    raw = json.dumps({"booking_id": "booking-123"})
    queues = {BOOKING_EMAIL_PROCESSING_QUEUE: [raw]}
    monkeypatch.setattr(worker, "_redis", lambda: _FakeRedis(queues))

    assert worker.recover_booking_email_processing() == 1
    assert queues[BOOKING_EMAIL_PROCESSING_QUEUE] == []
    assert queues[BOOKING_EMAIL_QUEUE] == [raw]
