from inspect import getmembers, isfunction
from uuid import UUID

import pytest

from app.audit.logger import append
from app.models.audit_log import AuditEvent
from app.models.patient import Patient
from app.models.types import AuditKind


@pytest.fixture
def patient_id(db_session):
    patient = Patient(phone_e164="+2348000000001")
    db_session.add(patient)
    db_session.flush()
    return patient.id


def test_audit_insert_not_update(db_session, patient_id):
    first = append(
        db_session,
        kind=AuditKind.SAFETY,
        actor_phone="+2348000000001",
        person_id=patient_id,
        payload={"fired": False},
    )
    second = append(
        db_session,
        kind=AuditKind.SAFETY,
        actor_phone="+2348000000001",
        person_id=patient_id,
        payload={"fired": True},
    )
    rows = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.person_id == patient_id)
        .order_by(AuditEvent.created_at)
        .all()
    )
    assert len(rows) == 2
    assert rows[0].id == first
    assert rows[1].payload["fired"] is True


def test_append_returns_uuid(db_session, patient_id):
    event_id = append(
        db_session,
        kind=AuditKind.TRIAGE,
        actor_phone="+2348000000001",
        person_id=patient_id,
        payload={"status": "open"},
    )
    assert isinstance(event_id, UUID)
    stored = db_session.get(AuditEvent, event_id)
    assert stored is not None
    assert stored.kind == AuditKind.TRIAGE
    assert stored.actor_phone == "+2348000000001"
    assert stored.person_id == patient_id
    assert stored.payload == {"status": "open"}


def test_append_allows_null_person_id(db_session):
    event_id = append(
        db_session,
        kind=AuditKind.IDENTITY,
        actor_phone="+2348000000999",
        person_id=None,
        payload={"resolved": False},
    )
    stored = db_session.get(AuditEvent, event_id)
    assert stored is not None
    assert stored.person_id is None


def test_logger_exposes_insert_only():
    import app.audit.logger as logger_mod

    names = {name for name, _ in getmembers(logger_mod, isfunction)}
    assert "append" in names
    assert "update" not in names
    assert "delete" not in names
    assert "merge" not in names


def test_mutating_loaded_event_still_leaves_two_rows(db_session, patient_id):
    first = append(
        db_session,
        kind=AuditKind.SAFETY,
        actor_phone="+2348000000001",
        person_id=patient_id,
        payload={"fired": False},
    )
    second = append(
        db_session,
        kind=AuditKind.SAFETY,
        actor_phone="+2348000000001",
        person_id=patient_id,
        payload={"fired": True},
    )
    loaded = db_session.get(AuditEvent, first)
    assert loaded is not None
    assert loaded.payload["fired"] is False
    rows = db_session.query(AuditEvent).filter(AuditEvent.person_id == patient_id).all()
    assert len(rows) == 2
    assert {row.id for row in rows} == {first, second}
