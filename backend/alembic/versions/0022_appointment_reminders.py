"""Durable reminders for RH-confirmed Joy appointments.

Revision ID: 0022_appointment_reminders
Revises: 0021_patient_booking_city_area
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0022_appointment_reminders"
down_revision = "0021_patient_booking_city_area"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "appointment_reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("rh_booking_id", sa.String(length=128), nullable=False, unique=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("phone_e164", sa.String(length=32), nullable=False),
        sa.Column("provider_name", sa.String(length=256), nullable=False),
        sa.Column("service_mode", sa.String(length=32), nullable=False),
        sa.Column("session_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reminder_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_appointment_reminders_rh_booking_id", "appointment_reminders", ["rh_booking_id"])
    op.create_index("ix_appointment_reminders_patient_id", "appointment_reminders", ["patient_id"])
    op.create_index("ix_appointment_reminders_reminder_at", "appointment_reminders", ["reminder_at"])


def downgrade() -> None:
    op.drop_index("ix_appointment_reminders_reminder_at", table_name="appointment_reminders")
    op.drop_index("ix_appointment_reminders_patient_id", table_name="appointment_reminders")
    op.drop_index("ix_appointment_reminders_rh_booking_id", table_name="appointment_reminders")
    op.drop_table("appointment_reminders")
