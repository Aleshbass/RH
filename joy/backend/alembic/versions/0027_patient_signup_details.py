"""Patient details from the WhatsApp sign-up form.

Revision ID: 0027_patient_signup_details
Revises: 0026_reminder_booking_details
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "0027_patient_signup_details"
down_revision = "0026_reminder_booking_details"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("gender", sa.String(length=32), nullable=True))
    op.add_column("patients", sa.Column("date_of_birth", sa.Date(), nullable=True))
    op.add_column("patients", sa.Column("email", sa.String(length=320), nullable=True))
    op.add_column("patients", sa.Column("state", sa.String(length=64), nullable=True))
    op.add_column("patients", sa.Column("signup_completed_at", sa.DateTime(timezone=True), nullable=True))
    # Form answers waiting to reach Rehabify (cleared once saved there)
    op.add_column("patients", sa.Column("signup_pending_rh", postgresql.JSONB(), nullable=True))


def downgrade() -> None:
    for column in ("signup_pending_rh", "signup_completed_at", "state", "email", "date_of_birth", "gender"):
        op.drop_column("patients", column)
