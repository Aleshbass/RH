"""Joy's long-term memory of each patient (app/conversation/memory.py).

Revision ID: 0030_patient_memory
Revises: 0029_self_referral_intake
"""

import sqlalchemy as sa
from alembic import op


revision = "0030_patient_memory"
down_revision = "0029_self_referral_intake"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("patients", sa.Column("memory_summary", sa.Text(), nullable=True))
    op.add_column("patients", sa.Column("memory_updated_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("patients", "memory_updated_at")
    op.drop_column("patients", "memory_summary")
