import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.admin import Admin
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, PatientPhase, Persona
from app.queue.tasks import BROADCAST_QUEUE

logger = logging.getLogger(__name__)

_ALL_PATIENTS = "all_patients"
_ALL_PHYSIOS = "all_physios"
_PHYSIOS_IN_CITY = "physios_in_city"


def send_broadcast(session: Session, admin_id: UUID, segment: str, body: str) -> int:
    admin = session.get(Admin, admin_id)
    if admin is None:
        raise PermissionError("only an admin can send a broadcast")
    kind, city = _parse_segment(segment)
    recipients = _recipients(session, kind, city)
    text = body or ""
    for persona, row in recipients:
        _write_joy(session, persona, row.id, row.phone_e164, text)
    append(
        session,
        kind=AuditKind.ADMIN,
        actor_phone=admin.phone_e164,
        person_id=admin.id,
        payload={
            "action": "broadcast",
            "segment": segment,
            "recipient_count": len(recipients),
        },
    )
    session.flush()
    return len(recipients)


def _parse_segment(segment: str) -> tuple[str, str | None]:
    raw = (segment or "").strip()
    if raw == _ALL_PATIENTS:
        return _ALL_PATIENTS, None
    if raw == _ALL_PHYSIOS:
        return _ALL_PHYSIOS, None
    if raw == _PHYSIOS_IN_CITY or raw.startswith(f"{_PHYSIOS_IN_CITY}:"):
        city = raw[len(_PHYSIOS_IN_CITY) :].lstrip(":").strip()
        if not city:
            raise ValueError("physios_in_city requires a city, e.g. physios_in_city:Lagos")
        return _PHYSIOS_IN_CITY, city
    raise ValueError("unknown broadcast segment")


def _recipients(
    session: Session, kind: str, city: str | None
) -> list[tuple[Persona, Patient | Physiotherapist]]:
    if kind == _ALL_PATIENTS:
        return [(Persona.PATIENT, row) for row in session.scalars(select(Patient)).all()]
    physios = list(session.scalars(select(Physiotherapist)).all())
    if kind == _PHYSIOS_IN_CITY:
        needle = (city or "").casefold()
        physios = [
            row
            for row in physios
            if (row.city or "").strip().casefold() == needle
        ]
    return [(Persona.PHYSIO, row) for row in physios]


def _write_joy(
    session: Session, persona: Persona, person_id: UUID, phone: str, text: str
) -> None:
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
    session.add(Message(conversation_id=conversation.id, role="joy", text=text))
    _enqueue_broadcast(phone, text)


def _enqueue_broadcast(phone: str, text: str) -> None:
    try:
        from app.queue.tasks import enqueue_notify_broadcast

        enqueue_notify_broadcast(phone, text)
    except Exception:
        logger.exception("failed to enqueue broadcast")
