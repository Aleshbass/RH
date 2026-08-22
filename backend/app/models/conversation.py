from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, literal_str_enum, str_enum
from app.models.types import PatientPhase, Persona

MESSAGE_ROLES = ("user", "joy", "system")


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    person_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    persona: Mapped[Persona] = mapped_column(str_enum(Persona, "persona"), nullable=False)
    phase: Mapped[PatientPhase] = mapped_column(str_enum(PatientPhase, "patient_phase"), nullable=False)
    last_known_language: Mapped[str | None] = mapped_column(String, nullable=True)
    summary_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    messages: Mapped[list["Message"]] = relationship(back_populates="conversation")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True), ForeignKey("conversations.id"), nullable=False
    )
    role: Mapped[str] = mapped_column(literal_str_enum(*MESSAGE_ROLES, name="message_role"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    wa_message_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    conversation: Mapped[Conversation] = relationship(back_populates="messages")
