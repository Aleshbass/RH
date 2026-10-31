"""Allow 30-minute and appointment-start reminders for each booking.

Revision ID: 0025_two_appointment_reminder_points
Revises: 0024_reminder_delivery_channels
"""

import sqlalchemy as sa
from alembic import op


revision = "0025_two_reminder_points"
down_revision = "0024_reminder_delivery_channels"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "appointment_reminders",
        sa.Column("reminder_kind", sa.String(length=32), nullable=False, server_default="thirty_minutes_before"),
    )
    op.drop_constraint("appointment_reminders_rh_booking_id_key", "appointment_reminders", type_="unique")
    op.create_unique_constraint(
        "uq_appointment_reminders_booking_kind",
        "appointment_reminders",
        ["rh_booking_id", "reminder_kind"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_appointment_reminders_booking_kind", "appointment_reminders", type_="unique")
    op.create_unique_constraint("appointment_reminders_rh_booking_id_key", "appointment_reminders", ["rh_booking_id"])
    op.drop_column("appointment_reminders", "reminder_kind")
