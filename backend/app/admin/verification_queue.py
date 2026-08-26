import re
from uuid import UUID

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.admin import Admin
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind

_DECISIONS = frozenset({"approve", "reject", "web"})
_DECISION_RE = re.compile(
    r"\b(approve|reject|web)\b(?:\s+|:)(?P<id>"
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})",
    re.IGNORECASE,
)
_ADMIN_HELP = (
    "I didn't catch a verification reply. "
    "Send approve, reject, or web plus the physio id."
)


def quick_reply_verify(
    session: Session,
    physio_id: UUID,
    decision: str,
    *,
    actor_phone: str = "admin",
) -> None:
    choice = (decision or "").strip().lower()
    if choice not in _DECISIONS:
        raise ValueError("decision must be approve, reject, or web")
    physio = session.get(Physiotherapist, physio_id)
    if physio is None:
        raise ValueError("physio missing")
    if choice == "approve":
        physio.onboarding_status = "verified"
        physio.verified = True
        physio.needs_web_review = False
    elif choice == "reject":
        physio.onboarding_status = "rejected"
        physio.verified = False
    else:
        physio.onboarding_status = "submitted"
        physio.needs_web_review = True
    append(
        session,
        kind=AuditKind.ADMIN,
        actor_phone=actor_phone,
        person_id=physio.id,
        payload={
            "physio_id": str(physio.id),
            "decision": choice,
            "onboarding_status": physio.onboarding_status,
            "needs_web_review": physio.needs_web_review,
        },
    )
    session.flush()


def apply_admin_turn(session: Session, admin: Admin, user_text: str) -> str:
    match = _DECISION_RE.search(user_text or "")
    if match is None:
        return _ADMIN_HELP
    decision = match.group(1).lower()
    physio_id = UUID(match.group("id"))
    quick_reply_verify(
        session, physio_id, decision, actor_phone=admin.phone_e164
    )
    return f"Recorded {decision} for physio {physio_id}."
