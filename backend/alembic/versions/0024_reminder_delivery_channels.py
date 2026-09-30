"""Track reminder delivery per channel.

Revision ID: 0024_reminder_delivery_channels
Revises: 0023_appointment_reminder_email
"""

import sqlalchemy as sa
from alembic import op


revision = "0024_reminder_delivery_channels"
down_revision = "0023_appointment_reminder_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("appointment_reminders", sa.Column("whatsapp_sent_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("appointment_reminders", sa.Column("email_sent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("appointment_reminders", "email_sent_at")
    op.drop_column("appointment_reminders", "whatsapp_sent_at")
