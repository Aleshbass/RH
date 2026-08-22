import hashlib
import hmac
import json
import uuid

import pytest
import redis
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.conversation import Message
from tests.fakes import FakeLLM


def _sign(body: bytes, secret: str = "test-secret") -> str:
    digest = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _inbound_payload(phone: str, text: str, wa_message_id: str) -> bytes:
    payload = {
        "object": "whatsapp_business_account",
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "from": phone.lstrip("+"),
                                    "id": wa_message_id,
                                    "type": "text",
                                    "text": {"body": text},
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    return json.dumps(payload).encode()


def test_webhook_verify(client):
    response = client.get(
        "/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "test-token",
            "hub.challenge": "abc",
        },
    )
    assert response.status_code == 200
    assert response.text == "abc"


def test_simulate_turn_uses_handler(client, db_session, patient_phone):
    response = client.post(
        "/api/internal/simulate_turn",
        json={"phone": patient_phone, "text": "hello"},
    )
    assert response.status_code == 200
    assert "reply" in response.json()


def test_webhook_verify_rejects_bad_token(client):
    response = client.get(
        "/webhook",
        params={
            "hub.mode": "subscribe",
            "hub.verify_token": "wrong",
            "hub.challenge": "abc",
        },
    )
    assert response.status_code == 403


def test_webhook_post_enqueues_and_returns_200(client):
    body = _inbound_payload("+2348000004001", "hello", f"wamid.{uuid.uuid4()}")
    response = client.post(
        "/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert response.status_code == 200


def test_webhook_post_rejects_bad_signature(client):
    body = _inbound_payload("+2348000004001", "hello", f"wamid.{uuid.uuid4()}")
    response = client.post(
        "/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": "sha256=deadbeef",
        },
    )
    assert response.status_code == 403


def test_enqueue_inbound_is_idempotent_on_wa_message_id():
    from app.queue.tasks import enqueue_inbound

    wa_message_id = f"wamid.idem.{uuid.uuid4()}"
    first = enqueue_inbound(wa_message_id, "+2348000004001", "hello")
    second = enqueue_inbound(wa_message_id, "+2348000004001", "hello")
    assert first is True
    assert second is False


def test_worker_skips_duplicate_wa_message_id(
    db_session: Session, patient_phone: str, fake_llm: FakeLLM
):
    from app.queue.worker import process_inbound

    wa_message_id = f"wamid.dup.{uuid.uuid4()}"
    process_inbound(db_session, wa_message_id, patient_phone, "hello", llm=fake_llm)
    process_inbound(db_session, wa_message_id, patient_phone, "hello again", llm=fake_llm)
    user_count = db_session.scalar(
        select(func.count()).select_from(Message).where(Message.role == "user")
    )
    stored = db_session.scalar(select(Message).where(Message.wa_message_id == wa_message_id))
    assert user_count == 1
    assert stored is not None
    assert stored.text == "hello"


def test_webhook_then_process_once_runs_handle_turn_and_sends(
    client, db_session: Session, patient_phone: str, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.queue.tasks import INBOUND_QUEUE, _redis
    from app.queue.worker import process_queue_once

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.worker.send_whatsapp_text",
        lambda phone, text: sent.append((phone, text)),
    )
    _redis().delete(INBOUND_QUEUE)

    wa_message_id = f"wamid.consume.{uuid.uuid4()}"
    body = _inbound_payload(patient_phone, "hello from webhook", wa_message_id)
    response = client.post(
        "/webhook",
        content=body,
        headers={
            "Content-Type": "application/json",
            "X-Hub-Signature-256": _sign(body),
        },
    )
    assert response.status_code == 200

    result = process_queue_once(session=db_session, llm=fake_llm, timeout=1)
    stored = db_session.scalar(select(Message).where(Message.wa_message_id == wa_message_id))
    assert result is not None
    assert stored is not None
    assert stored.text == "hello from webhook"
    assert sent
    assert sent[0][0] == patient_phone


def test_simulate_turn_does_not_send_whatsapp(
    client, patient_phone: str, monkeypatch: pytest.MonkeyPatch
):
    sent: list[tuple[str, str]] = []

    def _capture(phone: str, text: str) -> None:
        sent.append((phone, text))

    monkeypatch.setattr("app.queue.worker.send_whatsapp_text", _capture)
    monkeypatch.setattr("app.queue.tasks.send_whatsapp_text", _capture)

    response = client.post(
        "/api/internal/simulate_turn",
        json={"phone": patient_phone, "text": "hello"},
    )
    assert response.status_code == 200
    assert "reply" in response.json()
    assert sent == []


def test_enqueue_retries_after_lpush_failure(monkeypatch: pytest.MonkeyPatch):
    from app.queue.tasks import enqueue_inbound, _redis

    wa_message_id = f"wamid.atomic.{uuid.uuid4()}"
    original_lpush = redis.Redis.lpush

    def _boom(self, *args, **kwargs):
        raise redis.RedisError("lpush failed")

    monkeypatch.setattr(redis.Redis, "lpush", _boom)
    with pytest.raises(redis.RedisError):
        enqueue_inbound(wa_message_id, "+2348000004001", "hello")

    monkeypatch.setattr(redis.Redis, "lpush", original_lpush)
    retry = enqueue_inbound(wa_message_id, "+2348000004001", "hello")
    assert retry is True
    assert _redis().get(f"joy:wamid:{wa_message_id}") == "1"
