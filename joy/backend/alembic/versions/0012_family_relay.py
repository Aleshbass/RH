"""relay_threads for family <-> physio questions without sharing phones

Revision ID: 0012_family_relay
Revises: 0011_family_revoke
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012_family_relay"
down_revision: Union[str, Sequence[str], None] = "0011_family_revoke"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "relay_threads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("family_members.id"),
            nullable=False,
        ),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id"),
            nullable=False,
        ),
        sa.Column(
            "physio_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("physiotherapists.id"),
            nullable=True,
        ),
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id"),
            nullable=True,
        ),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("answer", sa.Text(), nullable=True),
        sa.Column("last_physio_payload", sa.Text(), nullable=False, server_default=""),
        sa.Column("family_visible_text", sa.Text(), nullable=True),
        sa.Column("physio_visible_text", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_relay_threads_family_member_id", "relay_threads", ["family_member_id"])
    op.create_index("ix_relay_threads_patient_id", "relay_threads", ["patient_id"])
    op.create_index("ix_relay_threads_physio_id", "relay_threads", ["physio_id"])


def downgrade() -> None:
    op.drop_index("ix_relay_threads_physio_id", table_name="relay_threads")
    op.drop_index("ix_relay_threads_patient_id", table_name="relay_threads")
    op.drop_index("ix_relay_threads_family_member_id", table_name="relay_threads")
    op.drop_table("relay_threads")
