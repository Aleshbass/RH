"""RH identity mappings for the Joy integration boundary.

Revision ID: 0016_rh_identity_mappings
Revises: 0015_referral_fees
Create Date: 2026-09-09
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0016_rh_identity_mappings"
down_revision: Union[str, Sequence[str], None] = "0015_referral_fees"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rh_identity_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("persona", sa.String(length=32), nullable=False),
        sa.Column("joy_person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rh_record_id", sa.String(length=128), nullable=False),
        sa.Column("rh_user_id", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("persona", "joy_person_id", name="uq_rh_identity_mapping_joy_person"),
        sa.UniqueConstraint("rh_record_id"),
    )
    op.create_index("ix_rh_identity_mappings_joy_person_id", "rh_identity_mappings", ["joy_person_id"])


def downgrade() -> None:
    op.drop_index("ix_rh_identity_mappings_joy_person_id", table_name="rh_identity_mappings")
    op.drop_table("rh_identity_mappings")
