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


def _inbound_audio_payload(phone: str, wa_message_id: str, media_id: str) -> bytes:
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
                                    "type": "audio",
                                    "audio": {
                                        "id": media_id,
                                        "mime_type": "audio/ogg",
                                    },
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    return json.dumps(payload).encode()


def test_simulate_turn_audio_url_feeds_transcript(
    client, db_session: Session, patient_phone: str, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    fake_llm.voice_transcript = "my knee still hurts"
    fake_llm.reply = "Sorry about the knee — tell me more."
    seen: list[tuple[bytes, str]] = []
    original = fake_llm.complete_voice

    def _spy(audio_bytes: bytes, mime: str):
        seen.append((audio_bytes, mime))
        return original(audio_bytes, mime)

    fake_llm.complete_voice = _spy

    class _Resp:
        content = b"ogg-bytes"
        headers = {"content-type": "audio/ogg"}

        def raise_for_status(self) -> None:
            return None

    monkeypatch.setattr("httpx.get", lambda *args, **kwargs: _Resp())

    response = client.post(
        "/api/internal/simulate_turn",
        json={
            "phone": patient_phone,
            "text": "",
            "audio_url": "https://example.test/voice.ogg",
        },
    )
    assert response.status_code == 200
    assert seen == [(b"ogg-bytes", "audio/ogg")]
    assert response.json()["reply"] == fake_llm.reply
    stored = db_session.scalar(select(Message).where(Message.role == "user"))
    assert stored is not None
    assert stored.text == "my knee still hurts"


def test_webhook_audio_then_process_once_uses_transcript(
    client, db_session: Session, patient_phone: str, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.queue.tasks import INBOUND_QUEUE, _redis
    from app.queue.worker import process_queue_once

    fake_llm.voice_transcript = "my knee still hurts"
    fake_llm.reply = "Sorry about the knee — tell me more."
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.worker.send_whatsapp_text",
        lambda phone, text: sent.append((phone, text)),
    )
    _redis().delete(INBOUND_QUEUE)

    media_id = "MEDIA123"
    wa_message_id = f"wamid.audio.{uuid.uuid4()}"

    class _Meta:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {"url": "https://cdn.example.test/note.ogg", "mime_type": "audio/ogg"}

    class _Audio:
        content = b"ogg-bytes"
        headers = {"content-type": "audio/ogg"}

        def raise_for_status(self) -> None:
            return None

    def _get(url: str, *args, **kwargs):
        if media_id in str(url):
            return _Meta()
        return _Audio()

    monkeypatch.setattr("httpx.get", _get)

    body = _inbound_audio_payload(patient_phone, wa_message_id, media_id)
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
    assert stored.text == "my knee still hurts"
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


def test_enqueue_retries_after_lpush_failure():
    from app.queue.tasks import INBOUND_QUEUE, enqueue_inbound, _redis

    client = _redis()
    wa_message_id = f"wamid.lpush.{uuid.uuid4()}"
    lock_key = f"joy:wamid:{wa_message_id}"

    client.delete(INBOUND_QUEUE, lock_key)
    client.set(INBOUND_QUEUE, "not-a-list")

    try:
        with pytest.raises(redis.ResponseError):
            enqueue_inbound(wa_message_id, "+2348000004001", "hello")

        assert client.get(lock_key) is None

        client.delete(INBOUND_QUEUE)

        retry = enqueue_inbound(wa_message_id, "+2348000004001", "hello")
        assert retry is True
        assert client.get(lock_key) == "1"
    finally:
        client.delete(INBOUND_QUEUE, lock_key)
