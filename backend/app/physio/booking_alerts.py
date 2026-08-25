from __future__ import annotations

import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.booking.booking_flow import cancel_notify, parse_slot, reschedule
from app.models.booking import Booking
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

_ACCEPTED_REPLY = "Thanks — you've accepted this booking."
_DECLINED_REPLY = "Got it — you've declined this booking. Admin will follow up."
_NO_BOOKING = "I don't have a paid booking waiting for a reply."


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


def apply_physio_reply(session: Session, physio_id: UUID, text: str) -> str | None:
    booking = _latest_mutable_booking(session, physio_id)
    if _DECLINE_RE.search(text or ""):
        if booking is None:
            return _NO_BOOKING
        _set_response(session, booking, "declined")
        physio = session.get(Physiotherapist, physio_id)
        append(
            session,
            kind=AuditKind.ADMIN,
            actor_phone=physio.phone_e164 if physio is not None else "",
            person_id=physio_id,
            payload={
                "decision": "physio_declined",
                "booking_id": str(booking.id),
                "status": str(booking.status),
            },
        )
        return _DECLINED_REPLY
    if _ACCEPT_RE.search(text or ""):
        if booking is None:
            return _NO_BOOKING
        _set_response(session, booking, "accepted")
        return _ACCEPTED_REPLY
    if _CANCEL_RE.search(text or ""):
        if booking is None:
            return None
        physio = session.get(Physiotherapist, physio_id)
        return cancel_notify(
            session,
            booking,
            actor_phone=physio.phone_e164 if physio is not None else "",
            person_id=physio_id,
        )
    if _RESCHEDULE_RE.search(text or ""):
        if booking is None:
            return None
        slot = parse_slot(text)
        if slot is None:
            return "Tell me the new time (for example 2026-09-01T10:00:00+00:00)."
        reschedule(booking, slot)
        return f"I've moved the session to {slot.isoformat()}."
    return None


def _set_response(session: Session, booking: Booking, value: str) -> None:
    booking.physio_response = value
    session.flush()


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
