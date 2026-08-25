from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.booking.booking_flow import cancel_notify, parse_slot, reschedule
from app.models.booking import Booking
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.triage_session import TriageSession
from app.models.types import AuditKind, BookingStatus, ExtractedTriage, SafetyResult
from app.queue.tasks import enqueue_notify_physio_booking
from app.safety.evaluator import evaluate

_ACCEPT_RE = re.compile(r"(?i)\baccept(?:ed)?\b")
_DECLINE_RE = re.compile(r"(?i)\bdeclin(?:e|ed)\b")
_CANCEL_RE = re.compile(r"(?i)\bcancel\b")
_RESCHEDULE_RE = re.compile(r"(?i)\breschedule\b")
_CONFIRM_RE = re.compile(r"^\s*(yes|yeah|yep)\b", re.IGNORECASE)

_ACCEPTED_REPLY = "Thanks — you've accepted this booking."
_DECLINED_REPLY = "Got it — you've declined this booking. Admin will follow up."
PENDING_CANCEL_KEY = "pending_cancel_booking_id"


def notify_new_booking(session: Session, booking_id: UUID | str) -> str:
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise RuntimeError(f"booking not found: {booking_id}")
    patient = session.get(Patient, booking.patient_id)
    physio = session.get(Physiotherapist, booking.physio_id)
    extracted, safety = _latest_triage(session, booking.patient_id)
    text = _alert_body(patient, extracted, safety)
    if physio is not None:
        enqueue_notify_physio_booking(physio.phone_e164, str(booking.id), text)
    return text


def apply_physio_reply(
    session: Session,
    physio_id: UUID,
    text: str,
    conversation: Conversation | None = None,
) -> str | None:
    confirmed = _latest_confirmed_booking(session, physio_id)
    mutable = _latest_mutable_booking(session, physio_id)
    pending_id = _pending_cancel_id(conversation)
    if pending_id is not None and _CONFIRM_RE.search(text or ""):
        _clear_pending_cancel(conversation)
        booking = session.get(Booking, pending_id)
        if booking is None or booking.physio_id != physio_id:
            return None
        physio = session.get(Physiotherapist, physio_id)
        return cancel_notify(
            session,
            booking,
            actor_phone=physio.phone_e164 if physio is not None else "",
            person_id=physio_id,
        )
    if pending_id is not None:
        _clear_pending_cancel(conversation)
    if _DECLINE_RE.search(text or ""):
        if confirmed is None:
            return None
        _set_response(session, confirmed, "declined")
        physio = session.get(Physiotherapist, physio_id)
        append(
            session,
            kind=AuditKind.ADMIN,
            actor_phone=physio.phone_e164 if physio is not None else "",
            person_id=physio_id,
            payload={
                "decision": "physio_declined",
                "booking_id": str(confirmed.id),
                "status": str(confirmed.status),
            },
        )
        return _DECLINED_REPLY
    if _ACCEPT_RE.search(text or ""):
        if confirmed is None:
            return None
        _set_response(session, confirmed, "accepted")
        return _ACCEPTED_REPLY
    if _CANCEL_RE.search(text or ""):
        if confirmed is not None:
            if conversation is not None:
                _set_pending_cancel(conversation, confirmed.id)
            patient = session.get(Patient, confirmed.patient_id)
            name = _first_name(patient)
            return (
                f"This is a paid session with {name}. Reply yes to cancel it."
            )
        if mutable is None:
            return None
        physio = session.get(Physiotherapist, physio_id)
        return cancel_notify(
            session,
            mutable,
            actor_phone=physio.phone_e164 if physio is not None else "",
            person_id=physio_id,
        )
    if _RESCHEDULE_RE.search(text or ""):
        if mutable is None:
            return None
        slot = parse_slot(text)
        if slot is None:
            return "Tell me the new time (for example 2026-09-01T10:00:00+00:00)."
        reschedule(mutable, slot)
        return f"I've moved the session to {slot.isoformat()}."
    return None


def _set_response(session: Session, booking: Booking, value: str) -> None:
    booking.physio_response = value
    session.flush()


def _pending_cancel_id(conversation: Conversation | None) -> UUID | None:
    if conversation is None:
        return None
    raw = (conversation.booking_context or {}).get(PENDING_CANCEL_KEY)
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        return None


def _set_pending_cancel(conversation: Conversation, booking_id: UUID) -> None:
    ctx = dict(conversation.booking_context or {})
    ctx[PENDING_CANCEL_KEY] = str(booking_id)
    conversation.booking_context = ctx


def _clear_pending_cancel(conversation: Conversation | None) -> None:
    if conversation is None:
        return
    ctx = dict(conversation.booking_context or {})
    ctx.pop(PENDING_CANCEL_KEY, None)
    conversation.booking_context = ctx or None


def _latest_confirmed_booking(session: Session, physio_id: UUID) -> Booking | None:
    return session.scalar(
        select(Booking)
        .where(
            Booking.physio_id == physio_id,
            Booking.status == BookingStatus.CONFIRMED,
        )
        .order_by(Booking.created_at.desc())
    )


def _latest_mutable_booking(session: Session, physio_id: UUID) -> Booking | None:
    return session.scalar(
        select(Booking)
        .where(
            Booking.physio_id == physio_id,
            Booking.status.in_(
                [BookingStatus.CONFIRMED, BookingStatus.AWAITING_PAYMENT]
            ),
        )
        .order_by(Booking.created_at.desc())
    )


def _latest_triage(
    session: Session, patient_id: UUID
) -> tuple[ExtractedTriage, SafetyResult]:
    row = session.scalar(
        select(TriageSession)
        .where(TriageSession.patient_id == patient_id)
        .order_by(TriageSession.created_at.desc())
    )
    extracted = ExtractedTriage.model_validate(row.extracted if row is not None else {})
    return extracted, evaluate(extracted)


def _alert_body(
    patient: Patient | None, extracted: ExtractedTriage, safety: SafetyResult
) -> str:
    first_name = _first_name(patient)
    area = extracted.condition_area.value if extracted.condition_area is not None else "unknown"
    flags = "fired" if safety.fired else "cleared"
    if safety.fired and safety.reason_plain_language:
        flags = f"fired — {safety.reason_plain_language}"
    goals = extracted.goals or "not recorded"
    return (
        "New paid booking.\n"
        f"Patient: {first_name}\n"
        f"Condition area: {area}\n"
        f"Red flags: {flags}\n"
        f"Goals: {goals}\n"
        "Reply accept or decline."
    )


def _first_name(patient: Patient | None) -> str:
    name = (patient.name or "").strip() if patient is not None else ""
    if not name:
        return "the patient"
    return name.split()[0]
