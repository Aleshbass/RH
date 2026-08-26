import logging
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.types import PatientPhase, Persona, SafetyResult
from app.queue.tasks import ADMIN_ESCALATION_QUEUE, TAKEOVER_QUEUE

logger = logging.getLogger(__name__)

OFF_PLATFORM_KEYWORDS = ("pay me direct", "my personal number")

_TAKEOVER_NOTICE = (
    "A human from our team has stepped in to help you on this chat. "
    "I'll stay quiet while they work with you."
)
_TAKEOVER_CONTINUE = "A human is helping you on this chat."
_TAKEOVER_CLEARED = "I'm back with you on this chat."

# Documented ExtractedTriage.flags keys → small keyword list. evaluate() still decides.
_FLAG_KEYWORDS: dict[str, tuple[str, ...]] = {
    "saddle_anesthesia": (
        "saddle anesthesia",
        "saddle numbness",
        "numbness around the saddle",
        "saddle area",
    ),
    "bladder_bowel_change": (
        "bladder control",
        "bladder incontinence",
        "loss of bladder",
        "can't control bladder",
        "cannot control bladder",
        "bowel control",
        "bowel incontinence",
        "can't pee",
        "cannot pee",
    ),
    "bilateral_leg_weakness": (
        "both legs",
        "weakness in both legs",
        "bilateral leg weakness",
    ),
    "unexplained_weight_loss": ("weight loss", "losing weight"),
    "night_pain": ("night pain", "pain at night", "wakes me at night"),
    "fever": ("have a fever", "has a fever", "high fever", "with fever", "feverish"),
    "night_sweats": ("night sweats", "sweating at night"),
    "history_of_cancer": (
        "history of cancer",
        "had cancer",
        "have cancer",
        "has cancer",
        "cancer history",
    ),
    "recent_trauma": ("recent trauma", "car accident", "fell from"),
    "chest_pain": ("chest pain",),
    "sudden_neuro_deficit": (
        "sudden weakness",
        "can't speak",
        "cannot speak",
        "face droop",
        "sudden neuro",
        "slurred speech",
    ),
    "unexplained_numbness": ("unexplained numbness",),
}


def detect_off_platform(text: str) -> str | None:
    hay = (text or "").lower()
    if any(keyword in hay for keyword in OFF_PLATFORM_KEYWORDS):
        return "off_platform"
    return None


def flags_from_triage_text(text: str) -> dict[str, bool]:
    lower = (text or "").lower()
    flags: dict[str, bool] = {}
    for key, keywords in _FLAG_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            flags[key] = True
    return flags


def takeover_notice(conversation: Conversation) -> str:
    if conversation.takeover_notified_at is not None:
        return _TAKEOVER_CONTINUE
    return _TAKEOVER_NOTICE


def set_takeover(session: Session, conversation_id: UUID, on: bool) -> str:
    conversation = session.get(Conversation, conversation_id)
    if conversation is None:
        raise ValueError("conversation missing")
    if on:
        conversation.human_takeover = True
        conversation.takeover_notified_at = datetime.now(timezone.utc)
        text = _TAKEOVER_NOTICE
        session.add(Message(conversation_id=conversation.id, role="joy", text=text))
        _enqueue_takeover_notice(session, conversation, text)
        session.flush()
        return text
    conversation.human_takeover = False
    conversation.takeover_notified_at = None
    session.flush()
    return _TAKEOVER_CLEARED


def route_escalation(session: Session, kind: str, payload: dict | None = None) -> None:
    body = dict(payload or {})
    text = _admin_text(kind, body)
    admins = session.scalars(select(Admin)).all()
    for admin in admins:
        conversation = session.scalar(
            select(Conversation).where(
                Conversation.person_id == admin.id,
                Conversation.persona == Persona.ADMIN,
            )
        )
        if conversation is None:
            conversation = Conversation(
                person_id=admin.id,
                persona=Persona.ADMIN,
                phase=PatientPhase.FIRST_CONTACT,
            )
            session.add(conversation)
            session.flush()
        session.add(Message(conversation_id=conversation.id, role="joy", text=text))
        _enqueue_admin_notice(admin.phone_e164, text)
    session.flush()


def route_safety(session: Session, safety: SafetyResult, extra: dict | None = None) -> None:
    if not safety.fired:
        return
    payload = {
        "rule_ids": list(safety.rule_ids),
        "reason": safety.reason_plain_language,
        "action": safety.action,
        **(extra or {}),
    }
    route_escalation(session, "safety", payload)


def _admin_text(kind: str, payload: dict) -> str:
    if kind == "off_platform":
        snippet = str(payload.get("text") or "").strip()
        who = payload.get("physio_id") or payload.get("patient_id") or "someone"
        return (
            f"Off-platform activity flagged for {who}. "
            f"They said something like: {snippet or 'pay me direct / my personal number'}."
        )
    if kind == "verification":
        physio_id = payload.get("physio_id") or ""
        return (
            f"Physio {physio_id} submitted credentials for verification. "
            f"Reply approve {physio_id}, reject {physio_id}, or web {physio_id}."
        )
    if kind == "safety":
        rules = ", ".join(str(item) for item in payload.get("rule_ids") or []) or "unknown"
        reason = str(payload.get("reason") or "").strip()
        patient_id = payload.get("patient_id") or ""
        parts = [f"Safety escalation ({rules})."]
        if patient_id:
            parts.append(f"Patient {patient_id}.")
        if reason:
            parts.append(reason)
        return " ".join(parts)
    return f"Admin alert ({kind}): {payload}"


def _enqueue_admin_notice(phone: str, text: str) -> None:
    try:
        from app.queue.tasks import enqueue_notify_admin_escalation

        enqueue_notify_admin_escalation(phone, text)
    except Exception:
        logger.exception("failed to enqueue admin escalation notice")


def _phone_for_conversation(session: Session, conversation: Conversation) -> str | None:
    if conversation.persona == Persona.PATIENT:
        row = session.get(Patient, conversation.person_id)
        return row.phone_e164 if row is not None else None
    return None


def _enqueue_takeover_notice(
    session: Session, conversation: Conversation, text: str
) -> None:
    phone = _phone_for_conversation(session, conversation)
    if not phone:
        return
    try:
        from app.queue.tasks import enqueue_notify_takeover

        enqueue_notify_takeover(phone, text)
    except Exception:
        logger.exception("failed to enqueue takeover notice")
