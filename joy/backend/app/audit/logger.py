from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditEvent
from app.models.types import AuditKind


def append(
    session: Session,
    *,
    kind: AuditKind,
    actor_phone: str,
    person_id: UUID | None,
    payload: dict,
) -> UUID:
    event = AuditEvent(
        kind=kind,
        actor_phone=actor_phone,
        person_id=person_id,
        payload=payload,
        created_at=datetime.now(timezone.utc),
    )
    session.add(event)
    session.flush()
    return event.id
