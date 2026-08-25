"""add family to audit_events.kind check

Revision ID: 0013_audit_kind_family
Revises: 0012_family_relay
Create Date: 2026-08-25

"""

from typing import Sequence, Union

from alembic import op

from app.models.types import AuditKind

revision: str = "0013_audit_kind_family"
down_revision: Union[str, Sequence[str], None] = "0012_family_relay"
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
    "family",
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
    "booking",
)

assert set(_AUDIT_KINDS) == {k.value for k in AuditKind}


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
