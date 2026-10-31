"""physio directory fields for specialty matching

Revision ID: 0002_physio_matching_fields
Revises: 0001b
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_physio_matching_fields"
down_revision: Union[str, Sequence[str], None] = "0001b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "physiotherapists",
        sa.Column(
            "specialty_tags",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column("physiotherapists", sa.Column("lat", sa.Float(), nullable=True))
    op.add_column("physiotherapists", sa.Column("lng", sa.Float(), nullable=True))
    op.add_column(
        "physiotherapists",
        sa.Column("price_kobo", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "physiotherapists",
        sa.Column("rating", sa.Float(), nullable=False, server_default="0"),
    )
    op.add_column(
        "physiotherapists",
        sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "physiotherapists",
        sa.Column("service_radius_km", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("physiotherapists", "service_radius_km")
    op.drop_column("physiotherapists", "verified")
    op.drop_column("physiotherapists", "rating")
    op.drop_column("physiotherapists", "price_kobo")
    op.drop_column("physiotherapists", "lng")
    op.drop_column("physiotherapists", "lat")
    op.drop_column("physiotherapists", "specialty_tags")
