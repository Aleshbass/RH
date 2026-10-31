from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RHIdentityMapping(Base):
    """Binds a Joy identity to an opaque RH record without duplicating clinical data."""

    __tablename__ = "rh_identity_mappings"
    __table_args__ = (UniqueConstraint("persona", "joy_person_id", name="uq_rh_identity_mapping_joy_person"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    persona: Mapped[str] = mapped_column(String(32), nullable=False)
    joy_person_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)
    rh_record_id: Mapped[str] = mapped_column(String(128), nullable=False, unique=True)
    rh_user_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
