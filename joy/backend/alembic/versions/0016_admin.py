"""admin takeover flags and physio web-review marker

Revision ID: 0016_admin
Revises: 0015_referral_fees
Create Date: 2026-08-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0016_admin"
down_revision: Union[str, Sequence[str], None] = "0015_referral_fees"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column(
            "human_takeover",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )
    op.add_column(
        "conversations",
        sa.Column("takeover_notified_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "physiotherapists",
        sa.Column(
            "needs_web_review",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("physiotherapists", "needs_web_review")
    op.drop_column("conversations", "takeover_notified_at")
    op.drop_column("conversations", "human_takeover")
