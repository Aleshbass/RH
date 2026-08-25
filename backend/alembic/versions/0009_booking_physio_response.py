"""physio accept/decline on paid bookings

Revision ID: 0009_booking_physio_response
Revises: 0008_availability_slots
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0009_booking_physio_response"
down_revision: Union[str, Sequence[str], None] = "0008_availability_slots"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_PHYSIO_RESPONSES = ("accepted", "declined")


def upgrade() -> None:
    op.add_column("bookings", sa.Column("physio_response", sa.String(), nullable=True))
    op.create_check_constraint(
        "ck_bookings_physio_response",
        "bookings",
        "physio_response IS NULL OR physio_response IN ("
        + ", ".join(f"'{value}'" for value in _PHYSIO_RESPONSES)
        + ")",
    )


def downgrade() -> None:
    op.drop_constraint("ck_bookings_physio_response", "bookings", type_="check")
    op.drop_column("bookings", "physio_response")
