import hashlib
import hmac
import json
import uuid

import httpx
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
        select(func.count())
        .select_from(Message)
        .where(Message.wa_message_id == wa_message_id)
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

    fake_llm.reply = "Sorry about the knee — tell me more."
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
    # The transcript feeds the same pipeline as text, so it reaches the summary.
    assert "tell me anything to change or add" in response.json()["reply"].lower()
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


def test_audio_fetch_failure_sends_apology_not_silent(
    client, db_session: Session, patient_phone: str, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.queue.tasks import DEAD_LETTER_QUEUE, INBOUND_QUEUE, PROCESSING_QUEUE, _redis
    from app.queue.worker import process_queue_once

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.worker.send_whatsapp_text",
        lambda phone, text: sent.append((phone, text)),
    )
    client_redis = _redis()
    client_redis.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE)

    media_id = "MEDIA_FAIL"
    wa_message_id = f"wamid.audio.fail.{uuid.uuid4()}"

    def _get(url: str, *args, **kwargs):
        raise httpx.HTTPStatusError(
            "401",
            request=httpx.Request("GET", url),
            response=httpx.Response(401),
        )

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
    assert result is not None
    lower = result.reply_text.lower()
    assert "voice" in lower or "hear" in lower or "again" in lower
    assert sent
    assert client_redis.llen(DEAD_LETTER_QUEUE) == 0
    assert client_redis.llen(PROCESSING_QUEUE) == 0


def test_empty_voice_transcript_asks_to_retry(
    db_session: Session, patient_phone: str, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.queue.tasks import INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE, enqueue_inbound, _redis
    from app.queue.worker import process_queue_once

    fake_llm.voice_transcript = "   "
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.worker.send_whatsapp_text",
        lambda phone, text: sent.append((phone, text)),
    )

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
        if "MEDIA_EMPTY" in str(url):
            return _Meta()
        return _Audio()

    monkeypatch.setattr("httpx.get", _get)
    client = _redis()
    client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE)
    wa_message_id = f"wamid.audio.empty.{uuid.uuid4()}"
    assert (
        enqueue_inbound(
            wa_message_id,
            patient_phone,
            "",
            audio_media_id="MEDIA_EMPTY",
            audio_mime="audio/ogg",
        )
        is True
    )
    result = process_queue_once(session=db_session, llm=fake_llm, timeout=1)
    assert result is not None
    lower = result.reply_text.lower()
    assert "voice" in lower or "again" in lower or "type" in lower
    assert sent


def _inbound_image_payload(
    phone: str, wa_message_id: str, media_id: str, *, caption: str = ""
) -> bytes:
    image: dict = {"id": media_id, "mime_type": "image/jpeg"}
    if caption:
        image["caption"] = caption
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
                                    "type": "image",
                                    "image": image,
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    return json.dumps(payload).encode()


def _inbound_document_payload(phone: str, wa_message_id: str, media_id: str) -> bytes:
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
                                    "type": "document",
                                    "document": {
                                        "id": media_id,
                                        "filename": "license.pdf",
                                        "mime_type": "application/pdf",
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


def _inbound_location_payload(
    phone: str, wa_message_id: str, lat: float, lng: float
) -> bytes:
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
                                    "type": "location",
                                    "location": {"latitude": lat, "longitude": lng},
                                }
                            ]
                        }
                    }
                ]
            }
        ],
    }
    return json.dumps(payload).encode()


def test_webhook_image_then_process_once_reaches_onboarding(
    client, db_session: Session, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.models.physiotherapist import Physiotherapist
    from app.queue.tasks import INBOUND_QUEUE, _redis
    from app.queue.worker import process_queue_once

    physio = Physiotherapist(phone_e164="+2348000004011", onboarding_status="collecting")
    db_session.add(physio)
    db_session.flush()

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.worker.send_whatsapp_text",
        lambda phone, text: sent.append((phone, text)),
    )
    _redis().delete(INBOUND_QUEUE)

    media_id = "IMGCRED123"
    wa_message_id = f"wamid.image.{uuid.uuid4()}"
    body = _inbound_image_payload(physio.phone_e164, wa_message_id, media_id)
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
    db_session.refresh(physio)
    assert result is not None
    assert result.reply_text
    assert "dashboard" not in result.reply_text.lower()
    assert physio.credential_urls == [media_id]
    assert sent
    assert sent[0][0] == physio.phone_e164
    assert sent[0][1] == result.reply_text


def test_webhook_document_then_process_once_sets_credential_url(
    client, db_session: Session, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.models.physiotherapist import Physiotherapist
    from app.queue.tasks import INBOUND_QUEUE, _redis
    from app.queue.worker import process_queue_once

    physio = Physiotherapist(phone_e164="+2348000004012", onboarding_status="collecting")
    db_session.add(physio)
    db_session.flush()

    monkeypatch.setattr("app.queue.worker.send_whatsapp_text", lambda phone, text: None)
    _redis().delete(INBOUND_QUEUE)

    media_id = "DOCCRED456"
    wa_message_id = f"wamid.doc.{uuid.uuid4()}"
    body = _inbound_document_payload(physio.phone_e164, wa_message_id, media_id)
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
    db_session.refresh(physio)
    assert result is not None
    assert result.reply_text
    assert physio.credential_urls == [media_id]


def test_webhook_location_then_process_once_checks_in(
    client, db_session: Session, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
    from app.models.patient import Patient
    from app.models.physiotherapist import Physiotherapist
    from app.queue.tasks import INBOUND_QUEUE, _redis
    from app.queue.worker import process_queue_once

    patient = Patient(
        phone_e164="+2348000004013", name="Ada Okonkwo", age=32, location="Lagos"
    )
    physio = Physiotherapist(
        phone_e164="+2348000004014",
        specialty_tags=["msk"],
        verified=True,
        price_kobo=2_000_000,
        rating=4.5,
    )
    db_session.add_all([patient, physio])
    db_session.flush()
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "home_visit",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_loc_checkin")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.flush()

    monkeypatch.setattr("app.queue.worker.send_whatsapp_text", lambda phone, text: None)
    _redis().delete(INBOUND_QUEUE)

    wa_message_id = f"wamid.loc.{uuid.uuid4()}"
    body = _inbound_location_payload(physio.phone_e164, wa_message_id, 6.5244, 3.3792)
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
    db_session.refresh(booking)
    assert result is not None
    assert booking.checkin_lat == pytest.approx(6.5244)
    assert booking.checkin_lng == pytest.approx(3.3792)
    assert booking.status == "confirmed"


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


def test_simulate_turn_production_missing_secret_is_401(client, patient_phone: str):
    from app.config import get_settings

    settings = get_settings()
    settings.joy_environment = "production"
    settings.internal_api_secret = ""
    response = client.post(
        "/api/internal/simulate_turn",
        json={"phone": patient_phone, "text": "hello"},
    )
    assert response.status_code == 401


def test_simulate_turn_persists_extracted_across_http_requests(fake_llm: FakeLLM):
    from fastapi.testclient import TestClient
    from sqlalchemy import delete, select

    from app.config import get_settings
    from app.db import SessionLocal
    from app.llm.gemini_client import get_llm_client
    from app.main import app
    from app.models.conversation import Conversation, Message
    from app.models.patient import Patient
    from app.models.triage_session import TriageSession
    from app.models.types import ExtractedTriage

    phone = f"+2348{uuid.uuid4().int % 10**9:09d}"
    db = SessionLocal()
    try:
        patient = Patient(phone_e164=phone, name="Persist Ada", age=30, location="Lagos")
        db.add(patient)
        db.commit()
        patient_id = patient.id
    finally:
        db.close()

    settings = get_settings()
    settings.joy_environment = "development"
    settings.internal_api_secret = ""
    fake_llm.reply = "Sorry about the knee — tell me the whole story when you can."
    fake_llm.extraction = {"onset": "3 days", "body_location": "knee"}
    app.dependency_overrides[get_llm_client] = lambda: fake_llm
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as http:
            first = http.post(
                "/api/internal/simulate_turn",
                json={"phone": phone, "text": "my knee has hurt for 3 days"},
            )
            assert first.status_code == 200
            fake_llm.extraction = {}
            fake_llm.reply = "this-should-not-leak-if-mid-triage"
            second = http.post(
                "/api/internal/simulate_turn",
                json={"phone": phone, "text": "still the same knee"},
            )
            assert second.status_code == 200
            assert "this-should-not-leak-if-mid-triage" not in second.json()["reply"]
    finally:
        app.dependency_overrides.pop(get_llm_client, None)
        app.dependency_overrides.pop(get_settings, None)

    check = SessionLocal()
    try:
        triage = check.scalar(select(TriageSession).where(TriageSession.patient_id == patient_id))
        assert triage is not None
        extracted = ExtractedTriage.model_validate(triage.extracted)
        assert extracted.onset == "3 days"
        assert extracted.body_location == "knee"
    finally:
        conversations = check.scalars(
            select(Conversation).where(Conversation.person_id == patient_id)
        ).all()
        for conversation in conversations:
            check.execute(delete(Message).where(Message.conversation_id == conversation.id))
            check.delete(conversation)
        check.execute(delete(TriageSession).where(TriageSession.patient_id == patient_id))
        leftover = check.get(Patient, patient_id)
        if leftover is not None:
            check.delete(leftover)
        check.commit()
        check.close()
