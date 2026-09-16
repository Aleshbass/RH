"""Durable, idempotent RH-to-Joy event receipt.

Revision ID: 0020_rh_integration_events
Revises: 0020_conversation_stage
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020_rh_integration_events"
down_revision = "0020_conversation_stage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rh_integration_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("event_id", sa.String(length=160), nullable=False, unique=True),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("payload_sha256", sa.String(length=64), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_rh_integration_events_event_id", "rh_integration_events", ["event_id"])


def downgrade() -> None:
    op.drop_index("ix_rh_integration_events_event_id", table_name="rh_integration_events")
    op.drop_table("rh_integration_events")
