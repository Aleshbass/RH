"""Persist backend-owned detailed conversation stage.

Revision ID: 0020_conversation_stage
Revises: 0016_rh_identity_mappings
Create Date: 2026-09-10
"""

from alembic import op
import sqlalchemy as sa


revision = "0020_conversation_stage"
down_revision = "0016_rh_identity_mappings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_audit_events_kind", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_kind",
        "audit_events",
        "kind IN ('identity', 'triage', 'safety', 'match', 'payout', 'referral_fee', 'relay', 'admin', 'booking', 'family', 'policy')",
    )
    op.add_column(
        "conversations",
        sa.Column("stage", sa.String(length=64), nullable=False, server_default="STORY_CAPTURE"),
    )


def downgrade() -> None:
    op.drop_column("conversations", "stage")
    op.drop_constraint("ck_audit_events_kind", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_kind",
        "audit_events",
        "kind IN ('identity', 'triage', 'safety', 'match', 'payout', 'referral_fee', 'relay', 'admin', 'booking', 'family')",
    )
