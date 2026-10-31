from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.internal.auth import require_internal_key
from app.db import get_session
from app.models.audit_log import AuditEvent
from app.models.types import AuditKind

router = APIRouter(dependencies=[Depends(require_internal_key)])


def _event_row(event: AuditEvent) -> dict:
    return {
        "id": str(event.id),
        "kind": event.kind.value if hasattr(event.kind, "value") else str(event.kind),
        "actor_phone": event.actor_phone,
        "person_id": str(event.person_id) if event.person_id else None,
        "payload": event.payload,
        "created_at": event.created_at.isoformat() if event.created_at else None,
    }


@router.get("/api/internal/audit")
def list_audit_events(
    session: Session = Depends(get_session),
    kind: AuditKind | None = None,
    person_id: UUID | None = None,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
) -> dict:
    stmt = select(AuditEvent)
    if kind is not None:
        stmt = stmt.where(AuditEvent.kind == kind)
    if person_id is not None:
        stmt = stmt.where(AuditEvent.person_id == person_id)
    if from_ is not None:
        stmt = stmt.where(AuditEvent.created_at >= from_)
    if to is not None:
        stmt = stmt.where(AuditEvent.created_at <= to)
    stmt = (
        stmt.order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        .offset(offset)
        .limit(limit)
    )
    events = session.scalars(stmt).all()
    return {"events": [_event_row(event) for event in events]}


@router.get("/api/internal/safety-engine")
def get_safety_engine(session: Session = Depends(get_session)) -> dict:
    """Return the active clinical safety engine (DB row, else packaged JSON)."""
    from app.safety.clinical_engine import engine_version, load_engine, load_engine_from_db

    db_config = load_engine_from_db(session)
    if db_config is not None:
        version = str((db_config.get("engine") or {}).get("version") or engine_version())
        return {"source": "database", "version": version, "config": db_config}
    file_config = load_engine()
    return {
        "source": "package",
        "version": engine_version(),
        "config": file_config,
    }
