import re
from uuid import UUID

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.identity.permissions import authorize
from app.models.admin import Admin
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, Identity, Persona

_DECISIONS = frozenset({"approve", "reject", "web"})
_UUID = (
    r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
)
_DECISION_RE = re.compile(
    rf"\b(approve|reject|web)\b(?:\s+|:)(?P<id>{_UUID})",
    re.IGNORECASE,
)
_BROADCAST_RE = re.compile(
    r"^\s*broadcast\s+(all_patients|all_physios|physios_in_city:\S+)\s+(\S.*)",
    re.IGNORECASE | re.DOTALL,
)
_DIGEST_RE = re.compile(r"^\s*digest\s*$", re.IGNORECASE)
_TAKEOVER_RE = re.compile(
    rf"^\s*takeover\s+(on|off)\s+(?P<id>{_UUID})\s*$",
    re.IGNORECASE,
)
_ADMIN_HELP = (
    "I didn't catch that. You can send: "
    "approve|reject|web <physio-uuid>; "
    "broadcast <all_patients|all_physios|physios_in_city:<city>> <message>; "
    "digest; "
    "takeover on|off <conversation-uuid>."
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
        physio.needs_web_review = False
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
    from app.admin.broadcast import send_broadcast
    from app.admin.escalation_router import set_takeover
    from app.admin.stats_digest import digest

    text = user_text or ""
    if _DIGEST_RE.search(text):
        return digest(session)
    takeover = _TAKEOVER_RE.search(text)
    if takeover is not None:
        on = takeover.group(1).lower() == "on"
        conversation_id = UUID(takeover.group("id"))
        try:
            return set_takeover(session, conversation_id, on)
        except ValueError:
            return "I couldn't find that conversation."
    broadcast = _BROADCAST_RE.search(text)
    if broadcast is not None:
        identity = Identity(
            persona=Persona.ADMIN,
            person_id=admin.id,
            phone_e164=admin.phone_e164,
        )
        if not authorize(identity, "admin"):
            return "You're not allowed to send a broadcast."
        segment = _normalize_segment(broadcast.group(1))
        body = broadcast.group(2).strip()
        try:
            count = send_broadcast(session, admin.id, segment, body)
        except ValueError as exc:
            return str(exc)
        return f"Broadcast sent to {count} recipient(s)."
    match = _DECISION_RE.search(text)
    if match is None:
        return _ADMIN_HELP
    decision = match.group(1).lower()
    physio_id = UUID(match.group("id"))
    try:
        quick_reply_verify(
            session, physio_id, decision, actor_phone=admin.phone_e164
        )
    except ValueError:
        return "I couldn't find that physio."
    return f"Recorded {decision} for physio {physio_id}."


def _normalize_segment(raw: str) -> str:
    value = (raw or "").strip()
    lower = value.lower()
    if lower.startswith("physios_in_city:"):
        city = value.split(":", 1)[1]
        return f"physios_in_city:{city}"
    return lower
