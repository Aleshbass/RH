"""family_members.revoked_at for audit-preserving revoke

Revision ID: 0011_family_revoke
Revises: 0010_physio_notes_payouts
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0011_family_revoke"
down_revision: Union[str, Sequence[str], None] = "0010_physio_notes_payouts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "family_members",
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("family_members", "revoked_at")
