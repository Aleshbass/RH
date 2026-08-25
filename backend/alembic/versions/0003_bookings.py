"""bookings table and payment-status domain

Revision ID: 0003_bookings
Revises: 0002b_patient_coords
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.models.types import BookingStatus

revision: str = "0003_bookings"
down_revision: Union[str, Sequence[str], None] = "0002b_patient_coords"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_BOOKING_MODES = ("teleconsult", "home_visit")
_BOOKING_STATUSES = (
    "draft",
    "awaiting_payment",
    "processing",
    "confirmed",
    "cancelled",
    "completed",
)

assert set(_BOOKING_STATUSES) == {status.value for status in BookingStatus}


def _in_check(table: str, column: str, values: Sequence[str]) -> sa.CheckConstraint:
    quoted = ", ".join(f"'{value}'" for value in values)
    return sa.CheckConstraint(f"{column} IN ({quoted})", name=f"ck_{table}_{column}")


def upgrade() -> None:
    op.create_table(
        "bookings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
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
            nullable=False,
        ),
        sa.Column("mode", sa.String(), nullable=False),
        sa.Column("slot_start", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("paystack_reference", sa.String(), nullable=True),
        sa.Column("amount_kobo", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("paystack_reference", name="uq_bookings_paystack_reference"),
        _in_check("bookings", "mode", _BOOKING_MODES),
        _in_check("bookings", "status", _BOOKING_STATUSES),
    )


def downgrade() -> None:
    op.drop_table("bookings")
