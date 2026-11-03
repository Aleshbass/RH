import json
import logging
import time
from datetime import datetime, timedelta, timezone

import httpx
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.conversation.turn_handler import handle_turn
from app.conversation.turn_handler import provider_unavailable_reply
from app.conversation.voice import (
    MAX_VOICE_SECONDS,
    VOICE_TOO_LONG_REPLY,
    VoiceTooLongError,
    transcript_from_audio,
)
from app.db import SessionLocal
from app.llm.gemini_client import GeminiTimeoutError, LLMClient, get_llm_client
from app.models.conversation import Message
from app.models.appointment_reminder import AppointmentReminder
from app.models.types import AuditKind, PatientPhase, TurnResult
from app.booking.appointment_reminders import AT_APPOINTMENT_START, appointment_reminder_text
from app.observability import elapsed_ms, log_event, timer_start
from app.queue.tasks import (
    ADMIN_ESCALATION_QUEUE,
    BOOKING_CONFIRMED_QUEUE,
    BOOKING_EMAIL_QUEUE,
    BOOKING_EMAIL_PROCESSING_QUEUE,
    BOOKING_EMAIL_DEAD_LETTER_QUEUE,
    BROADCAST_QUEUE,
    DEAD_LETTER_QUEUE,
    FAMILY_RELAY_QUEUE,
    FAMILY_SAFETY_QUEUE,
    INBOUND_QUEUE,
    MAX_ATTEMPTS,
    PARTNER_REFERRAL_QUEUE,
    PHYSIO_BOOKING_ALERT_QUEUE,
    PHYSIO_RELAY_QUEUE,
    PROCESSING_QUEUE,
    TAKEOVER_QUEUE,
    _redis,
    appointment_email_idempotency_key,
    send_appointment_email,
    send_whatsapp_interactive,
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
VOICE_FAIL_REPLY = (
    "I couldn't process that voice note. Please try sending it again, or type what you said."
)


def _has_audio_payload(
    *,
    audio_url: str | None,
    audio_media_id: str | None,
    audio_bytes: bytes | None,
) -> bool:
    return bool(audio_url or audio_media_id or audio_bytes)


def _coerce_duration(raw) -> float | None:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


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
    audio_duration_seconds: float | None = None,
    media: list[str] | None = None,
    location_lat: float | None = None,
    location_lng: float | None = None,
    flow_response: dict | None = None,
) -> TurnResult | None:
    turn_started = timer_start()
    existing = session.scalar(select(Message.id).where(Message.wa_message_id == wa_message_id))
    if existing is not None:
        return None
    if flow_response is not None:
        # A completed WhatsApp Flow: no model call, the answers are saved in code
        from app.flows.signup import apply_signup_response

        return apply_signup_response(session, phone, flow_response, wa_message_id)
    client = llm or get_llm_client()
    location = None
    if location_lat is not None and location_lng is not None:
        location = (float(location_lat), float(location_lng))
    has_audio = _has_audio_payload(
        audio_url=audio_url,
        audio_media_id=audio_media_id,
        audio_bytes=audio_bytes,
    )
    declared = _coerce_duration(audio_duration_seconds)
    if declared is not None and declared > MAX_VOICE_SECONDS:
        return TurnResult(
            reply_text=VOICE_TOO_LONG_REPLY,
            language="en",
            phase=PatientPhase.FIRST_CONTACT,
        )
    try:
        user_text = transcript_from_audio(
            client,
            text=text,
            audio_url=audio_url,
            audio_media_id=audio_media_id,
            audio_mime=audio_mime,
            audio_bytes=audio_bytes,
            audio_duration_seconds=declared,
        )
    except VoiceTooLongError:
        return TurnResult(
            reply_text=VOICE_TOO_LONG_REPLY,
            language="en",
            phase=PatientPhase.FIRST_CONTACT,
        )
    except GeminiTimeoutError:
        if has_audio:
            return TurnResult(
                reply_text=VOICE_FAIL_REPLY,
                language="en",
                phase=PatientPhase.FIRST_CONTACT,
            )
        return TurnResult(
            reply_text=GEMINI_TIMEOUT_APOLOGY,
            language="en",
            phase=PatientPhase.FIRST_CONTACT,
        )
    except (httpx.HTTPError, OSError, ValueError, KeyError):
        if has_audio:
            logger.exception("voice ingest failed for %s", wa_message_id)
            return TurnResult(
                reply_text=VOICE_FAIL_REPLY,
                language="en",
                phase=PatientPhase.FIRST_CONTACT,
            )
        raise

    if has_audio and not (user_text or "").strip():
        return TurnResult(
            reply_text=VOICE_FAIL_REPLY,
            language="en",
            phase=PatientPhase.FIRST_CONTACT,
        )

    try:
        result = handle_turn(
            session,
            phone,
            user_text,
            client,
            wa_message_id=wa_message_id,
            media=media,
            location=location,
        )
        log_event("inbound.turn_completed", latency_ms=elapsed_ms(turn_started), channel="whatsapp")
        return result
    except (GeminiTimeoutError, httpx.HTTPError, OSError):
        log_event("inbound.provider_recovery", latency_ms=elapsed_ms(turn_started), error_type="transient")
        return provider_unavailable_reply(session, phone, user_text, wa_message_id)
    except Exception:
        # A model-provider validation or availability error must not put a
        # patient message through retry/dead-letter without a WhatsApp reply.
        logger.exception("text triage provider failure for %s", wa_message_id)
        log_event("inbound.provider_recovery", latency_ms=elapsed_ms(turn_started), error_type="unexpected")
        return provider_unavailable_reply(session, phone, user_text, wa_message_id)


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
    logger.warning(
        "joy_inbound_retry",
        extra={"wa_message_id": payload.get("wa_message_id"), "attempts": attempts, "error_type": type(error).__name__},
    )
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
    started = time.monotonic()
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
            audio_duration_seconds=payload.get("audio_duration_seconds"),
            media=_payload_media(payload),
            location_lat=payload.get("location_lat"),
            location_lng=payload.get("location_lng"),
            flow_response=payload.get("flow_response") if isinstance(payload.get("flow_response"), dict) else None,
        )
        if own_session:
            db.commit()
            committed = True
        reply = (
            result.reply_text
            if result is not None
            else _joy_reply_for_wamid(db, payload["wa_message_id"])
        )
        if not reply:
            raise RuntimeError("Joy produced no outbound reply")
        interactive = _interactive_reply(db, payload["phone"], result)
        if interactive:
            send_whatsapp_interactive(payload["phone"], reply, interactive, text_sender=send_whatsapp_text)
        else:
            send_whatsapp_text(payload["phone"], reply)
        _send_after(payload["phone"], result)
        logger.info(
            "joy_outbound_delivered wa_message_id=%s reply_length=%d processing_ms=%d",
            payload["wa_message_id"],
            len(reply),
            int((time.monotonic() - started) * 1000),
        )
        _ack(raw)
        _retry_pending_signup(db, payload["phone"], own_session)
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


def recover_booking_email_processing() -> int:
    """Return email jobs stranded by a worker crash to their source queue.

    ``RPOPLPUSH`` protects a job while a worker is alive, but Redis cannot
    know that a process died after claiming it.  The worker is intentionally
    single-replica; on startup we put those unacknowledged jobs back for a
    retry. Resend's idempotency key makes recovery safe if it had already
    accepted an email before the crash.
    """
    client = _redis()
    recovered = 0
    while client.rpoplpush(BOOKING_EMAIL_PROCESSING_QUEUE, BOOKING_EMAIL_QUEUE):
        recovered += 1
    if recovered:
        logger.warning("recovered %s unacknowledged booking email job(s)", recovered)
    return recovered


def process_booking_email_once(timeout: int = 1) -> bool:
    client = _redis()
    try:
        payload_str = (
            client.brpoplpush(
                BOOKING_EMAIL_QUEUE, BOOKING_EMAIL_PROCESSING_QUEUE, timeout=timeout
            )
            if timeout > 0
            else client.rpoplpush(BOOKING_EMAIL_QUEUE, BOOKING_EMAIL_PROCESSING_QUEUE)
        )
    except TimeoutError:
        return False
    if not payload_str:
        return False
    try:
        payload = json.loads(payload_str)
        subject = str(payload["subject"])
        text = str(payload["text"])
        booking_id = str(payload["booking_id"])
        send_appointment_email(
            str(payload["email"]),
            subject,
            text,
            idempotency_key=appointment_email_idempotency_key(
                booking_id=booking_id, subject=subject, text=text
            ),
        )
    except Exception as exc:
        client.lrem(BOOKING_EMAIL_PROCESSING_QUEUE, 1, payload_str)
        try:
            retry_payload = json.loads(payload_str)
        except json.JSONDecodeError:
            client.lpush(BOOKING_EMAIL_DEAD_LETTER_QUEUE, payload_str)
            logger.exception("booking email payload was invalid")
            return False
        attempts = int(retry_payload.get("attempts") or 0) + 1
        retry_payload["attempts"] = attempts
        if attempts >= MAX_ATTEMPTS:
            client.lpush(BOOKING_EMAIL_DEAD_LETTER_QUEUE, json.dumps(retry_payload))
            logger.error(
                "booking email moved to dead letter queue booking_id=%s attempts=%s error_type=%s",
                retry_payload.get("booking_id"), attempts, type(exc).__name__,
            )
        else:
            client.lpush(BOOKING_EMAIL_QUEUE, json.dumps(retry_payload))
            logger.warning(
                "booking email retry queued booking_id=%s attempts=%s error_type=%s",
                retry_payload.get("booking_id"), attempts, type(exc).__name__,
            )
        return False
    client.lrem(BOOKING_EMAIL_PROCESSING_QUEUE, 1, payload_str)
    return True


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


def process_broadcast_once(timeout: int = 1) -> bool:
    return _drain_text_queue(BROADCAST_QUEUE, timeout=timeout)


def process_takeover_once(timeout: int = 1) -> bool:
    return _drain_text_queue(TAKEOVER_QUEUE, timeout=timeout)


def process_appointment_reminders_once(
    *, now: datetime | None = None, session: Session | None = None
) -> int:
    """Send each due appointment reminder once.

    The schedule is stored in Postgres, so a worker restart cannot silently
    discard reminders. A row is marked sent only after local/WhatsApp delivery
    succeeds; a transient delivery failure remains pending for the next pass.
    """
    own_session = session is None
    db = session or SessionLocal()
    current = now or datetime.now(timezone.utc)
    sent = 0
    try:
        due = db.scalars(
            select(AppointmentReminder)
            .where(
                AppointmentReminder.status == "pending",
                AppointmentReminder.reminder_at <= current,
            )
            .order_by(AppointmentReminder.reminder_at)
            .with_for_update(skip_locked=True)
            .limit(50)
        ).all()
        for reminder in due:
            # A start-time reminder can be delivered within a short grace period
            # because worker polling is not a real-time timer. The 30-minute
            # notice is skipped once the appointment begins.
            deadline = reminder.session_start + timedelta(minutes=5) if reminder.reminder_kind == AT_APPOINTMENT_START else reminder.session_start
            if deadline <= current:
                reminder.status = "skipped"
                append(
                    db,
                    kind=AuditKind.BOOKING,
                    actor_phone="joy-worker",
                    person_id=reminder.patient_id,
                    payload={"event": "appointment_reminder_skipped_late", "booking_id": reminder.rh_booking_id, "reminder_kind": reminder.reminder_kind},
                )
                continue
            try:
                text = appointment_reminder_text(reminder)
                if reminder.whatsapp_sent_at is None:
                    send_whatsapp_text(reminder.phone_e164, text)
                    reminder.whatsapp_sent_at = current
                    # Persist this channel before attempting email. If Resend
                    # is temporarily unavailable, the next pass sends only
                    # the missing email rather than repeating WhatsApp.
                    db.commit()
                if reminder.email and reminder.email_sent_at is None:
                    subject = (
                        "Your Rehabify appointment starts now"
                        if reminder.reminder_kind == AT_APPOINTMENT_START
                        else "Reminder: your Rehabify appointment starts in 30 minutes"
                    )
                    send_appointment_email(
                        reminder.email,
                        subject,
                        text,
                        idempotency_key=appointment_email_idempotency_key(
                            booking_id=reminder.rh_booking_id,
                            subject=subject,
                            text=text,
                            kind="reminder",
                        ),
                    )
                    reminder.email_sent_at = current
                    db.commit()
            except Exception:
                logger.exception("appointment reminder delivery failed for %s", reminder.rh_booking_id)
                continue
            reminder.status = "sent"
            reminder.sent_at = current
            append(
                db,
                kind=AuditKind.BOOKING,
                actor_phone="joy-worker",
                person_id=reminder.patient_id,
                payload={"event": "appointment_reminder_sent", "booking_id": reminder.rh_booking_id, "reminder_kind": reminder.reminder_kind},
            )
            sent += 1
        if own_session:
            db.commit()
        return sent
    except Exception:
        if own_session:
            db.rollback()
        raise
    finally:
        if own_session:
            db.close()


_EXERCISE_TICK_SECONDS = 60
_last_exercise_tick = 0.0


def _exercise_reminders_tick() -> None:
    """Daily exercise reminders (app/exercises/programme.py), checked once a minute."""
    global _last_exercise_tick
    if time.monotonic() - _last_exercise_tick < _EXERCISE_TICK_SECONDS:
        return
    _last_exercise_tick = time.monotonic()
    from app.exercises.programme import process_exercise_reminders_once

    process_exercise_reminders_once()


def _send_after(phone: str, result) -> None:
    """Follow-up messages after the reply (exercise pictures, then buttons). Never fails a turn."""
    for item in getattr(result, "after", None) or []:
        try:
            if item.get("image_url"):
                from app.exercises.media import send_exercise_image

                send_exercise_image(phone, str(item["image_url"]), str(item.get("caption") or ""))
            elif item.get("text"):
                if item.get("interactive"):
                    send_whatsapp_interactive(phone, str(item["text"]), item["interactive"], text_sender=send_whatsapp_text)
                else:
                    send_whatsapp_text(phone, str(item["text"]))
        except Exception:
            logger.warning("joy_followup_message_failed", exc_info=True)


def _retry_pending_signup(db, phone: str, own_session: bool) -> None:
    """Form answers that couldn't reach Rehabify earlier get another try (never fails a turn)."""
    try:
        from app.flows.signup import sync_pending_signup

        if sync_pending_signup(db, phone) and own_session:
            db.commit()
    except Exception:
        logger.warning("joy_signup_retry_skipped", exc_info=True)
        if own_session:
            db.rollback()


def _interactive_reply(db, phone: str, result) -> dict | None:
    """Tap-to-answer buttons for the step this reply asks about (never on safety replies)."""
    if result is None or getattr(result, "blocked_by_safety", False):
        return None
    if getattr(result, "interactive", None):
        return result.interactive
    try:
        from app.conversation.interactive import interactive_for_phone

        return interactive_for_phone(db, phone)
    except Exception:  # Buttons are a convenience: never block or fail the reply over them.
        logger.warning("joy_interactive_lookup_failed", exc_info=True)
        return None


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


def _wait_for_redis(*, retry_seconds: int = 5) -> None:
    """Block until the queue service is available instead of crashing workers."""
    while True:
        try:
            _redis().ping()
            return
        except RedisConnectionError:
            logger.warning(
                "Redis is unavailable; retrying worker connection in %s seconds",
                retry_seconds,
            )
            time.sleep(retry_seconds)


def _code_schema_head() -> str | None:
    """The newest Alembic revision this code expects (None if it can't be read)."""
    from pathlib import Path

    from alembic.config import Config
    from alembic.script import ScriptDirectory

    backend = Path(__file__).resolve().parents[2]
    config = Config(str(backend / "alembic.ini"))
    config.set_main_option("script_location", str(backend / "alembic"))
    return ScriptDirectory.from_config(config).get_current_head()


def wait_for_schema(*, max_wait_seconds: int = 300, retry_seconds: int = 5) -> bool:
    """Wait until the database is migrated to this code's revision.

    The API service runs the migrations before it starts; the worker can come up first on the
    same deploy, and new columns would then be missing for a few seconds. Gives up (and carries
    on) after max_wait_seconds, so a stuck migration never stops message delivery entirely.
    """
    from sqlalchemy import text

    try:
        head = _code_schema_head()
    except Exception:
        logger.warning("joy_schema_head_unknown", exc_info=True)
        return False
    deadline = time.monotonic() + max_wait_seconds
    while True:
        try:
            with SessionLocal() as db:
                current = db.execute(text("select version_num from alembic_version")).scalar()
            if current == head:
                return True
        except Exception:
            current = None
        if time.monotonic() >= deadline:
            logger.warning("joy_schema_not_current current=%s head=%s", current, head)
            return False
        logger.info("joy_waiting_for_migrations current=%s head=%s", current, head)
        time.sleep(retry_seconds)


def run_forever(timeout: int = 5) -> None:
    wait_for_schema()
    while True:
        _wait_for_redis()
        try:
            recover_booking_email_processing()
            break
        except RedisConnectionError:
            # Redis may disappear between the readiness check and startup
            # recovery. Re-enter the same controlled retry path rather than
            # terminating the process.
            logger.warning("Redis disconnected during worker startup recovery")
            time.sleep(1)
    while True:
        try:
            _redis().ping()
        except RedisConnectionError:
            _wait_for_redis()
            continue
        try:
            process_appointment_reminders_once()
        except Exception:
            logger.exception("appointment reminder job failed")
        try:
            _exercise_reminders_tick()
        except Exception:
            logger.exception("exercise reminder job failed")
        try:
            process_booking_confirmed_once(timeout=0)
        except Exception:
            logger.exception("booking_confirmed job failed")
        try:
            process_booking_email_once(timeout=0)
        except Exception:
            logger.exception("booking email job failed")
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
            process_broadcast_once(timeout=0)
        except Exception:
            logger.exception("broadcast job failed")
        try:
            process_takeover_once(timeout=0)
        except Exception:
            logger.exception("takeover job failed")
        try:
            process_queue_once(timeout=timeout)
        except Exception:
            logger.exception("inbound job failed")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    logger.info("Joy inbound worker starting")
    run_forever()
