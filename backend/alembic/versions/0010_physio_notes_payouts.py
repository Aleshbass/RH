"""session notes, home-visit check-in columns, and payouts

Revision ID: 0010_physio_notes_payouts
Revises: 0009_booking_physio_response
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_physio_notes_payouts"
down_revision: Union[str, Sequence[str], None] = "0009_booking_physio_response"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PAYOUT_STATUSES = ("requested", "sent")


def upgrade() -> None:
    op.add_column("bookings", sa.Column("checkin_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("bookings", sa.Column("checkin_lat", sa.Float(), nullable=True))
    op.add_column("bookings", sa.Column("checkin_lng", sa.Float(), nullable=True))
    op.add_column("bookings", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "session_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id"),
            nullable=False,
        ),
        sa.Column("subjective", sa.Text(), nullable=False, server_default=""),
        sa.Column("objective", sa.Text(), nullable=False, server_default=""),
        sa.Column("plan", sa.Text(), nullable=False, server_default=""),
        sa.Column("transcript", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index("ix_session_notes_booking_id", "session_notes", ["booking_id"])
    op.create_table(
        "payouts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "physio_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("physiotherapists.id"),
            nullable=False,
        ),
        sa.Column("amount_kobo", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("transfer_code", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN (" + ", ".join(f"'{value}'" for value in _PAYOUT_STATUSES) + ")",
            name="ck_payouts_status",
        ),
    )
    op.create_index("ix_payouts_physio_id", "payouts", ["physio_id"])


def downgrade() -> None:
    op.drop_index("ix_payouts_physio_id", table_name="payouts")
    op.drop_table("payouts")
    op.drop_index("ix_session_notes_booking_id", table_name="session_notes")
    op.drop_table("session_notes")
    op.drop_column("bookings", "completed_at")
    op.drop_column("bookings", "checkin_lng")
    op.drop_column("bookings", "checkin_lat")
    op.drop_column("bookings", "checkin_at")
