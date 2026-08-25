"""referral fees, patient urgent flag, partner content requests

Revision ID: 0015_referral_fees
Revises: 0014_referrals
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0015_referral_fees"
down_revision: Union[str, Sequence[str], None] = "0014_referrals"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "patients",
        sa.Column("urgent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_table(
        "referral_fees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "patient_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("patients.id"),
            nullable=False,
        ),
        sa.Column(
            "partner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("partners.id"),
            nullable=False,
        ),
        sa.Column(
            "booking_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("bookings.id"),
            nullable=False,
        ),
        sa.Column("amount_kobo", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("patient_id", name="uq_referral_fees_patient_id"),
    )
    op.create_index("ix_referral_fees_partner_id", "referral_fees", ["partner_id"])
    op.create_table(
        "partner_content_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "partner_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("partners.id"),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_partner_content_requests_partner_id",
        "partner_content_requests",
        ["partner_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_partner_content_requests_partner_id",
        table_name="partner_content_requests",
    )
    op.drop_table("partner_content_requests")
    op.drop_index("ix_referral_fees_partner_id", table_name="referral_fees")
    op.drop_table("referral_fees")
    op.drop_column("patients", "urgent")
