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
    format_lagos_appointment_time,
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
            details = _event_appointment_details(_appointment_details(booking_id, rh_patient_id), data)
            email = _appointment_email(session, patient)
            _schedule_reminder_from_details(session, booking_id, patient, details, email=email)
            conversation = _patient_conversation(session, patient)
            # The meeting-link event can arrive first for an online booking.
            # In that case it has already supplied the complete confirmation.
            if not data.get("defer_patient_notification") and not _has_notified_meeting_link(conversation, booking_id):
                text = (
                    appointment_confirmation_text(**details)
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
            # RH issues the receipt with the payment (Payment Policy 7).
            receipt_url = str(data.get("receipt_url") or "").strip()
            if receipt_url.startswith("https://"):
                text += f"\n\nYour receipt: {receipt_url}"
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
            details = _event_appointment_details(_appointment_details(
                booking_id,
                rh_patient_id,
                fallback_start_ms=data.get("start_time"),
            ), data)
            email = _appointment_email(session, patient)
            _schedule_reminder_from_details(session, booking_id, patient, details, email=email)
            enqueue_booking_confirmed(
                patient.phone_e164,
                booking_id,
                (
                    appointment_confirmation_text(
                        **details
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
            details = _event_appointment_details(
                _appointment_details(booking_id, rh_patient_id, fallback_start_ms=data.get("start_time")), data
            )
            email = _appointment_email(session, patient)
            _schedule_reminder_from_details(session, booking_id, patient, details, email=email)
            text = (
                appointment_rescheduled_text(**details)
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
    elif event_type == "patient.dashboard_ready":
        _send_dashboard_link(session, payload.get("data") or {})
    elif event_type == "booking.provider_response_requested":
        _nudge_physio(session, payload.get("data") or {})
    elif event_type == "booking.cancelled":
        _booking_cancelled(session, payload.get("data") or {})
    elif event_type == "outcome.requested":
        _outcome_requested(session, payload.get("data") or {})
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
            enqueue_booking_confirmed(
                patient.phone_e164,
                str(data.get("review_id") or ""),
                "Your ₦6,000 specialist review payment has been verified. RH will assign an eligible reviewer and I’ll send the review details here.",
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
        "booking_code": _short_booking_code(status.get("booking_code")),
        "meeting_url": _safe_meeting_url(status.get("meeting_url")),
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


def _patient_for_rh(session: Session, rh_patient_id: str) -> Patient | None:
    mapping = session.scalar(select(RHIdentityMapping).where(
        RHIdentityMapping.persona == "patient", RHIdentityMapping.rh_record_id == rh_patient_id,
    )) if rh_patient_id else None
    return session.get(Patient, mapping.joy_person_id) if mapping else None


def dashboard_link_text(url: str) -> str:
    return (
        f"Your Rehabify dashboard is ready: {url}\n\n"
        "It has your appointments, receipts and care plan. The link signs you in on this phone, "
        "so please don't share it. Ask me for a new link any time."
    )


def _send_dashboard_link(session: Session, data: dict) -> None:
    """RH made the patient's dashboard login after payment: send the one-tap link."""
    patient = _patient_for_rh(session, str(data.get("patient_id") or ""))
    url = str(data.get("dashboard_url") or "").strip()
    if patient is None or not url.startswith("https://"):
        return
    enqueue_booking_confirmed(patient.phone_e164, str(data.get("booking_id") or ""), dashboard_link_text(url))
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
           payload={"event": "dashboard_link_sent", "booking_id": str(data.get("booking_id") or "")})


_MODES = {"home_visit": "home visit", "online": "online session", "clinic": "clinic session"}


def physio_request_text(data: dict) -> str | None:
    booking_id = str(data.get("booking_id") or "").strip()
    if not booking_id or len(booking_id) > 64:
        return None
    who = str(data.get("patient_first_name") or "").strip()[:40] or "A patient"
    what = _MODES.get(str(data.get("service_mode") or ""), "session")
    when = ""
    if isinstance(data.get("start_time"), (int, float)):
        when = f" on {format_lagos_appointment_time(appointment_start_from_ms(data['start_time']))}"
    where = str(data.get("area") or "").strip()[:60]
    due = ""
    if isinstance(data.get("provider_response_due_at"), (int, float)):
        due = f" by {format_lagos_appointment_time(appointment_start_from_ms(data['provider_response_due_at']))}"
    code = _short_booking_code(data.get("booking_code"))
    return (
        f"New paid Rehabify booking{f' {code}' if code else ''}: {who}, {what}{when}{f' in {where}' if where else ''}.\n\n"
        f"Please reply ACCEPT {booking_id} or REJECT {booking_id}{due}. "
        "If you don't answer in time, we'll offer the patient another physiotherapist."
    )


def _nudge_physio(session: Session, data: dict) -> None:
    """A paid booking waits for the physio: ask them on WhatsApp (RH also sends push and email)."""
    phone = str(data.get("physiotherapist_phone") or "").strip()
    text = physio_request_text(data)
    if not text or not phone.startswith("+") or not phone[1:].isdigit():
        return
    enqueue_booking_confirmed(phone, str(data.get("booking_id") or ""), text)
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=None,
           payload={"event": "physio_response_requested_on_whatsapp", "booking_id": str(data.get("booking_id") or "")})


def booking_cancelled_text(data: dict) -> str:
    code = _short_booking_code(data.get("booking_code"))
    when = ""
    if isinstance(data.get("start_time"), (int, float)):
        when = f" on {format_lagos_appointment_time(appointment_start_from_ms(data['start_time']))}"
    which = f"Your appointment{f' {code}' if code else ''}{when}"
    by = str(data.get("cancelled_by") or "")
    if by == "system" and not data.get("paid"):
        return (
            f"{which} wasn't paid for in time, so the time has been released. "
            "If you'd still like to book, tell me and I'll find you a new time."
        )
    if by == "patient":
        text = f"{which} has been cancelled as you asked."
    else:
        text = f"I'm sorry, {which[0].lower()}{which[1:]} has been cancelled by our care team."
    refund = str(data.get("refund_status") or "")
    if refund in {"pending", "processing", "approved"}:
        text += " Your refund is being processed, and you'll get a message when it's sent."
    elif refund == "refunded":
        text += " Your payment has been refunded."
    elif data.get("paid"):
        text += " If you paid, our care team will contact you about your payment under our cancellation policy."
    return text + " Reply here if you'd like to book another time."


def _booking_cancelled(session: Session, data: dict) -> None:
    """RH cancelled a booking (patient, physio, care team or an expired hold)."""
    from app.models.appointment_reminder import AppointmentReminder

    booking_id = str(data.get("booking_id") or "")
    if not booking_id:
        return
    for reminder in session.scalars(select(AppointmentReminder).where(
        AppointmentReminder.rh_booking_id == booking_id, AppointmentReminder.status == "pending",
    )):
        reminder.status = "cancelled"
    patient = _patient_for_rh(session, str(data.get("patient_id") or ""))
    if patient is None:
        return
    conversation = _patient_conversation(session, patient)
    if conversation is not None and (conversation.booking_context or {}).get("rh_booking_id") == booking_id:
        context = dict(conversation.booking_context or {})
        context["rh_booking_status"] = "cancelled"
        conversation.booking_context = context
        if conversation.booking_substate in {"rh_awaiting_payment_email", "rh_awaiting_payment"}:
            conversation.booking_substate = None
    if data.get("notify_patient", True):
        enqueue_booking_confirmed(patient.phone_e164, booking_id, booking_cancelled_text(data), email=_appointment_email(session, patient))
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
           payload={"event": "booking_cancelled_disclosed", "booking_id": booking_id, "cancelled_by": str(data.get("cancelled_by") or "")})


# lib/outcomes/moments.ts OutcomeMoment
_OUTCOME_MOMENTS = {
    "intake": "before your treatment starts",
    "pre_session": "before your next session",
    "post_session": "after your session",
    "check_in": "on how you're getting on",
    "discharge": "at the end of your treatment",
}


def _outcome_requested(session: Session, data: dict) -> None:
    """The physio's progress check-in (a short form): send its link on WhatsApp."""
    patient = _patient_for_rh(session, str(data.get("patient_id") or ""))
    url = str(data.get("url") or "").strip()
    if patient is None or not url.startswith("https://"):
        return
    physio = str(data.get("physio_name") or "").strip()[:60] or "Your physiotherapist"
    when = _OUTCOME_MOMENTS.get(str(data.get("moment") or ""), "")
    text = (
        f"📋 {physio} would like a quick progress check-in{f' {when}' if when else ''}. "
        f"It takes about 2 minutes and helps them plan your care:\n{url}"
    )
    enqueue_booking_confirmed(patient.phone_e164, "", text)
    append(session, kind=AuditKind.TRIAGE, actor_phone="rh-service", person_id=patient.id,
           payload={"event": "outcome_check_sent", "moment": str(data.get("moment") or "")})


def _short_booking_code(value: object) -> str | None:
    """Use only RH's patient-facing booking code; never disclose aggregate IDs."""
    code = str(value or "").strip()
    return code if 1 <= len(code) <= 32 else None


def _safe_meeting_url(value: object) -> str | None:
    url = str(value or "").strip()
    return url if url.startswith("https://") else None


def _event_appointment_details(details: dict | None, data: dict) -> dict | None:
    """Prefer signed RH event values when they accompany an appointment lookup."""
    if details is None:
        return None
    resolved = dict(details)
    event_code = _short_booking_code(data.get("booking_code"))
    event_url = _safe_meeting_url(data.get("meeting_url"))
    if event_code:
        resolved["booking_code"] = event_code
    if event_url:
        resolved["meeting_url"] = event_url
    return resolved


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
