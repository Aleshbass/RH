"""add booking to audit_events.kind check

Revision ID: 0006_audit_kind_booking
Revises: 0005_booking_substate
Create Date: 2026-08-25

"""

from typing import Sequence, Union

from alembic import op

revision: str = "0006_audit_kind_booking"
down_revision: Union[str, Sequence[str], None] = "0005_booking_substate"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_AUDIT_KINDS = (
    "identity",
    "triage",
    "safety",
    "match",
    "payout",
    "referral_fee",
    "relay",
    "admin",
    "booking",
)
_PREVIOUS_KINDS = (
    "identity",
    "triage",
    "safety",
    "match",
    "payout",
    "referral_fee",
    "relay",
    "admin",
)

assert "booking" in _AUDIT_KINDS
assert "booking" not in _PREVIOUS_KINDS


def upgrade() -> None:
    op.drop_constraint("ck_audit_events_kind", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_kind",
        "audit_events",
        "kind IN (" + ", ".join(f"'{value}'" for value in _AUDIT_KINDS) + ")",
    )


def downgrade() -> None:
    op.drop_constraint("ck_audit_events_kind", "audit_events", type_="check")
    op.create_check_constraint(
        "ck_audit_events_kind",
        "audit_events",
        "kind IN (" + ", ".join(f"'{value}'" for value in _PREVIOUS_KINDS) + ")",
    )
