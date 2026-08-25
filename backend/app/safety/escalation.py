import logging
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, Message
from app.models.family_member import FamilyMember
from app.models.types import PatientPhase, Persona, SafetyResult

logger = logging.getLogger(__name__)

_OPENERS: dict[str, str] = {
    "cauda_equina": (
        "I'm concerned about the numbness around your saddle area and what it "
        "could mean for the nerves in your lower spine."
    ),
    "infection": (
        "I'm concerned these fevers or night sweats could mean an infection."
    ),
    "malignancy_screen": (
        "I'm concerned about these warning signs in your history and symptoms."
    ),
    "major_trauma": (
        "I'm concerned about this recent injury and whether something is "
        "seriously damaged."
    ),
    "cardiac": "I'm concerned about the chest pain you described.",
    "acute_neuro": (
        "I'm concerned about this sudden change in your nerves or strength."
    ),
}

_DEFAULT_OPENER = (
    "I'm concerned about what you're describing, and I want to be careful with you."
)

_INSTRUCTION = (
    "Please see a doctor or go to an emergency hospital now. "
    "This needs medical care today, not a later appointment."
)


def patient_message(result: SafetyResult) -> str:
    if not result.fired:
        return ""
    if len(result.rule_ids) == 1:
        opener = _OPENERS.get(result.rule_ids[0], _DEFAULT_OPENER)
    else:
        opener = (
            "I'm concerned about several warning signs in what you described."
        )
    reason = result.reason_plain_language.strip()
    parts = [opener]
    if reason:
        parts.append(reason)
    parts.append(_INSTRUCTION)
    return "\n\n".join(parts)


def _enqueue_family_notice(phone: str, text: str) -> None:
    try:
        from app.queue.tasks import enqueue_notify_family_safety

        enqueue_notify_family_safety(phone, text)
    except Exception:
        logger.exception("failed to enqueue family safety notice")


def notify_family_on_safety(
    session: Session, patient_id: UUID, result: SafetyResult
) -> bool:
    text = patient_message(result)
    if not text:
        return False
    members = session.scalars(
        select(FamilyMember).where(
            FamilyMember.patient_id == patient_id,
            FamilyMember.revoked_at.is_(None),
        )
    ).all()
    if not members:
        return False
    notified = False
    for member in members:
        conversation = session.scalar(
            select(Conversation).where(
                Conversation.person_id == member.id,
                Conversation.persona == Persona.FAMILY,
            )
        )
        if conversation is None:
            conversation = Conversation(
                person_id=member.id,
                persona=Persona.FAMILY,
                phase=PatientPhase.FIRST_CONTACT,
            )
            session.add(conversation)
            session.flush()
        session.add(
            Message(
                conversation_id=conversation.id,
                role="joy",
                text=text,
            )
        )
        _enqueue_family_notice(member.phone_e164, text)
        notified = True
    session.flush()
    return notified
