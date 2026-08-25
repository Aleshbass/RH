from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, literal_str_enum

PAYOUT_STATUSES = ("requested", "sent")


class Payout(Base):
    __tablename__ = "payouts"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    physio_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("physiotherapists.id"), nullable=False, index=True
    )
    amount_kobo: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        literal_str_enum(*PAYOUT_STATUSES, name="payout_status"), nullable=False
    )
    transfer_code: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
