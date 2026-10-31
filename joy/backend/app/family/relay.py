from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.audit.logger import append
from app.models.booking import Booking
from app.models.conversation import Conversation, Message
from app.models.family_member import FamilyMember
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.relay import RelayThread
from app.models.triage_session import TriageSession
from app.models.types import AuditKind, BookingStatus, ExtractedTriage, PatientPhase, Persona

logger = logging.getLogger(__name__)

PENDING_RELAY_KEY = "pending_relay_thread_ids"

UNASSIGNED_REPLY = (
    "Relay starts after a physio is assigned. "
    "I'll pass questions to them once a session is confirmed."
)

_RELAY_ASK_RE = re.compile(
    r"(?i)\b(?:ask|tell|question|message|relay)\b.{0,40}\bphysio"
    r"|\bphysio\b.{0,40}\b(?:ask|tell|question)\b"
)

_FAMILY_ACK = (
    "I've sent that to {name}'s physiotherapist. I'll share their reply here."
)
_PHYSIO_ANSWER_ACK = "I've passed that to the family."


@dataclass
class RelayMessage:
    id: UUID
    last_physio_payload: str
    family_visible_text: str | None = None
    physio_visible_text: str | None = None


def is_relay_ask(text: str) -> bool:
    return bool(_RELAY_ASK_RE.search(text or ""))


def ask_physio(session: Session, family_id: UUID, question: str) -> RelayMessage:
    member = session.get(FamilyMember, family_id)
    if member is None or member.revoked_at is not None:
        raise ValueError("family member not found")
    patient = session.get(Patient, member.patient_id)
    booking = _confirmed_booking(session, member.patient_id)
    physio = session.get(Physiotherapist, booking.physio_id) if booking is not None else None

    thread = RelayThread(
        family_member_id=member.id,
        patient_id=member.patient_id,
        physio_id=physio.id if physio is not None else None,
        booking_id=booking.id if booking is not None else None,
        question=question,
        last_physio_payload="",
    )
    session.add(thread)
    session.flush()

    if physio is None or booking is None:
        thread.family_visible_text = UNASSIGNED_REPLY
        thread.physio_visible_text = None
        thread.last_physio_payload = ""
        _audit_relay(
            session,
            actor_phone=member.phone_e164,
            person_id=member.id,
            thread=thread,
            decision="unassigned",
        )
        session.flush()
        return _message_from_thread(thread)

    first_name = _first_name(patient)
    payload = _physio_question_payload(session, first_name, question, member.patient_id)
    payload = _strip_contacts(
        payload, physio.phone_e164, member.phone_e164, patient.phone_e164 if patient else ""
    )
    family_ack = _strip_contacts(
        _FAMILY_ACK.format(name=first_name),
        physio.phone_e164,
        member.phone_e164,
        patient.phone_e164 if patient else "",
    )
    thread.last_physio_payload = payload
    thread.physio_visible_text = payload
    thread.family_visible_text = family_ack
    _write_joy(session, physio.id, Persona.PHYSIO, payload, pending_thread_id=thread.id)
    _enqueue_physio(physio.phone_e164, payload)
    _audit_relay(
        session,
        actor_phone=member.phone_e164,
        person_id=member.id,
        thread=thread,
        decision="family_to_physio",
    )
    session.flush()
    return _message_from_thread(thread)


def apply_physio_answer(
    session: Session, thread_id: UUID, answer: str
) -> RelayMessage:
    thread = session.get(RelayThread, thread_id)
    if thread is None:
        raise ValueError("relay thread not found")
    member = session.get(FamilyMember, thread.family_member_id)
    physio = session.get(Physiotherapist, thread.physio_id) if thread.physio_id else None
    patient = session.get(Patient, thread.patient_id)

    family_text = f"The physiotherapist said:\n\n{answer}"
    physio_ack = _PHYSIO_ANSWER_ACK
    family_text = _strip_contacts(
        family_text,
        physio.phone_e164 if physio else "",
        member.phone_e164 if member else "",
        patient.phone_e164 if patient else "",
    )
    physio_ack = _strip_contacts(
        physio_ack,
        physio.phone_e164 if physio else "",
        member.phone_e164 if member else "",
        patient.phone_e164 if patient else "",
    )
    thread.answer = answer
    thread.family_visible_text = family_text
    thread.physio_visible_text = physio_ack
    thread.answered_at = datetime.now(timezone.utc)
    if member is not None and member.revoked_at is None:
        _write_joy(session, member.id, Persona.FAMILY, family_text)
        _enqueue_family(member.phone_e164, family_text)
    if physio is not None:
        _dequeue_pending_relay(session, physio.id, thread.id)
    _audit_relay(
        session,
        actor_phone=physio.phone_e164 if physio is not None else "",
        person_id=physio.id if physio is not None else thread.family_member_id,
        thread=thread,
        decision="physio_to_family",
    )
    session.flush()
    return _message_from_thread(thread)


def apply_pending_physio_answer(
    session: Session,
    physio_id: UUID,
    text: str,
    conversation: Conversation | None = None,
) -> str | None:
    queue = _pending_thread_ids(conversation)
    if not queue:
        return None
    for thread_id in queue:
        thread = session.get(RelayThread, thread_id)
        if thread is None or thread.physio_id != physio_id or thread.answered_at is not None:
            continue
        result = apply_physio_answer(session, thread.id, text)
        return result.physio_visible_text
    return None


def _confirmed_booking(session: Session, patient_id: UUID) -> Booking | None:
    return session.scalar(
        select(Booking)
        .where(
            Booking.patient_id == patient_id,
            Booking.status == BookingStatus.CONFIRMED,
        )
        .order_by(Booking.created_at.desc())
    )


def _first_name(patient: Patient | None) -> str:
    name = (patient.name or "").strip() if patient is not None else ""
    if not name:
        return "the patient"
    return name.split()[0]


def _triage_on_file(session: Session, patient_id: UUID) -> str:
    row = session.scalar(
        select(TriageSession)
        .where(TriageSession.patient_id == patient_id)
        .order_by(TriageSession.created_at.desc())
    )
    if row is None:
        conversation = session.scalar(
            select(Conversation).where(
                Conversation.person_id == patient_id,
                Conversation.persona == Persona.PATIENT,
            )
        )
        summary = (conversation.summary_text or "").strip() if conversation is not None else ""
        return summary or "already on file"
    extracted = ExtractedTriage.model_validate(row.extracted or {})
    bits: list[str] = []
    if extracted.body_location:
        bits.append(extracted.body_location)
    if extracted.onset:
        bits.append(f"for {extracted.onset}")
    if extracted.severity is not None:
        bits.append(f"severity {extracted.severity} out of 10")
    if extracted.goals:
        bits.append(f"hoping to {extracted.goals}")
    if extracted.condition_area is not None:
        bits.append(f"({extracted.condition_area.value})")
    return ", ".join(bits) if bits else "already on file"


def _physio_question_payload(
    session: Session, first_name: str, question: str, patient_id: UUID
) -> str:
    triage = _triage_on_file(session, patient_id)
    return (
        f"Family question about {first_name}.\n\n"
        f"Triage already on file: {triage}.\n\n"
        f"Question: {question}\n\n"
        "Reply here and I'll pass it to the family."
    )


def _strip_contacts(text: str, *phones: str) -> str:
    out = text or ""
    for phone in phones:
        if phone:
            out = out.replace(phone, "")
    return out


def _message_from_thread(thread: RelayThread) -> RelayMessage:
    return RelayMessage(
        id=thread.id,
        last_physio_payload=thread.last_physio_payload or "",
        family_visible_text=thread.family_visible_text,
        physio_visible_text=thread.physio_visible_text,
    )


def _write_joy(
    session: Session,
    person_id: UUID,
    persona: Persona,
    text: str,
    *,
    pending_thread_id: UUID | None = None,
) -> Conversation:
    conversation = session.scalar(
        select(Conversation).where(
            Conversation.person_id == person_id,
            Conversation.persona == persona,
        )
    )
    if conversation is None:
        conversation = Conversation(
            person_id=person_id,
            persona=persona,
            phase=PatientPhase.FIRST_CONTACT,
        )
        session.add(conversation)
        session.flush()
    if pending_thread_id is not None:
        ctx = dict(conversation.booking_context or {})
        queue = _coerce_pending_ids(ctx.get(PENDING_RELAY_KEY))
        sid = str(pending_thread_id)
        if sid not in queue:
            queue.append(sid)
        ctx[PENDING_RELAY_KEY] = queue
        conversation.booking_context = ctx
        flag_modified(conversation, "booking_context")
    session.add(Message(conversation_id=conversation.id, role="joy", text=text))
    session.flush()
    return conversation


def _coerce_pending_ids(raw) -> list[str]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return [str(item) for item in raw if item]
    return [str(raw)]


def _pending_thread_ids(conversation: Conversation | None) -> list[UUID]:
    if conversation is None:
        return []
    ids: list[UUID] = []
    for item in _coerce_pending_ids((conversation.booking_context or {}).get(PENDING_RELAY_KEY)):
        try:
            ids.append(UUID(item))
        except (ValueError, TypeError):
            continue
    return ids


def _dequeue_pending_relay(session: Session, physio_id: UUID, thread_id: UUID) -> None:
    conversation = session.scalar(
        select(Conversation).where(
            Conversation.person_id == physio_id,
            Conversation.persona == Persona.PHYSIO,
        )
    )
    if conversation is None:
        return
    ctx = dict(conversation.booking_context or {})
    sid = str(thread_id)
    queue = [item for item in _coerce_pending_ids(ctx.get(PENDING_RELAY_KEY)) if item != sid]
    if queue:
        ctx[PENDING_RELAY_KEY] = queue
    else:
        ctx.pop(PENDING_RELAY_KEY, None)
    conversation.booking_context = ctx or None
    flag_modified(conversation, "booking_context")


def _audit_relay(
    session: Session,
    *,
    actor_phone: str,
    person_id: UUID,
    thread: RelayThread,
    decision: str,
) -> None:
    append(
        session,
        kind=AuditKind.RELAY,
        actor_phone=actor_phone,
        person_id=person_id,
        payload={
            "decision": decision,
            "thread_id": str(thread.id),
            "patient_id": str(thread.patient_id),
            "family_member_id": str(thread.family_member_id),
            "physio_id": str(thread.physio_id) if thread.physio_id else None,
            "booking_id": str(thread.booking_id) if thread.booking_id else None,
        },
    )


def _enqueue_physio(phone: str, text: str) -> None:
    try:
        from app.queue.tasks import enqueue_notify_physio_relay

        enqueue_notify_physio_relay(phone, text)
    except Exception:
        logger.exception("failed to enqueue physio relay")


def _enqueue_family(phone: str, text: str) -> None:
    try:
        from app.queue.tasks import enqueue_notify_family_relay

        enqueue_notify_family_relay(phone, text)
    except Exception:
        logger.exception("failed to enqueue family relay")
