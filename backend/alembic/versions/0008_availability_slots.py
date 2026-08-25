"""weekly availability slots for physio calendar

Revision ID: 0008_availability_slots
Revises: 0007_physio_onboarding
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_availability_slots"
down_revision: Union[str, Sequence[str], None] = "0007_physio_onboarding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "availability_slots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "physio_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("physiotherapists.id"),
            nullable=False,
        ),
        sa.Column("weekday", sa.Integer(), nullable=False),
        sa.Column("start_hhmm", sa.String(), nullable=False),
        sa.Column("end_hhmm", sa.String(), nullable=False),
        sa.CheckConstraint(
            "weekday >= 0 AND weekday <= 6", name="ck_availability_slots_weekday"
        ),
    )
    op.create_index(
        "ix_availability_slots_physio_id", "availability_slots", ["physio_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_availability_slots_physio_id", table_name="availability_slots")
    op.drop_table("availability_slots")
