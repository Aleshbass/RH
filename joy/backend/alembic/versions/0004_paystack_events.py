"""unique Paystack webhook event ids for idempotent confirmation

Revision ID: 0004_paystack_events
Revises: 0003_bookings
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004_paystack_events"
down_revision: Union[str, Sequence[str], None] = "0003_bookings"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paystack_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("reference", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("paystack_events")
