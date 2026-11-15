import hashlib
import hmac
import logging
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
from app.queue.tasks import enqueue_booking_confirmed, enqueue_notify_admin_escalation
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
                booked_context = (conversation.booking_context or {}) if conversation is not None else {}
                receipt = booked_context.get("receipt_url") if booked_context.get("rh_booking_id") == booking_id else None
                text = (
                    appointment_confirmation_text(**details, receipt_url=receipt if isinstance(receipt, str) else None)
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
            receipt_link = str(data.get("receipt_url") or "").strip()
            if context.get("rh_booking_id") == booking_id and receipt_link.startswith("https://") and conversation is not None:
                context["receipt_url"] = receipt_link  # repeated in the booked message
                conversation.booking_context = context
            if data.get("slot_unavailable"):
                # Paid after the 30-minute hold ran out, and the time was taken meanwhile (RH then
                # sends booking.provider_rejected, and Joy offers other times)
                text = (
                    "Payment received ✅ Thank you.\n\nThe time you chose was booked by someone else while "
                    "you were paying, so I'm finding you another time now. If none suits you, you'll get a full refund."
                )
            elif context.get("booking_route") == "admin_scheduled_virtual":
                text = (
                    "Your payment has been received. Our care team will assign your clinician, date, and time shortly. "
                    "I’ll send your appointment details and joining link here once that is done."
                )
            elif context.get("booking_route") == "named_online" and context.get("rh_booking_id") == booking_id:
                from app.booking.booking_flow import named_payment_received_text

                text = named_payment_received_text(context, data.get("provider_response_due_at"))
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
            # Someone who chose "WhatsApp is fine" isn't asked for an email now
            text = (
                "We couldn’t complete your payment, so your appointment has not been confirmed. "
                + (
                    "Reply PAY to get a new secure payment link."
                    if context.get("receipt_by") == "whatsapp"
                    else "Reply with your email address, or WhatsApp is fine, to get a new secure payment link."
                )
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
    elif event_type == "programme.sent":
        # A physio sent, added to or changed a home programme (RH helpers/joyEvents.queueJoyProgrammeSent)
        data = payload.get("data") or {}
        patient = _patient_for_rh_id(session, str(data.get("patient_id") or ""))
        if patient:
            text = programme_sent_text(data, reminders_on=patient.exercise_reminders == "on")
            enqueue_booking_confirmed(patient.phone_e164, "", text)
            from app.conversation.companion import forget_care_summary

            forget_care_summary(_patient_conversation(session, patient))
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "programme_sent_notified", "change": str(data.get("change") or "")})
    elif event_type == "appointment.rescheduled":
        _appointment_rescheduled(session, payload.get("data") or {})
    elif event_type == "appointment.cancelled":
        _appointment_cancelled(session, payload.get("data") or {})
    elif event_type == "booking.payment_reminder":
        _hold_nudge(session, payload.get("data") or {}, expired=False)
    elif event_type == "booking.hold_expired":
        _hold_nudge(session, payload.get("data") or {}, expired=True)
    elif event_type == "appointment.scheduled":
        # A physio or clinic booked a visit for a patient on Joy (RH queueJoyAppointmentScheduled)
        data = payload.get("data") or {}
        patient = _patient_for_rh_id(session, str(data.get("patient_id") or ""))
        if patient:
            enqueue_booking_confirmed(patient.phone_e164, "", appointment_scheduled_text(data))
            # The same day-before, 30-minute and start reminders as Joy's own bookings (Nov 2026)
            _schedule_visit_reminders(session, patient, data)
            from app.conversation.companion import forget_care_summary

            forget_care_summary(_patient_conversation(session, patient))
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "appointment_scheduled_notified"})
    elif event_type == "visit.on_the_way":
        # A home-visit physio tapped "On my way" (RH homeVisitSafety.startVisit): who is coming + the door code
        data = payload.get("data") or {}
        patient = _patient_for_rh_id(session, str(data.get("patient_id") or ""))
        if patient:
            enqueue_booking_confirmed(patient.phone_e164, "", visit_on_the_way_text(data))
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "visit_on_the_way_notified"})
    elif event_type == "safety.notify":
        # Home-visit safety (RH homeVisitSafety.ts): "Are you OK?" to a physio, or an alert to the care team
        data = payload.get("data") or {}
        recipients = safety_recipients(data.get("recipients"))
        text = str(data.get("text") or "").strip()[:1500]
        if text:
            for phone in recipients:
                enqueue_notify_admin_escalation(phone, text)
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=None,
                   payload={"event": "safety_notified", "recipients": len(recipients)})
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


def _patient_for_rh_id(session: Session, rh_patient_id: str) -> Patient | None:
    """The Joy patient for an RH record: their current record, or one they used before linking (alias)."""
    if not rh_patient_id:
        return None
    mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
    return session.get(Patient, mapping.joy_person_id) if mapping else None


def _short(value: object, limit: int) -> str:
    text = " ".join(str(value or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def programme_sent_text(data: dict, *, reminders_on: bool) -> str:
    sender = _short(data.get("sender_name"), 80) or "Your physiotherapist"
    title = _short(data.get("title"), 80) or "your exercises"
    change = str(data.get("change") or "new")
    if change == "added":
        what = _short(data.get("what"), 40) or "exercises"
        lead = f"🏋️ {sender} added {what} to *{title}*."
    elif change == "updated":
        lead = f"🏋️ {sender} updated your home programme: *{title}*."
    else:
        lead = f"🏋️ {sender} sent you a new home programme: *{title}*."
    lines = [lead, "", "Reply *my exercises* to see it, with a 3D demo of each exercise."]
    if not reminders_on:
        lines.append("Want a daily reminder? Reply *remind me at 7am* (or any time that suits you).")
    return "\n".join(lines)


def appointment_scheduled_text(data: dict) -> str:
    physio = _short(data.get("physio_name"), 80) or "Your physiotherapist"
    start = data.get("start_time")
    when = format_lagos_appointment_time(appointment_start_from_ms(start)) if isinstance(start, (int, float)) else "soon"
    visits = int(data.get("visits") or 1)
    lead = f"📅 {physio} booked your next visit for {when}{' (video call)' if data.get('online') else ''}."
    if visits > 1:
        lead += f" That's the first of {visits} visits."
    lines = [lead]
    if data.get("pay_to_confirm"):
        lines.append("Please pay within 24 hours to confirm it. Reply *dashboard link* and I'll send you a link to pay.")
    lines.append("If the time doesn't suit you, tell me here and I'll pass it on.")
    return "\n".join(lines)


def visit_on_the_way_text(data: dict) -> str:
    name = _short(data.get("physio_name"), 80) or "Your physiotherapist"
    first = _short(data.get("physio_first_name"), 40) or name
    code = "".join(ch for ch in str(data.get("door_code") or "") if ch.isdigit())[:6]
    start = data.get("start_time")
    when = f" at {format_lagos_appointment_time(appointment_start_from_ms(start))}" if isinstance(start, (int, float)) else ""
    page = str(data.get("page_url") or "")
    lines = [f"🚪 {name} is on the way for your home visit{when}."]
    if page.startswith("https://"):
        lines += ["", f"Before you open the door, check {first}'s photo here: {page}"]
    licence = _short(data.get("licence_number"), 40)
    if licence:
        lines.append(f"Physiotherapy licence number: {licence}")
    if code:
        lines += ["", f"When it's really {first}, give them this code: *{code}*"]
    lines += ["", "Only give the code to the person in the photo. If someone else comes, don't let them in, and message me here."]
    return "\n".join(lines)


def safety_recipients(value: object) -> list[str]:
    """E.164 numbers only ('+' and 8-15 digits), at most 10, no repeats."""
    if not isinstance(value, list):
        return []
    phones: list[str] = []
    for item in value:
        phone = str(item or "").strip()
        if phone.startswith("+") and phone[1:].isdigit() and 8 <= len(phone) - 1 <= 15 and phone not in phones:
            phones.append(phone)
    return phones[:10]


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


logger = logging.getLogger(__name__)


def _self_referral_summary(session: Session, booking_id: str) -> str | None:
    """The pre-appointment summary Joy wrote for this booking (app/triage/self_referral.py)."""
    if not booking_id:
        return None
    try:
        conversation = session.scalar(
            select(Conversation).where(Conversation.booking_context["rh_booking_id"].astext == booking_id)
        )
    except Exception:
        logger.warning("joy_physio_summary_lookup_failed", exc_info=True)
        return None
    summary = ((conversation.booking_context or {}).get("self_referral") or {}).get("physio_summary") if conversation else None
    return summary if isinstance(summary, str) and summary.strip() else None


def _nudge_physio(session: Session, data: dict) -> None:
    """A paid booking waits for the physio: ask them on WhatsApp (RH also sends push and email)."""
    phone = str(data.get("physiotherapist_phone") or "").strip()
    text = physio_request_text(data)
    if not text or not phone.startswith("+") or not phone[1:].isdigit():
        return
    summary = _self_referral_summary(session, str(data.get("booking_id") or ""))
    if summary:
        # The physio reads the triage before accepting; they keep full clinical responsibility
        text = f"{text}\n\n{summary}"
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


# ── Visits changed on the website (convex/joySync.ts), and holds about to lapse ────────────────

def _visit_key(data: dict) -> str:
    """Reminders for a Joy booking are keyed by its booking id; other visits by the appointment."""
    return str(data.get("booking_id") or "") or f"appt-{data.get('appointment_id')}"


def _visit_reminders(session: Session, key: str) -> list:
    from app.models.appointment_reminder import AppointmentReminder

    return list(session.scalars(select(AppointmentReminder).where(AppointmentReminder.rh_booking_id == key)).all())


def _schedule_visit_reminders(session: Session, patient: Patient, data: dict) -> None:
    start_ms, end_ms = data.get("start_time"), data.get("end_time")
    if not isinstance(start_ms, (int, float)):
        return
    key = _visit_key(data)
    known = _visit_reminders(session, key)
    previous = known[0] if known else None
    online = bool(data.get("online"))
    duration = int((end_ms - start_ms) / 60_000) if isinstance(end_ms, (int, float)) and end_ms > start_ms else 60
    schedule_appointment_reminder(
        session, rh_booking_id=key, patient=patient, email=_appointment_email(session, patient),
        provider_name=str(data.get("physio_name") or (previous.provider_name if previous else "your physiotherapist")),
        # A Joy booking's reminders keep their mode, code and joining link
        service_mode=previous.service_mode if previous else ("online" if online else "clinic" if data.get("clinic_name") else "in_person"),
        session_start=appointment_start_from_ms(start_ms), duration_minutes=max(5, duration),
        booking_code=previous.booking_code if previous else None, meeting_url=previous.meeting_url if previous else None,
    )


def _appointment_rescheduled(session: Session, data: dict) -> None:
    """A visit was moved on the website: tell the patient and move Joy's reminders."""
    patient = _patient_for_rh_id(session, str(data.get("patient_id") or ""))
    start_ms = data.get("start_time")
    if patient is None or not isinstance(start_ms, (int, float)):
        return
    start = appointment_start_from_ms(start_ms)
    # Joy moved it itself (booking.rescheduled already told them): only keep the reminders right
    already_known = any(r.session_start == start for r in _visit_reminders(session, _visit_key(data)))
    _schedule_visit_reminders(session, patient, data)
    if already_known:
        return
    who = str(data.get("physio_name") or "your physiotherapist")
    text = (
        f"Your appointment with {who} has moved to {format_lagos_appointment_time(start)}"
        + (" (online video call)." if data.get("online") else ".")
        + " Reply here if the new time doesn't suit you."
    )
    enqueue_booking_confirmed(patient.phone_e164, _visit_key(data), text, email=_appointment_email(session, patient))
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
           payload={"event": "appointment_rescheduled_disclosed", "appointment_id": str(data.get("appointment_id") or "")})


def _appointment_cancelled(session: Session, data: dict) -> None:
    """A visit was cancelled on the website: stop its reminders and tell the patient."""
    for reminder in _visit_reminders(session, _visit_key(data)):
        if reminder.status == "pending":
            reminder.status = "cancelled"
    patient = _patient_for_rh_id(session, str(data.get("patient_id") or ""))
    if patient is None:
        return
    booking_id = str(data.get("booking_id") or "")
    conversation = _patient_conversation(session, patient)
    context = (conversation.booking_context or {}) if conversation is not None else {}
    if booking_id and context.get("rh_booking_id") == booking_id and context.get("rh_booking_status") == "cancelled":
        return  # booking.cancelled already told them
    who = str(data.get("physio_name") or "your physiotherapist")
    start_ms = data.get("start_time")
    when = f" on {format_lagos_appointment_time(appointment_start_from_ms(start_ms))}" if isinstance(start_ms, (int, float)) else ""
    by = data.get("cancelled_by")
    if by == "patient":
        text = f"Your appointment with {who}{when} has been cancelled, as you asked. Reply here whenever you'd like to book another time."
    elif by == "physiotherapist":
        text = f"I'm sorry, {who} has had to cancel your appointment{when}. Reply here and I'll help you find another time."
    else:
        text = f"Your appointment with {who}{when} has been cancelled. Reply here and I'll help you find another time."
    enqueue_booking_confirmed(patient.phone_e164, _visit_key(data), text, email=_appointment_email(session, patient))
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
           payload={"event": "appointment_cancelled_disclosed", "appointment_id": str(data.get("appointment_id") or ""),
                    "cancelled_by": str(by or "")})


def _hold_nudge(session: Session, data: dict, *, expired: bool) -> None:
    """The time Joy is holding runs out in ~10 minutes (pay now), or has just run out."""
    from app.booking.appointment_reminders import LAGOS

    booking_id = str(data.get("booking_id") or "")
    patient = _patient_for_rh_id(session, str(data.get("patient_id") or ""))
    conversation = _patient_conversation(session, patient) if patient is not None else None
    if patient is None or conversation is None or not booking_id:
        return
    context = conversation.booking_context or {}
    step = conversation.booking_substate
    # Only the booking this chat is paying for, and never once it's paid or moved on
    if context.get("rh_booking_id") != booking_id or context.get("rh_payment_status") == "succeeded":
        return
    if step not in {"rh_awaiting_payment", "rh_awaiting_payment_email"}:
        return
    who = str(data.get("physio_name") or "your physiotherapist")
    url = str(context.get("authorization_url") or "")
    if expired:
        text = (
            f"The time I was holding with {who} has now been released, and nothing was charged. "
            + ("Reply *PAY* and I'll try to hold it again." if step == "rh_awaiting_payment"
               else "Reply *WhatsApp is fine* or your email and I'll try to hold it again.")
            + " If you've just paid, you can ignore this: I'll confirm here."
        )
    else:
        expires_ms = data.get("hold_expires_at")
        until = ""
        if isinstance(expires_ms, (int, float)):
            local = datetime.fromtimestamp(expires_ms / 1000, timezone.utc).astimezone(LAGOS)
            until = f" until {local.strftime('%I:%M %p').lstrip('0')}"
        if step == "rh_awaiting_payment" and url.startswith("https://"):
            text = f"Your time with {who} is held{until}. Pay securely here to keep it: {url}"
        else:
            text = f"Your time with {who} is held{until}. To get your payment link, tap *WhatsApp is fine* or reply with your email."
    enqueue_booking_confirmed(patient.phone_e164, booking_id, text)
    append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
           payload={"event": "hold_expired_notified" if expired else "hold_reminder_sent", "booking_id": booking_id})


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
        # The booking's own length (the first consultation is 20 minutes, not 60)
        try:
            duration = int(client.booking_status(booking_id, patient_id=rh_patient_id).get("duration_minutes") or 60)
        except (RHIntegrationError, TypeError, ValueError, AttributeError):
            duration = 60
        # RH needs 2 hours' notice to hold a time; a short margin so a choice can't expire in transit
        start = datetime.now(timezone.utc) + timedelta(hours=2, minutes=5)
        choices: list[dict] = []
        for candidate in candidates:
            availability = client.availability(
                candidate.physiotherapist_id, start_ms=int(start.timestamp() * 1000),
                end_ms=int((start.timestamp() + 7 * 24 * 3600) * 1000), duration_minutes=duration,
                service_mode=(candidate.service_modes or ["online"])[0],
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
        from app.booking.booking_flow import when_label

        for index, choice in enumerate(choices, 1):
            display = f"{when_label(choice['slot_start'])} (Lagos time)"  # was shown in UTC, an hour early
            lines.append(f"{index}. {choice.get('display_name') or 'Physiotherapist'} — {display}")
        lines.append("Reply with the time number you prefer.")
        enqueue_booking_confirmed(patient.phone_e164, booking_id, "\n".join(lines))
    except RHIntegrationError:
        return
