"""partner referral_code and patient referred_by_partner_id

Revision ID: 0014_referrals
Revises: 0013_audit_kind_family
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0014_referrals"
down_revision: Union[str, Sequence[str], None] = "0013_audit_kind_family"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("partners", sa.Column("referral_code", sa.String(), nullable=True))
    op.create_unique_constraint("uq_partners_referral_code", "partners", ["referral_code"])
    op.add_column(
        "patients",
        sa.Column(
            "referred_by_partner_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        "fk_patients_referred_by_partner_id",
        "patients",
        "partners",
        ["referred_by_partner_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_patients_referred_by_partner_id", "patients", type_="foreignkey")
    op.drop_column("patients", "referred_by_partner_id")
    op.drop_constraint("uq_partners_referral_code", "partners", type_="unique")
    op.drop_column("partners", "referral_code")
