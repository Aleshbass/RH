"""Self-referral intake: the language a patient chose and when they consented to care.

Revision ID: 0029_self_referral_intake
Revises: 0028_exercise_reminders
"""

import sqlalchemy as sa
from alembic import op


revision = "0029_self_referral_intake"
down_revision = "0028_exercise_reminders"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("preferred_language", sa.String(length=8), nullable=True))
    op.add_column("patients", sa.Column("care_consent_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "care_consent_at")
    op.drop_column("patients", "preferred_language")
