from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, event, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, str_enum
from app.models.types import AuditKind


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    kind: Mapped[AuditKind] = mapped_column(str_enum(AuditKind, "audit_kind"), nullable=False)
    actor_phone: Mapped[str] = mapped_column(String, nullable=False)
    person_id: Mapped[UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)


@event.listens_for(AuditEvent, "before_update")
def _reject_audit_update(mapper, connection, target) -> None:
    raise RuntimeError("audit_events is append-only")


@event.listens_for(AuditEvent, "before_delete")
def _reject_audit_delete(mapper, connection, target) -> None:
    raise RuntimeError("audit_events is append-only")
