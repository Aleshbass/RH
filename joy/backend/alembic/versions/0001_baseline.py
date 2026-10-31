"""baseline schema: identity, conversation, triage, audit

Revision ID: 0001_baseline
Revises:
Create Date: 2026-08-22

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from app.models.types import AuditKind, ConditionArea, PatientPhase, PermissionTier, Persona

revision: str = "0001_baseline"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_MESSAGE_ROLES = ("user", "joy", "system")
_TRIAGE_STATUSES = ("open", "summarised", "escalated")
_PERSONAS = ("patient", "physiotherapist", "family", "admin", "partner")
_PHASES = ("first_contact", "mid_triage", "post_triage")
_PERMISSION_TIERS = ("view_only", "full_access")
_CONDITION_AREAS = (
    "msk",
    "neuro",
    "paediatric",
    "cardiorespiratory",
    "womens_health",
    "post_surgical",
)
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

assert set(_PERSONAS) == {p.value for p in Persona}
assert set(_PHASES) == {p.value for p in PatientPhase}
assert set(_PERMISSION_TIERS) == {p.value for p in PermissionTier}
assert set(_CONDITION_AREAS) == {c.value for c in ConditionArea}
# Historical baseline values are intentionally a subset of future releases.
assert set(_AUDIT_KINDS).issubset({k.value for k in AuditKind})


def _in_check(table: str, column: str, values: Sequence[str]) -> sa.CheckConstraint:
    quoted = ", ".join(f"'{value}'" for value in values)
    return sa.CheckConstraint(f"{column} IN ({quoted})", name=f"ck_{table}_{column}")


def upgrade() -> None:
    op.create_table(
        "patients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone_e164", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("phone_e164", name="uq_patients_phone_e164"),
    )
    op.create_table(
        "physiotherapists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone_e164", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("phone_e164", name="uq_physiotherapists_phone_e164"),
    )
    op.create_table(
        "admins",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone_e164", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("phone_e164", name="uq_admins_phone_e164"),
    )
    op.create_table(
        "partners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone_e164", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("phone_e164", name="uq_partners_phone_e164"),
    )
    op.create_table(
        "family_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("phone_e164", sa.String(), nullable=False),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("permission_tier", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("phone_e164", name="uq_family_members_phone_e164"),
        _in_check("family_members", "permission_tier", _PERMISSION_TIERS),
    )
    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("persona", sa.String(), nullable=False),
        sa.Column("phase", sa.String(), nullable=False),
        sa.Column("last_known_language", sa.String(), nullable=True),
        sa.Column("summary_text", sa.Text(), nullable=True),
        _in_check("conversations", "persona", _PERSONAS),
        _in_check("conversations", "phase", _PHASES),
    )
    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id"), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("wa_message_id", sa.String(), nullable=True),
        sa.UniqueConstraint("wa_message_id", name="uq_messages_wa_message_id"),
        _in_check("messages", "role", _MESSAGE_ROLES),
    )
    op.create_table(
        "triage_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("patient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("patients.id"), nullable=False),
        sa.Column("extracted", postgresql.JSONB(), nullable=False),
        sa.Column("condition_area", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        _in_check("triage_sessions", "condition_area", _CONDITION_AREAS),
        _in_check("triage_sessions", "status", _TRIAGE_STATUSES),
    )
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("actor_phone", sa.String(), nullable=False),
        sa.Column("person_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        _in_check("audit_events", "kind", _AUDIT_KINDS),
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION audit_events_forbid_mutation()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            RAISE EXCEPTION 'audit_events is append-only';
        END;
        $$
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_events_forbid_update
        BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW
        EXECUTE PROCEDURE audit_events_forbid_mutation()
        """
    )
    op.execute("REVOKE UPDATE, DELETE ON TABLE audit_events FROM PUBLIC")


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_events_forbid_update ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS audit_events_forbid_mutation()")
    op.drop_table("audit_events")
    op.drop_table("triage_sessions")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("family_members")
    op.drop_table("partners")
    op.drop_table("admins")
    op.drop_table("physiotherapists")
    op.drop_table("patients")
