from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Patient(Base):
    __tablename__ = "patients"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    phone_e164: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # From the WhatsApp sign-up form (app/flows/signup.py)
    gender: Mapped[str | None] = mapped_column(String(32), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    state: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signup_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Form answers not yet saved in Rehabify (RH was unreachable); retried after later messages
    signup_pending_rh: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # Daily exercise reminders on WhatsApp (app/exercises/programme.py): "on" or "paused"
    exercise_reminders: Mapped[str | None] = mapped_column(String(16), nullable=True)
    exercise_reminder_time: Mapped[str | None] = mapped_column(String(5), nullable=True)  # "18:00", Lagos time
    exercise_reminder_last_sent_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    # When Joy last showed the plan or a reminder: a DONE reply soon after logs the session
    exercise_prompted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Booking location is deliberately structured.  The legacy display string
    # remains for compatibility with existing records and appointment notes.
    city: Mapped[str | None] = mapped_column(String, nullable=True)
    area: Mapped[str | None] = mapped_column(String, nullable=True)
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    referred_by_partner_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("partners.id"), nullable=True, index=True
    )
    urgent: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
