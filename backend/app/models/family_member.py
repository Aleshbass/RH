from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, str_enum
from app.models.types import PermissionTier


class FamilyMember(Base):
    __tablename__ = "family_members"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    phone_e164: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    patient_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False
    )
    permission_tier: Mapped[PermissionTier] = mapped_column(
        str_enum(PermissionTier, "permission_tier"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
