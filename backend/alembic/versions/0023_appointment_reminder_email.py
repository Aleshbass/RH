"""Store the consented appointment-notification email with a reminder.

Revision ID: 0023_appointment_reminder_email
Revises: 0022_appointment_reminders
"""

import sqlalchemy as sa
from alembic import op


revision = "0023_appointment_reminder_email"
down_revision = "0022_appointment_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("appointment_reminders", sa.Column("email", sa.String(length=320), nullable=True))


def downgrade() -> None:
    op.drop_column("appointment_reminders", "email")
