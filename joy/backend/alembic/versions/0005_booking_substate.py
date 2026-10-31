"""nullable booking substate on conversations (not PatientPhase)

Revision ID: 0005_booking_substate
Revises: 0004_paystack_events
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0005_booking_substate"
down_revision: Union[str, Sequence[str], None] = "0004_paystack_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column("booking_substate", sa.String(), nullable=True),
    )
    op.add_column(
        "conversations",
        sa.Column("booking_context", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("conversations", "booking_context")
    op.drop_column("conversations", "booking_substate")
