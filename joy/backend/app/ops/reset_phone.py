"""Reset one WhatsApp number so Joy treats it as a new sender.

For a number that got the wrong role (for example someone who said they are a physiotherapist and
is now asked for an MRTB number every time). For that phone it:

* removes the physiotherapist identity, but only an unverified one with no bookings or payouts
  (its availability slots go with it; relay threads keep their patient and lose the physio link);
* clears Joy's memory of the chats: messages, conversation state and, for a patient, triage
  sessions. The patient record itself stays.

WhatsApp's visible chat history is not affected. Used by scripts/reset_phone.py and the internal
endpoint POST /api/internal/ops/reset-phone (X-Internal-Key). Joy itself uses the physio part
(``physio_removal_refusal`` and ``remove_physio_identity``) when someone in physio sign-up says they
are a patient (app/identity/role_switch.py); that never touches the patient's own chats.
"""

from __future__ import annotations

import re

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.models.availability_slot import AvailabilitySlot
from app.models.booking import Booking
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.payout import Payout
from app.models.physiotherapist import Physiotherapist
from app.models.relay import RelayThread
from app.models.triage_session import TriageSession
from app.models.types import Persona


def normalize_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("0") and len(digits) == 11:
        digits = "234" + digits[1:]
    return "+" + digits


def _count(session: Session, stmt) -> int:
    return session.scalar(select(func.count()).select_from(stmt.subquery())) or 0


def _physio_activity(session: Session, physio: Physiotherapist) -> tuple[int, int]:
    bookings = _count(session, select(Booking.id).where(Booking.physio_id == physio.id))
    payouts = _count(session, select(Payout.id).where(Payout.physio_id == physio.id))
    return bookings, payouts


def physio_removal_refusal(session: Session, physio: Physiotherapist) -> str | None:
    """Why this physio identity must be kept, or None when it may be removed."""
    if physio.verified or physio.onboarding_status == "verified":
        return "the physio is verified"
    bookings, payouts = _physio_activity(session, physio)
    if bookings or payouts:
        return "the physio has bookings or payouts"
    return None


def _delete_conversations(session: Session, conversation_ids: list) -> None:
    if conversation_ids:
        session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
        session.execute(delete(Conversation).where(Conversation.id.in_(conversation_ids)))


def remove_physio_identity(session: Session, physio: Physiotherapist) -> None:
    """Delete a physio identity and Joy's chats with it. Callers check ``physio_removal_refusal`` first.

    Only the physio's own conversation goes: a patient record on the same number, and its chats and
    triage, are left exactly as they were. Nothing is committed here.
    """
    conversation_ids = list(session.scalars(select(Conversation.id).where(
        Conversation.person_id == physio.id, Conversation.persona == Persona.PHYSIO,
    )).all())
    _delete_conversations(session, conversation_ids)
    session.execute(delete(AvailabilitySlot).where(AvailabilitySlot.physio_id == physio.id))
    session.execute(update(RelayThread).where(RelayThread.physio_id == physio.id).values(physio_id=None))
    session.delete(physio)
    session.flush()


def reset_phone(session: Session, raw_phone: str, *, apply: bool) -> dict:
    """What a reset of this number does (dry run), or does it when apply is True."""
    phone = normalize_phone(raw_phone)
    physio = session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone))
    patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone))
    person_ids = [p.id for p in (physio, patient) if p is not None]
    conversations = (
        session.scalars(select(Conversation).where(Conversation.person_id.in_(person_ids))).all() if person_ids else []
    )
    conversation_ids = [c.id for c in conversations]
    report: dict = {
        "phone": phone,
        "applied": False,
        "physio": None,
        "patient_kept": patient is not None,
        "conversations": [f"{c.persona}:{c.stage}" for c in conversations],
        "messages": _count(session, select(Message.id).where(Message.conversation_id.in_(conversation_ids))) if conversation_ids else 0,
        "triage_sessions": _count(session, select(TriageSession.id).where(TriageSession.patient_id == patient.id)) if patient else 0,
        "refused": None,
    }
    if physio is not None:
        bookings, payouts = _physio_activity(session, physio)
        report["physio"] = {
            "onboarding_status": physio.onboarding_status,
            "verified": bool(physio.verified),
            "mrtb_set": bool(physio.mrtb_number),
            "bookings": bookings,
            "payouts": payouts,
        }
        report["refused"] = physio_removal_refusal(session, physio)
    if report["refused"] or not apply:
        return report

    _delete_conversations(session, conversation_ids)
    if patient is not None:
        session.execute(delete(TriageSession).where(TriageSession.patient_id == patient.id))
    if physio is not None:
        remove_physio_identity(session, physio)
    session.commit()
    report["applied"] = True
    return report
