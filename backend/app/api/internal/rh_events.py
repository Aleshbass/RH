import hashlib
import hmac
from datetime import datetime, timezone

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
            enqueue_booking_confirmed(patient.phone_e164, str(data.get("booking_id") or ""), "Your appointment is confirmed. I’ll send your appointment details here.")
    elif event_type == "booking.meeting_link_ready":
        data = payload.get("data") or {}
        rh_patient_id = str(data.get("patient_id") or "")
        meeting_url = str(data.get("meeting_url") or "")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == rh_patient_id))
        patient = session.get(Patient, mapping.joy_person_id) if mapping else None
        if patient and meeting_url.startswith("https://"):
            enqueue_booking_confirmed(
                patient.phone_e164,
                str(data.get("booking_id") or ""),
                f"Your online appointment is ready. Join securely here: {meeting_url}",
            )
            append(session, kind=AuditKind.BOOKING, actor_phone="rh-service", person_id=patient.id,
                   payload={"event": "online_meeting_link_disclosed", "booking_id": str(data.get("booking_id") or ""), "platform": data.get("platform")})
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
