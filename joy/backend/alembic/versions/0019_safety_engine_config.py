"""Persist clinical safety engine JSON for queryable access.

Revision ID: 0019_safety_engine_config
Revises: 0018_booking_confirmed_at
Create Date: 2026-08-31
"""

from __future__ import annotations

import json
from pathlib import Path

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019_safety_engine_config"
down_revision: str | None = "0018_booking_confirmed_at"
branch_labels = None
depends_on = None

_ENGINE_PATH = (
    Path(__file__).resolve().parents[2] / "app" / "safety" / "clinical_engine_v1.json"
)

_TRIAGE_STATUSES = ("open", "summarised", "escalated", "specialist_review")
_PREV_TRIAGE_STATUSES = ("open", "summarised", "escalated")


def upgrade() -> None:
    op.drop_constraint("ck_triage_sessions_status", "triage_sessions", type_="check")
    op.create_check_constraint(
        "ck_triage_sessions_status",
        "triage_sessions",
        "status IN (" + ", ".join(f"'{value}'" for value in _TRIAGE_STATUSES) + ")",
    )

    op.create_table(
        "safety_engine_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("version", sa.String(), nullable=False),
        sa.Column("config", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint("version", name="uq_safety_engine_configs_version"),
    )
    if _ENGINE_PATH.is_file():
        config = json.loads(_ENGINE_PATH.read_text(encoding="utf-8"))
        version = str((config.get("engine") or {}).get("version") or "1.0.0")
        op.execute(
            sa.text(
                "INSERT INTO safety_engine_configs (id, version, config) "
                "VALUES (gen_random_uuid(), :version, CAST(:config AS jsonb))"
            ).bindparams(version=version, config=json.dumps(config))
        )


def downgrade() -> None:
    op.execute(
        "UPDATE triage_sessions SET status = 'escalated' "
        "WHERE status = 'specialist_review'"
    )
    op.drop_constraint("ck_triage_sessions_status", "triage_sessions", type_="check")
    op.create_check_constraint(
        "ck_triage_sessions_status",
        "triage_sessions",
        "status IN (" + ", ".join(f"'{value}'" for value in _PREV_TRIAGE_STATUSES) + ")",
    )
    op.drop_table("safety_engine_configs")
