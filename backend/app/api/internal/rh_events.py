import hashlib
import hmac
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.config import Settings, get_settings
from app.db import get_session
from app.models.rh_integration_event import RHIntegrationEvent
from app.models.types import AuditKind
from app.models.rh_identity_mapping import RHIdentityMapping
from app.models.patient import Patient
from app.queue.tasks import enqueue_booking_confirmed
from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
from app.models.conversation import Conversation
from app.models.types import ConversationStage, PatientPhase
from app.booking.appointment_reminders import (
    appointment_confirmation_text,
    appointment_rescheduled_text,
    appointment_start_from_ms,
    schedule_appointment_reminder,
)

router = APIRouter(prefix="/api/integrations/rh", tags=["rh-integration"])


@router.post("/events")
async def receive_event(request: Request, settings: Settings = Depends(get_settings), session: Session = Depends(get_session)) -> dict:
    body = await request.body()
    timestamp = request.headers.get("X-RH-Event-Timestamp", "")
    signature = request.headers.get("X-RH-Event-Signature", "")
    try:
        if abs(datetime.now(timezone.utc).timestamp() - int(timestamp)) > 300:
            raise ValueError
    except ValueError:
        raise HTTPException(status_code=401, detail="stale RH event")
    try:
        payload = await request.json()
        event_id = str(payload["event_id"])
        event_type = str(payload["event_type"])
    except (ValueError, KeyError, TypeError):
        raise HTTPException(status_code=400, detail="invalid RH event")
    expected = hmac.new(settings.rh_event_hmac_secret.encode(), "\n".join([timestamp, event_id, body.decode("utf-8")]).encode(), hashlib.sha256).hexdigest()
    if not settings.rh_event_hmac_secret or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="invalid RH event signature")
    if session.scalar(select(RHIntegrationEvent.id).where(RHIntegrationEvent.event_id == event_id)) is not None:
        return {"accepted": True, "duplicate": True}
    session.add(RHIntegrationEvent(event_id=event_id, event_type=event_type, payload_sha256=hashlib.sha256(body).hexdigest(), payload=payload))
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=None, payload={"event": "rh_event_received", "event_id": event_id, "event_type": event_type})
    session.flush()
    if event_type == "booking.confirmed":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient:
            booking_id = str(data.get("booking_id") or "")
            _mark_rh_booking_confirmed(session, patient, booking_id)
            details = _appointment_details(booking_id, rh_patient_id)
            email = _appointment_email(session, patient)
            _schedule_reminder_from_details(session, booking_id, patient, details, email=email)
            conversation = _patient_conversation(session, patient)
            # The meeting-link event can arrive first for an online booking.
            # In that case it has already supplied the complete confirmation.
            if not data.get("defer_patient_notification") and not _has_notified_meeting_link(conversation, booking_id):
                text = (
                    appointment_confirmation_text(**details, booking_code=booking_id)
                    if details is not None
                    else "Your appointment is confirmed. I’ll send your appointment details here."
                )
                enqueue_booking_confirmed(patient.phone_e164, booking_id, text, email=email)
    elif event_type == "booking.payment_confirmed":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient:
            booking_id = str(data.get("booking_id") or "")
            conversation = _patient_conversation(session, patient)
            context = dict(conversation.booking_context or {}) if conversation else {}
            if context.get("rh_booking_id") == booking_id:
                context["rh_payment_status"] = "succeeded"
                if conversation is not None:
                    conversation.booking_context = context
            if context.get("booking_route") == "admin_scheduled_virtual":
                text = (
                    "Your payment has been received. Our care team will assign your clinician, date, and time shortly. "
                    "I’ll send your appointment details and joining link here once that is done."
                )
            else:
                text = "Your payment has been received. I’ll confirm the appointment here after the specialist accepts it."
            enqueue_booking_confirmed(patient.phone_e164, booking_id, text, email=_appointment_email(session, patient))
    elif event_type == "booking.payment_failed":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient:
            booking_id = str(data.get("booking_id") or "")
            conversation = _patient_conversation(session, patient)
            context = dict(conversation.booking_context or {}) if conversation else {}
            email = _appointment_email(session, patient)
            if context.get("rh_booking_id") == booking_id and conversation is not None:
                context.pop("authorization_url", None)
                context["rh_payment_status"] = "failed"
                context["payment_retry_count"] = int(context.get("payment_retry_count") or 0) + 1
                conversation.booking_context = context
                conversation.booking_substate = "rh_awaiting_payment_email"
            text = (
                "We couldn’t complete your payment, so your appointment has not been confirmed. "
                "Please reply with your email address to receive a new secure payment link."
            )
            enqueue_booking_confirmed(
                patient.phone_e164,
                booking_id,
                text,
                email=email,
                email_subject="Your Rehabify payment needs attention",
            )
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "payment_failed_disclosed", "booking_id": booking_id})
    elif event_type == "booking.meeting_link_ready":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        meeting_url = str(data.get("meeting_url") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient and meeting_url.startswith("https://"):
            booking_id = str(data.get("booking_id") or "")
            details = _appointment_details(
                booking_id,
                rh_patient_id,
                fallback_start_ms=data.get("start_time"),
            )
            email = _appointment_email(session, patient)
            _schedule_reminder_from_details(session, booking_id, patient, details, email=email)
            enqueue_booking_confirmed(
                patient.phone_e164,
                booking_id,
                (
                    appointment_confirmation_text(
                        **details, booking_code=booking_id, meeting_url=meeting_url
                    )
                    if details is not None
                    else f"Your online appointment is ready. Join securely here: {meeting_url}"
                ),
                email=email,
            )
            _mark_meeting_link_notified(session, patient, booking_id)
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "online_meeting_link_disclosed", "booking_id": booking_id, "platform": data.get("platform")})
    elif event_type == "booking.rescheduled":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient:
            booking_id = str(data.get("booking_id") or "")
            details = _appointment_details(booking_id, rh_patient_id, fallback_start_ms=data.get("start_time"))
            email = _appointment_email(session, patient)
            _schedule_reminder_from_details(session, booking_id, patient, details, email=email)
            text = (
                appointment_rescheduled_text(**details, booking_code=booking_id)
                if details is not None
                else "Your appointment has been rescheduled. I’ll send the updated details here shortly."
            )
            enqueue_booking_confirmed(patient.phone_e164, booking_id, text, email=email)
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "appointment_rescheduled_disclosed", "booking_id": booking_id})
    elif event_type == "booking.meeting_link_failed":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient:
            enqueue_booking_confirmed(
                patient.phone_e164,
                str(data.get("booking_id") or ""),
                "Your online appointment is confirmed, but the joining link is still being prepared. Our care team will send it here shortly.",
            )
    elif event_type == "booking.provider_rejected":
        _prepare_replacement(session, payload.get("data") or {})
    elif event_type == "physio.patient_message":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        message = str(data.get("message") or "").strip()
        mapping = session.scalar(select(RHIdentityMapping).where(
            RHIdentityMapping.persona == "patient", RHIdentityMapping.rh_record_id == rh_patient_id,
        ))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient and message and len(message) <= 2000:
            enqueue_booking_confirmed(patient.phone_e164, str(data.get("booking_id") or ""), f"Message from your physiotherapist: {message}")
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "physio_patient_message_disclosed", "booking_id": str(data.get("booking_id") or "")})
    elif event_type == "specialist_review.payment_confirmed":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient:
            assigned = str(data.get("assignment_status") or "") == "assigned"
            enqueue_booking_confirmed(
                patient.phone_e164,
                str(data.get("review_id") or ""),
                "Your ₦6,000 specialist review payment has been verified. RH has assigned an eligible reviewer and I’ll send the review details here."
                if assigned else
                "Your ₦6,000 specialist review payment has been verified. RH is assigning an eligible reviewer and I’ll send the review details here.",
            )
    return {"accepted": True, "duplicate": False}


def _patient_conversation(session: Session, patient: Patient) -> Conversation | None:
    return session.scalar(select(Conversation).where(
        Conversation.person_id == patient.id, Conversation.persona == "patient",
    ))


def _has_notified_meeting_link(conversation: Conversation | None, booking_id: str) -> bool:
    return bool(conversation and (conversation.booking_context or {}).get("rh_meeting_link_notified") == booking_id)


def _mark_meeting_link_notified(session: Session, patient: Patient, booking_id: str) -> None:
    conversation = _patient_conversation(session, patient)
    if conversation is None:
        return
    context = dict(conversation.booking_context or {})
    context["rh_meeting_link_notified"] = booking_id
    conversation.booking_context = context


def _mark_rh_booking_confirmed(session: Session, patient: Patient, booking_id: str) -> None:
    conversation = _patient_conversation(session, patient)
    if conversation is None:
        return
    context = dict(conversation.booking_context or {})
    if context.get("rh_booking_id") != booking_id:
        return
    context["rh_booking_status"] = "confirmed"
    conversation.booking_context = context
    conversation.booking_substate = None
    conversation.phase = PatientPhase.POST_TRIAGE
    conversation.stage = ConversationStage.BOOKING_CONFIRMED.value


def _appointment_email(session: Session, patient: Patient) -> str | None:
    conversation = _patient_conversation(session, patient)
    raw = (conversation.booking_context or {}).get("payment_email") if conversation else None
    if not isinstance(raw, str):
        return None
    email = raw.strip().casefold()
    return email if "@" in email and "." in email.rsplit("@", 1)[-1] else None


def _appointment_details(
    booking_id: str,
    rh_patient_id: str,
    *,
    fallback_start_ms: object | None = None,
) -> dict | None:
    if not booking_id or not rh_patient_id:
        return None
    try:
        status = configured_rh_client().booking_status(booking_id, patient_id=rh_patient_id)
    except RHIntegrationError:
        status = {}
    start_ms = status.get("session_start")
    if not isinstance(start_ms, (int, float)):
        start_ms = fallback_start_ms
    if not isinstance(start_ms, (int, float)):
        return None
    provider = status.get("provider")
    provider_name = provider.get("display_name") if isinstance(provider, dict) else None
    duration = status.get("duration_minutes")
    return {
        "provider_name": str(provider_name or "your physiotherapist"),
        "session_start": appointment_start_from_ms(start_ms),
        "duration_minutes": int(duration) if isinstance(duration, (int, float)) and duration > 0 else 60,
        "service_mode": str(status.get("service_mode") or "online"),
    }


def _schedule_reminder_from_details(
    session: Session,
    booking_id: str,
    patient: Patient,
    details: dict | None,
    *,
    email: str | None,
) -> None:
    if not booking_id or details is None:
        return
    schedule_appointment_reminder(
        session, rh_booking_id=booking_id, patient=patient, email=email, **details
    )
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
           payload={"event": "appointment_reminders_scheduled", "booking_id": booking_id,
                    "reminder_at": (details["session_start"] - timedelta(minutes=30)).isoformat(),
                    "start_reminder_at": details["session_start"].isoformat()})


def _prepare_replacement(session: Session, data: dict) -> None:
    """Present verified replacement slots after RH rejects or times out a paid Joy booking."""
    booking_id = str(data.get("booking_id") or "")
    rh_patient_id = str(data.get("patient_id") or "")
    if not booking_id or not rh_patient_id:
        return
    mapping = session.scalar(select(RHIdentityMapping).where(
        RHIdentityMapping.persona == "patient", RHIdentityMapping.rh_record_id == rh_patient_id,
    ))
    patient = session.get(Patient, mapping.joy_person_id) if mapping else None
    if patient is None:
        return
    try:
        client = configured_rh_client()
        actor = RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id)
        candidates = client.replacement_candidates(booking_id, patient_id=rh_patient_id, actor=actor)
        now = datetime.now(timezone.utc)
        choices: list[dict] = []
        for candidate in candidates:
            availability = client.availability(
                candidate.physiotherapist_id, start_ms=int(now.timestamp() * 1000),
                end_ms=int((now.timestamp() + 7 * 24 * 3600) * 1000), duration_minutes=60,
                service_mode=(candidate.service_modes or ["clinic"])[0],
            )
            for slot in (availability.get("slots") or [])[:3]:
                if isinstance(slot, dict) and isinstance(slot.get("start"), (int, float)):
                    choices.append({"physiotherapist_id": candidate.physiotherapist_id, "display_name": candidate.display_name, "slot_start": int(slot["start"])})
        conversation = session.scalar(select(Conversation).where(
            Conversation.person_id == patient.id, Conversation.persona == "patient",
        ))
        if not choices:
            # RH retains a durable, deduplicated admin follow-up record. The
            # patient gets an honest update rather than an invented provider.
            from app.integrations.rh_client import RHIntegrationError
            enqueue_booking_confirmed(patient.phone_e164, booking_id, "The specialist could not take this appointment, and there is no suitable replacement slot available yet. Our care team will contact you about next steps or a refund.")
            return
        if conversation is None:
            return
        ctx = dict(conversation.booking_context or {})
        ctx.update({"rh_booking_id": booking_id, "rh_patient_id": rh_patient_id, "replacement_choices": choices})
        conversation.booking_substate = "rh_awaiting_replacement"
        conversation.booking_context = ctx
        lines = ["Your specialist could not take the appointment. I found these replacement times:"]
        for index, choice in enumerate(choices, 1):
            display = datetime.fromtimestamp(choice["slot_start"] / 1000, timezone.utc).strftime("%a %d %b, %I:%M %p")
            lines.append(f"{index}. {choice.get('display_name') or 'Physiotherapist'} — {display}")
        lines.append("Reply with the time number you prefer.")
        enqueue_booking_confirmed(patient.phone_e164, booking_id, "\n".join(lines))
    except RHIntegrationError:
        return
