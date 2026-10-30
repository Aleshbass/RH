import json
import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.audit_log import AuditEvent
from app.models.types import AuditKind, PatientPhase
from tests.fakes import FakeLLM


def test_send_whatsapp_text_raises_on_http_error(monkeypatch: pytest.MonkeyPatch):
    from app.config import get_settings
    from app.queue.tasks import send_whatsapp_text

    settings = get_settings()
    settings.whatsapp_access_token = "token"
    settings.whatsapp_phone_number_id = "123"
    monkeypatch.setattr("app.queue.tasks.get_settings", lambda: settings)

    class _Resp:
        def raise_for_status(self) -> None:
            request = httpx.Request("POST", "https://graph.facebook.com")
            response = httpx.Response(500, request=request)
            raise httpx.HTTPStatusError("boom", request=request, response=response)

    monkeypatch.setattr("httpx.post", lambda *args, **kwargs: _Resp())
    with pytest.raises(httpx.HTTPStatusError):
        send_whatsapp_text("+2348000004001", "hello")


def test_failed_job_stays_recoverable_then_dead_letters(
    db_session: Session, patient_phone: str, monkeypatch: pytest.MonkeyPatch
):
    from app.queue import worker
    from app.queue.tasks import DEAD_LETTER_QUEUE, INBOUND_QUEUE, PROCESSING_QUEUE, enqueue_inbound, _redis
    from app.queue.worker import process_queue_once

    monkeypatch.setattr(worker, "MAX_ATTEMPTS", 2)
    monkeypatch.setattr(worker.time, "sleep", lambda _seconds: None)

    client = _redis()
    wa_message_id = f"wamid.retry.{uuid.uuid4()}"
    client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE)
    # "hello" is answered without the model, so use a non-greeting message
    # with no clinical story to exercise the timeout path.
    assert enqueue_inbound(wa_message_id, patient_phone, "can you help me please") is True

    class _BoomLLM(FakeLLM):
        def complete(self, prompt: str, user_text: str):
            raise RuntimeError("worker crash")

    try:
        with pytest.raises(RuntimeError):
            process_queue_once(session=db_session, llm=_BoomLLM(), timeout=1)
        assert client.llen(INBOUND_QUEUE) == 1
        assert client.llen(PROCESSING_QUEUE) == 0

        with pytest.raises(RuntimeError):
            process_queue_once(session=db_session, llm=_BoomLLM(), timeout=1)
        assert client.llen(INBOUND_QUEUE) == 0
        assert client.llen(DEAD_LETTER_QUEUE) == 1
        dead = json.loads(client.lindex(DEAD_LETTER_QUEUE, 0))
        assert dead["wa_message_id"] == wa_message_id
        events = db_session.scalars(
            select(AuditEvent).where(
                AuditEvent.kind == AuditKind.ADMIN,
                AuditEvent.actor_phone == patient_phone,
            )
        ).all()
        matching = [event for event in events if event.payload.get("wa_message_id") == wa_message_id]
        assert matching
        assert matching[-1].payload.get("dead_letter") is True
    finally:
        client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE, f"joy:wamid:{wa_message_id}")


def test_dead_letter_audit_commits_when_send_fails_after_turn(
    fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from sqlalchemy import delete, select

    from app.db import SessionLocal
    from app.models.audit_log import AuditEvent
    from app.models.conversation import Conversation, Message
    from app.models.patient import Patient
    from app.models.triage_session import TriageSession
    from app.queue import worker
    from app.queue.tasks import DEAD_LETTER_QUEUE, INBOUND_QUEUE, PROCESSING_QUEUE, enqueue_inbound, _redis
    from app.queue.worker import process_queue_once

    monkeypatch.setattr(worker, "MAX_ATTEMPTS", 1)
    monkeypatch.setattr(worker.time, "sleep", lambda _seconds: None)

    def _boom(phone: str, text: str) -> None:
        raise RuntimeError("graph down")

    monkeypatch.setattr(worker, "send_whatsapp_text", _boom)
    fake_llm.reply = "Sorry about the knee — tell me more."

    phone = f"+2348{uuid.uuid4().int % 10**9:09d}"
    db = SessionLocal()
    try:
        patient = Patient(phone_e164=phone, name="DLQ Ada", age=30, location="Lagos")
        db.add(patient)
        db.commit()
        patient_id = patient.id
    finally:
        db.close()

    client = _redis()
    wa_message_id = f"wamid.dlqaudit.{uuid.uuid4()}"
    client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE)
    assert enqueue_inbound(wa_message_id, phone, "hello") is True
    try:
        result = process_queue_once(llm=fake_llm, timeout=1)
        assert result is None
        assert client.llen(DEAD_LETTER_QUEUE) == 1
        check = SessionLocal()
        try:
            events = check.scalars(
                select(AuditEvent).where(
                    AuditEvent.kind == AuditKind.ADMIN,
                    AuditEvent.actor_phone == phone,
                )
            ).all()
            assert events
            assert events[-1].payload.get("dead_letter") is True
            assert events[-1].payload.get("wa_message_id") == wa_message_id
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
    finally:
        client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE, f"joy:wamid:{wa_message_id}")


def test_successful_job_is_acked_off_processing(
    db_session: Session, patient_phone: str, fake_llm: FakeLLM, monkeypatch: pytest.MonkeyPatch
):
    from app.queue.tasks import DEAD_LETTER_QUEUE, INBOUND_QUEUE, PROCESSING_QUEUE, enqueue_inbound, _redis
    from app.queue.worker import process_queue_once

    fake_llm.reply = "Sorry about the knee — tell me more."
    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.worker.send_whatsapp_text",
        lambda phone, text: sent.append((phone, text)),
    )
    client = _redis()
    wa_message_id = f"wamid.ack.{uuid.uuid4()}"
    client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE)
    assert enqueue_inbound(wa_message_id, patient_phone, "hello") is True
    try:
        result = process_queue_once(session=db_session, llm=fake_llm, timeout=1)
        assert result is not None
        assert sent
        assert client.llen(INBOUND_QUEUE) == 0
        assert client.llen(PROCESSING_QUEUE) == 0
        assert client.llen(DEAD_LETTER_QUEUE) == 0
    finally:
        client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE, f"joy:wamid:{wa_message_id}")


def test_gemini_timeout_sends_apology_without_advancing_phase(
    db_session: Session, patient_phone: str, monkeypatch: pytest.MonkeyPatch
):
    from app.conversation.state_manager import load
    from app.identity.resolver import resolve
    from app.llm.gemini_client import GeminiTimeoutError
    from app.queue.tasks import DEAD_LETTER_QUEUE, INBOUND_QUEUE, PROCESSING_QUEUE, enqueue_inbound, _redis
    from app.queue.worker import process_queue_once

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.worker.send_whatsapp_text",
        lambda phone, text: sent.append((phone, text)),
    )

    class _TimeoutLLM:
        def complete(self, prompt: str, user_text: str):
            raise GeminiTimeoutError("deadline")

        def complete_voice(self, audio_bytes: bytes, mime: str):
            raise GeminiTimeoutError("deadline")

    client = _redis()
    wa_message_id = f"wamid.timeout.{uuid.uuid4()}"
    client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE)
    assert enqueue_inbound(wa_message_id, patient_phone, "hello") is True
    try:
        result = process_queue_once(session=db_session, llm=_TimeoutLLM(), timeout=1)
        assert result is not None
        lower = result.reply_text.lower()
        # Either an apology or the deterministic welcome: never empty, never booking.
        assert lower.strip()
        assert "sorry" in lower or "again" in lower or "moment" in lower or "welcome" in lower
        assert sent
        assert "book" not in sent[0][1].lower()
        identity = resolve(db_session, patient_phone)
        assert identity is not None
        state = load(db_session, identity)
        assert state.phase == PatientPhase.FIRST_CONTACT
        assert state.extracted.onset is None
        assert client.llen(DEAD_LETTER_QUEUE) == 0
        assert client.llen(PROCESSING_QUEUE) == 0
    finally:
        client.delete(INBOUND_QUEUE, PROCESSING_QUEUE, DEAD_LETTER_QUEUE, f"joy:wamid:{wa_message_id}")


def test_run_forever_stays_alive_after_failed_job(monkeypatch: pytest.MonkeyPatch):
    from app.queue import worker

    class _Stop(BaseException):
        pass

    calls = {"n": 0}

    def _once(*, timeout: int = 5):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("boom")
        raise _Stop()

    monkeypatch.setattr(worker, "process_queue_once", _once)
    try:
        worker.run_forever(timeout=1)
        raise AssertionError("run_forever should keep looping")
    except _Stop:
        pass
    assert calls["n"] == 2


def test_empty_queue_timeout_is_not_a_crash(monkeypatch: pytest.MonkeyPatch):
    from app.queue import worker
    from app.queue.worker import process_queue_once

    class _IdleRedis:
        def brpoplpush(self, *_args, **_kwargs):
            raise TimeoutError("Timeout reading from socket")

    monkeypatch.setattr(worker, "_redis", lambda: _IdleRedis())
    assert process_queue_once(timeout=1) is None
