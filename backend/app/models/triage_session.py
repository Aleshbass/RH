from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, literal_str_enum, str_enum
from app.models.types import ConditionArea

TRIAGE_STATUSES = ("open", "summarised", "escalated")


class TriageSession(Base):
    __tablename__ = "triage_sessions"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False
    )
    extracted: Mapped[dict] = mapped_column(JSONB, nullable=False)
    condition_area: Mapped[ConditionArea | None] = mapped_column(
        str_enum(ConditionArea, "condition_area"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        literal_str_enum(*TRIAGE_STATUSES, name="triage_status"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
