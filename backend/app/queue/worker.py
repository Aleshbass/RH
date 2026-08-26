import json
import logging
import time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.conversation.turn_handler import handle_turn
from app.conversation.voice import transcript_from_audio
from app.db import SessionLocal
from app.llm.gemini_client import GeminiTimeoutError, LLMClient, get_llm_client
from app.models.conversation import Message
from app.models.types import AuditKind, PatientPhase, TurnResult
from app.queue.tasks import (
    ADMIN_ESCALATION_QUEUE,
    BOOKING_CONFIRMED_QUEUE,
    DEAD_LETTER_QUEUE,
    FAMILY_RELAY_QUEUE,
    FAMILY_SAFETY_QUEUE,
    INBOUND_QUEUE,
    MAX_ATTEMPTS,
    PARTNER_REFERRAL_QUEUE,
    PHYSIO_BOOKING_ALERT_QUEUE,
    PHYSIO_RELAY_QUEUE,
    PROCESSING_QUEUE,
    _redis,
    send_whatsapp_text,
)

logger = logging.getLogger(__name__)


def _payload_media(payload: dict) -> list[str] | None:
    raw = payload.get("media")
    if not raw:
        return None
    if isinstance(raw, str):
        return [raw]
    return [str(item) for item in raw if item]

GEMINI_TIMEOUT_APOLOGY = "Sorry, I had a brief hiccup. Please send that again in a moment."


def process_inbound(
    session: Session,
    wa_message_id: str,
    phone: str,
    text: str,
    llm: LLMClient | None = None,
    *,
    audio_url: str | None = None,
    audio_media_id: str | None = None,
    audio_mime: str | None = None,
    audio_bytes: bytes | None = None,
    media: list[str] | None = None,
    location_lat: float | None = None,
    location_lng: float | None = None,
) -> TurnResult | None:
    existing = session.scalar(select(Message.id).where(Message.wa_message_id == wa_message_id))
    if existing is not None:
        return None
    client = llm or get_llm_client()
    location = None
    if location_lat is not None and location_lng is not None:
        location = (float(location_lat), float(location_lng))
    try:
        user_text = transcript_from_audio(
            client,
            text=text,
            audio_url=audio_url,
            audio_media_id=audio_media_id,
            audio_mime=audio_mime,
            audio_bytes=audio_bytes,
        )
        return handle_turn(
            session,
            phone,
            user_text,
            client,
            wa_message_id=wa_message_id,
            media=media,
            location=location,
        )
    except GeminiTimeoutError:
        return TurnResult(
            reply_text=GEMINI_TIMEOUT_APOLOGY,
            language="en",
            phase=PatientPhase.FIRST_CONTACT,
        )


def _claim(timeout: int) -> str | None:
    try:
        return _redis().brpoplpush(INBOUND_QUEUE, PROCESSING_QUEUE, timeout=timeout)
    except TimeoutError:
        return None


def _ack(raw: str) -> None:
    _redis().lrem(PROCESSING_QUEUE, 1, raw)


def _backoff_seconds(attempts: int) -> float:
    return float(2 ** max(attempts - 1, 0))


def _retry_or_dead(raw: str, payload: dict, error: BaseException, session: Session) -> None:
    client = _redis()
    client.lrem(PROCESSING_QUEUE, 1, raw)
    attempts = int(payload.get("attempts") or 0) + 1
    payload["attempts"] = attempts
    if attempts >= MAX_ATTEMPTS:
        client.lpush(DEAD_LETTER_QUEUE, json.dumps(payload))
        append(
            session,
            kind=AuditKind.ADMIN,
            actor_phone=str(payload.get("phone") or ""),
            person_id=None,
            payload={
                "dead_letter": True,
                "wa_message_id": payload.get("wa_message_id"),
                "error": str(error),
                "attempts": attempts,
            },
        )
        return
    time.sleep(_backoff_seconds(attempts))
    client.lpush(INBOUND_QUEUE, json.dumps(payload))


def _joy_reply_for_wamid(session: Session, wa_message_id: str) -> str | None:
    user = session.scalar(select(Message).where(Message.wa_message_id == wa_message_id))
    if user is None:
        return None
    joy = session.scalar(
        select(Message)
        .where(Message.conversation_id == user.conversation_id, Message.role == "joy")
        .order_by(Message.created_at.desc())
    )
    return joy.text if joy is not None else None


def process_queue_once(
    session: Session | None = None,
    llm: LLMClient | None = None,
    timeout: int = 1,
) -> TurnResult | None:
    raw = _claim(timeout)
    if raw is None:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        _ack(raw)
        _redis().lpush(DEAD_LETTER_QUEUE, raw)
        return None

    own_session = session is None
    db = session or SessionLocal()
    committed = False
    try:
        result = process_inbound(
            db,
            payload["wa_message_id"],
            payload["phone"],
            payload.get("text") or "",
            llm=llm,
            audio_url=payload.get("audio_url"),
            audio_media_id=payload.get("audio_media_id"),
            audio_mime=payload.get("audio_mime"),
            media=_payload_media(payload),
            location_lat=payload.get("location_lat"),
            location_lng=payload.get("location_lng"),
        )
        if own_session:
            db.commit()
            committed = True
        reply = (
            result.reply_text
            if result is not None
            else _joy_reply_for_wamid(db, payload["wa_message_id"])
        )
        if reply:
            send_whatsapp_text(payload["phone"], reply)
        _ack(raw)
        return result
    except Exception as exc:
        if own_session and not committed:
            db.rollback()
        _retry_or_dead(raw, payload, exc, db)
        if own_session:
            try:
                db.commit()
            except Exception:
                db.rollback()
        if not own_session:
            raise
        logger.exception("inbound job failed")
        return None
    finally:
        if own_session:
            db.close()


process_one = process_queue_once


def process_booking_confirmed_once(timeout: int = 1) -> bool:
    return _drain_text_queue(BOOKING_CONFIRMED_QUEUE, timeout=timeout)


def process_physio_booking_alert_once(timeout: int = 1) -> bool:
    return _drain_text_queue(PHYSIO_BOOKING_ALERT_QUEUE, timeout=timeout)


def process_family_safety_once(timeout: int = 1) -> bool:
    return _drain_text_queue(FAMILY_SAFETY_QUEUE, timeout=timeout)


def process_physio_relay_once(timeout: int = 1) -> bool:
    return _drain_text_queue(PHYSIO_RELAY_QUEUE, timeout=timeout)


def process_family_relay_once(timeout: int = 1) -> bool:
    return _drain_text_queue(FAMILY_RELAY_QUEUE, timeout=timeout)


def process_partner_referral_once(timeout: int = 1) -> bool:
    return _drain_text_queue(PARTNER_REFERRAL_QUEUE, timeout=timeout)


def process_admin_escalation_once(timeout: int = 1) -> bool:
    return _drain_text_queue(ADMIN_ESCALATION_QUEUE, timeout=timeout)


def _drain_text_queue(queue: str, timeout: int = 1) -> bool:
    client = _redis()
    try:
        if timeout <= 0:
            payload_str = client.rpop(queue)
        else:
            raw = client.brpop(queue, timeout=timeout)
            payload_str = None if raw is None else raw[1]
    except TimeoutError:
        return False
    if not payload_str:
        return False
    payload = json.loads(payload_str)
    send_whatsapp_text(str(payload["phone"]), str(payload["text"]))
    return True


def run_forever(timeout: int = 5) -> None:
    while True:
        try:
            process_booking_confirmed_once(timeout=0)
        except Exception:
            logger.exception("booking_confirmed job failed")
        try:
            process_physio_booking_alert_once(timeout=0)
        except Exception:
            logger.exception("physio_booking_alert job failed")
        try:
            process_family_safety_once(timeout=0)
        except Exception:
            logger.exception("family_safety job failed")
        try:
            process_physio_relay_once(timeout=0)
        except Exception:
            logger.exception("physio_relay job failed")
        try:
            process_family_relay_once(timeout=0)
        except Exception:
            logger.exception("family_relay job failed")
        try:
            process_partner_referral_once(timeout=0)
        except Exception:
            logger.exception("partner_referral job failed")
        try:
            process_admin_escalation_once(timeout=0)
        except Exception:
            logger.exception("admin_escalation job failed")
        try:
            process_queue_once(timeout=timeout)
        except Exception:
            logger.exception("inbound job failed")
