from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.triage_session import TriageSession
from app.models.types import ExtractedTriage, Identity, PatientPhase, Persona

RECENT_MESSAGE_LIMIT = 12

_last_stamp: datetime | None = None


@dataclass
class ConversationState:
    phase: PatientPhase
    last_known_language: str | None
    summary_text: str | None
    recent_messages: list[Message]
    extracted: ExtractedTriage
    known_facts: dict
    conversation_id: UUID
    triage_session_id: UUID | None = None


def _next_stamp() -> datetime:
    global _last_stamp
    now = datetime.now(timezone.utc)
    if _last_stamp is not None and now <= _last_stamp:
        now = _last_stamp + timedelta(microseconds=1)
    _last_stamp = now
    return now


def _patient_id(identity: Identity) -> UUID | None:
    if identity.persona == Persona.PATIENT:
        return identity.person_id
    return identity.linked_patient_id


def _known_facts(session: Session, patient_id: UUID | None) -> dict:
    if patient_id is None:
        return {}
    patient = session.get(Patient, patient_id)
    if patient is None:
        return {}
    facts: dict = {}
    if patient.name is not None:
        facts["name"] = patient.name
    if patient.age is not None:
        facts["age"] = patient.age
    if patient.location is not None:
        facts["location"] = patient.location
    return facts


def _merge_extracted(existing: ExtractedTriage, incoming: ExtractedTriage) -> ExtractedTriage:
    merged = existing.model_dump()
    for key in incoming.model_fields_set:
        value = getattr(incoming, key)
        if value is None:
            continue
        if isinstance(value, dict):
            if not value:
                merged[key] = {}
            else:
                current = dict(merged.get(key) or {})
                for inner_key, inner_value in value.items():
                    if inner_value is not None:
                        current[inner_key] = inner_value
                merged[key] = current
            continue
        merged[key] = value
    return ExtractedTriage.model_validate(merged)


def _current_triage(session: Session, patient_id: UUID) -> TriageSession | None:
    open_row = session.scalar(
        select(TriageSession).where(
            TriageSession.patient_id == patient_id,
            TriageSession.status == "open",
        )
    )
    if open_row is not None:
        return open_row
    return session.scalar(
        select(TriageSession)
        .where(TriageSession.patient_id == patient_id)
        .order_by(TriageSession.created_at.desc())
    )


def _get_conversation(session: Session, identity: Identity) -> Conversation | None:
    return session.scalar(
        select(Conversation)
        .where(
            Conversation.person_id == identity.person_id,
            Conversation.persona == identity.persona,
        )
        .with_for_update()
    )


def load(session: Session, identity: Identity) -> ConversationState:
    conversation = _get_conversation(session, identity)
    if conversation is None:
        created = Conversation(
            person_id=identity.person_id,
            persona=identity.persona,
            phase=PatientPhase.FIRST_CONTACT,
        )
        try:
            with session.begin_nested():
                session.add(created)
                session.flush()
            conversation = created
        except IntegrityError:
            conversation = _get_conversation(session, identity)
            if conversation is None:
                raise

    patient_id = _patient_id(identity)
    triage: TriageSession | None = None
    extracted = ExtractedTriage()
    if patient_id is not None:
        triage = _current_triage(session, patient_id)
        if triage is None:
            triage = TriageSession(
                patient_id=patient_id,
                extracted=ExtractedTriage().model_dump(mode="json"),
                status="open",
            )
            session.add(triage)
            session.flush()
        extracted = ExtractedTriage.model_validate(triage.extracted)

    newest_first = session.scalars(
        select(Message)
        .where(Message.conversation_id == conversation.id)
        .order_by(Message.created_at.desc())
        .limit(RECENT_MESSAGE_LIMIT)
    ).all()
    recent_messages = list(reversed(newest_first))

    return ConversationState(
        phase=conversation.phase,
        last_known_language=conversation.last_known_language,
        summary_text=conversation.summary_text,
        recent_messages=recent_messages,
        extracted=extracted,
        known_facts=_known_facts(session, patient_id),
        conversation_id=conversation.id,
        triage_session_id=triage.id if triage is not None else None,
    )


def save_turn(
    session: Session,
    state: ConversationState,
    user_text: str,
    joy_text: str,
    extracted: ExtractedTriage,
    phase: PatientPhase,
    language: str,
    wa_message_id: str | None = None,
) -> None:
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        raise ValueError("conversation missing")
    conversation.phase = phase
    conversation.last_known_language = language

    session.add(
        Message(
            conversation_id=conversation.id,
            role="user",
            text=user_text,
            created_at=_next_stamp(),
            wa_message_id=wa_message_id,
        )
    )
    session.add(
        Message(
            conversation_id=conversation.id,
            role="joy",
            text=joy_text,
            created_at=_next_stamp(),
        )
    )

    if state.triage_session_id is not None:
        triage = session.get(TriageSession, state.triage_session_id)
        if triage is not None:
            existing = ExtractedTriage.model_validate(triage.extracted)
            merged = _merge_extracted(existing, extracted)
            triage.extracted = merged.model_dump(mode="json")
            if merged.condition_area is not None:
                triage.condition_area = merged.condition_area
            state.extracted = merged

    state.phase = phase
    state.last_known_language = language
    session.flush()
