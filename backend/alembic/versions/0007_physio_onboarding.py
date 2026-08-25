"""physio onboarding fields and 48-hour verification SLA

Revision ID: 0007_physio_onboarding
Revises: 0006_audit_kind_booking
Create Date: 2026-08-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_physio_onboarding"
down_revision: Union[str, Sequence[str], None] = "0006_audit_kind_booking"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_ONBOARDING_STATUSES = ("collecting", "submitted", "verified", "rejected")


def upgrade() -> None:
    op.add_column("physiotherapists", sa.Column("mrtb_number", sa.String(), nullable=True))
    op.add_column(
        "physiotherapists",
        sa.Column(
            "credential_urls",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
    )
    op.add_column(
        "physiotherapists",
        sa.Column(
            "onboarding_status",
            sa.String(),
            nullable=False,
            server_default="collecting",
        ),
    )
    op.create_check_constraint(
        "ck_physiotherapists_onboarding_status",
        "physiotherapists",
        "onboarding_status IN ("
        + ", ".join(f"'{value}'" for value in _ONBOARDING_STATUSES)
        + ")",
    )
    op.add_column(
        "physiotherapists",
        sa.Column("credentials_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "physiotherapists",
        sa.Column("verification_due_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("physiotherapists", "verification_due_at")
    op.drop_column("physiotherapists", "credentials_submitted_at")
    op.drop_constraint(
        "ck_physiotherapists_onboarding_status", "physiotherapists", type_="check"
    )
    op.drop_column("physiotherapists", "onboarding_status")
    op.drop_column("physiotherapists", "credential_urls")
    op.drop_column("physiotherapists", "mrtb_number")
