from pathlib import Path

from sqlalchemy import CheckConstraint, Enum as SAEnum

from app.models import Base  # noqa: F401 — register tables
from app.models.types import (
    AuditKind,
    ConditionArea,
    ExtractedTriage,
    PatientPhase,
    PermissionTier,
    Persona,
    SafetyResult,
)

_BASELINE = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0001_baseline.py"

_VALUE_DOMAINS = (
    ("messages", "role", frozenset({"user", "joy", "system"})),
    ("triage_sessions", "status", frozenset({"open", "summarised", "escalated"})),
    ("conversations", "persona", frozenset(p.value for p in Persona)),
    ("conversations", "phase", frozenset(p.value for p in PatientPhase)),
    ("family_members", "permission_tier", frozenset(p.value for p in PermissionTier)),
    ("triage_sessions", "condition_area", frozenset(c.value for c in ConditionArea)),
    ("audit_events", "kind", frozenset(k.value for k in AuditKind)),
)


def test_audit_kind_includes_family():
    assert "family" in {k.value for k in AuditKind}


def test_audit_kind_family_migration_revises_relay_and_updates_check():
    path = Path(__file__).resolve().parents[1] / "alembic" / "versions" / "0013_audit_kind_family.py"
    assert path.is_file()
    source = path.read_text()
    assert "0012_family_relay" in source
    assert "ck_audit_events_kind" in source
    assert '"family"' in source
    assert "drop_constraint" in source
    assert "create_check_constraint" in source


def test_extracted_triage_defaults():
    extracted = ExtractedTriage()
    assert extracted.condition_area is None
    assert extracted.flags == {}
    assert Persona.PATIENT == "patient"
    assert ConditionArea.NEURO == "neuro"
    result = SafetyResult(fired=False, rule_ids=[], reason_plain_language="", action="continue")
    assert result.fired is False


def test_audit_events_forbid_mutation_trigger_in_baseline():
    source = _BASELINE.read_text()
    lowered = source.lower()
    assert "create trigger" in lowered
    assert "audit_events" in lowered
    assert "update" in lowered
    assert "delete" in lowered
    assert "raise" in lowered


def test_value_domains_on_model_metadata():
    for table_name, column_name, allowed in _VALUE_DOMAINS:
        table = Base.metadata.tables[table_name]
        assert _column_has_domain(table, column_name, allowed), (
            f"{table_name}.{column_name} must use Enum or CheckConstraint for {sorted(allowed)}"
        )


def test_value_domains_in_baseline_migration():
    source = _BASELINE.read_text()
    assert "CheckConstraint" in source or "Enum(" in source or "sa.Enum" in source
    for _table_name, column_name, allowed in _VALUE_DOMAINS:
        for value in allowed:
            assert value in source, f"{column_name} domain missing {value!r} in 0001_baseline"


def _column_has_domain(table, column_name: str, allowed: frozenset[str]) -> bool:
    column = table.c[column_name]
    if isinstance(column.type, SAEnum):
        return frozenset(column.type.enums) == allowed
    for constraint in table.constraints:
        if not isinstance(constraint, CheckConstraint):
            continue
        text = str(constraint.sqltext)
        if column_name not in text:
            continue
        if all(value in text for value in allowed):
            return True
    return False
