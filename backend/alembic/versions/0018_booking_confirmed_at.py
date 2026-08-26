"""booking confirmed_at from paystack webhook

Revision ID: 0018_booking_confirmed_at
Revises: 0017_physio_city
Create Date: 2026-08-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0018_booking_confirmed_at"
down_revision: Union[str, Sequence[str], None] = "0017_physio_city"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bookings", "confirmed_at")
