"""Store RH's patient-facing booking code and stable meeting URL on reminders.

Revision ID: 0026_reminder_patient_booking_details
Revises: 0025_two_reminder_points
"""

import sqlalchemy as sa
from alembic import op


revision = "0026_reminder_patient_booking_details"
down_revision = "0025_two_reminder_points"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("appointment_reminders", sa.Column("booking_code", sa.String(length=32), nullable=True))
    op.add_column("appointment_reminders", sa.Column("meeting_url", sa.String(length=2048), nullable=True))


def downgrade() -> None:
    op.drop_column("appointment_reminders", "meeting_url")
    op.drop_column("appointment_reminders", "booking_code")
