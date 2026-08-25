from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, literal_str_enum, str_enum
from app.models.types import BookingStatus

BOOKING_MODES = ("teleconsult", "home_visit")
PHYSIO_RESPONSES = ("accepted", "declined")


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("paystack_reference", name="uq_bookings_paystack_reference"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    patient_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("patients.id"), nullable=False
    )
    physio_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("physiotherapists.id"), nullable=False
    )
    mode: Mapped[str] = mapped_column(
        literal_str_enum(*BOOKING_MODES, name="booking_mode"), nullable=False
    )
    slot_start: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[BookingStatus] = mapped_column(
        str_enum(BookingStatus, "booking_status"), nullable=False
    )
    paystack_reference: Mapped[str | None] = mapped_column(String, nullable=True)
    amount_kobo: Mapped[int] = mapped_column(Integer, nullable=False)
    physio_response: Mapped[str | None] = mapped_column(String, nullable=True)
    checkin_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checkin_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    checkin_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
