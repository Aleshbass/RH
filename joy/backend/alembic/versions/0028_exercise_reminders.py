"""Daily exercise reminders on WhatsApp.

Revision ID: 0028_exercise_reminders
Revises: 0027_patient_signup_details
"""

import sqlalchemy as sa
from alembic import op


revision = "0028_exercise_reminders"
down_revision = "0027_patient_signup_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("exercise_reminders", sa.String(length=16), nullable=True))
    op.add_column("patients", sa.Column("exercise_reminder_time", sa.String(length=5), nullable=True))
    op.add_column("patients", sa.Column("exercise_reminder_last_sent_on", sa.Date(), nullable=True))
    op.add_column("patients", sa.Column("exercise_prompted_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_patients_exercise_reminders", "patients", ["exercise_reminders"])


def downgrade() -> None:
    op.drop_index("ix_patients_exercise_reminders", table_name="patients")
    for column in ("exercise_prompted_at", "exercise_reminder_last_sent_on", "exercise_reminder_time", "exercise_reminders"):
        op.drop_column("patients", column)
