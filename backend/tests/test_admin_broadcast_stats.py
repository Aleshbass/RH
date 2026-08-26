import json
import logging

import pytest
from sqlalchemy import select

from app.booking.state import (
    advance_to_confirmed,
    create_draft,
    mark_awaiting_payment,
    mark_completed,
)
from app.models.admin import Admin
from app.models.audit_log import AuditEvent
from app.models.booking import Booking
from app.models.conversation import Message
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, BookingStatus, Persona


@pytest.fixture
def admin_row(db_session) -> Admin:
    row = Admin(phone_e164="+2348000006201")
    db_session.add(row)
    db_session.flush()
    return row


def test_non_admin_cannot_broadcast(db_session, patient_identity):
    from app.admin.broadcast import send_broadcast
    try:
        send_broadcast(db_session, patient_identity.person_id, "all_patients", "hello")
        assert False
    except PermissionError:
        pass


def test_digest_contains_counts(db_session):
    from app.admin.stats_digest import digest
    text = digest(db_session)
    assert "booking" in text.lower()


def _joy_for(db_session, persona: Persona, person_id) -> list[Message]:
    return [
        row
        for row in db_session.query(Message).all()
        if row.role == "joy"
        and row.conversation.persona == persona
        and row.conversation.person_id == person_id
    ]


def test_admin_broadcast_all_patients_persists_joy_and_enqueues(db_session, admin_row):
    from app.admin.broadcast import BROADCAST_QUEUE, send_broadcast
    from app.queue.tasks import _redis

    ada = Patient(phone_e164="+2348000006202", name="Ada", location="Lagos")
    chidi = Patient(phone_e164="+2348000006203", name="Chidi", location="Abuja")
    db_session.add_all([ada, chidi])
    db_session.flush()
    client = _redis()
    client.delete(BROADCAST_QUEUE)
    try:
        send_broadcast(db_session, admin_row.id, "all_patients", "clinic closed Monday")
        for person in (ada, chidi):
            joy = _joy_for(db_session, Persona.PATIENT, person.id)
            assert joy
            assert joy[-1].text == "clinic closed Monday"
        jobs = []
        while True:
            raw = client.rpop(BROADCAST_QUEUE)
            if raw is None:
                break
            jobs.append(json.loads(raw))
        phones = {job["phone"] for job in jobs}
        assert ada.phone_e164 in phones
        assert chidi.phone_e164 in phones
        assert all(job["text"] == "clinic closed Monday" for job in jobs)
    finally:
        client.delete(BROADCAST_QUEUE)


def test_admin_broadcast_all_physios(db_session, admin_row):
    from app.admin.broadcast import send_broadcast

    one = Physiotherapist(phone_e164="+2348000006204", specialty_tags=["msk"], city="Lagos")
    two = Physiotherapist(phone_e164="+2348000006205", specialty_tags=["neuro"], city="Abuja")
    db_session.add_all([one, two])
    db_session.flush()
    send_broadcast(db_session, admin_row.id, "all_physios", "new protocol")
    for person in (one, two):
        joy = _joy_for(db_session, Persona.PHYSIO, person.id)
        assert joy
        assert joy[-1].text == "new protocol"


def test_admin_broadcast_physios_in_city_uses_segment_city(db_session, admin_row):
    from app.admin.broadcast import send_broadcast

    lagos = Physiotherapist(phone_e164="+2348000006206", specialty_tags=["msk"], city="Lagos")
    abuja = Physiotherapist(phone_e164="+2348000006207", specialty_tags=["msk"], city="Abuja")
    db_session.add_all([lagos, abuja])
    db_session.flush()
    send_broadcast(db_session, admin_row.id, "physios_in_city:Lagos", "Lagos-only note")
    lagos_joy = _joy_for(db_session, Persona.PHYSIO, lagos.id)
    abuja_joy = _joy_for(db_session, Persona.PHYSIO, abuja.id)
    assert lagos_joy
    assert lagos_joy[-1].text == "Lagos-only note"
    assert not abuja_joy


def test_broadcast_appends_admin_audit(db_session, admin_row):
    from app.admin.broadcast import send_broadcast

    patient = Patient(phone_e164="+2348000006208", name="Tunde")
    db_session.add(patient)
    db_session.flush()
    send_broadcast(db_session, admin_row.id, "all_patients", "hello all")
    events = db_session.scalars(
        select(AuditEvent).where(AuditEvent.kind == AuditKind.ADMIN)
    ).all()
    matching = [
        event
        for event in events
        if event.payload.get("action") == "broadcast"
        and event.payload.get("segment") == "all_patients"
    ]
    assert matching
    assert matching[-1].person_id == admin_row.id
    assert matching[-1].payload.get("recipient_count") == 1


def test_broadcast_enqueue_failure_is_logged_not_raised(
    db_session, admin_row, caplog, monkeypatch
):
    from app.admin.broadcast import send_broadcast

    patient = Patient(phone_e164="+2348000006209", name="Ngozi")
    db_session.add(patient)
    db_session.flush()
    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_broadcast",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")),
    )
    with caplog.at_level(logging.ERROR):
        send_broadcast(db_session, admin_row.id, "all_patients", "still delivered")
    joy = _joy_for(db_session, Persona.PATIENT, patient.id)
    assert joy
    assert joy[-1].text == "still delivered"
    assert any(rec.exc_info for rec in caplog.records)
    assert "enqueue" in caplog.text.lower()


def test_digest_includes_bookings_revenue_and_active_physios(db_session):
    from app.admin.stats_digest import digest

    patient_a = Patient(phone_e164="+2348000006210", name="Ada", location="Lagos")
    patient_b = Patient(phone_e164="+2348000006211", name="Bola", location="Lagos")
    active = Physiotherapist(
        phone_e164="+2348000006212",
        specialty_tags=["msk"],
        verified=True,
        onboarding_status="verified",
        price_kobo=1_000_000,
        city="Lagos",
    )
    idle = Physiotherapist(
        phone_e164="+2348000006213",
        specialty_tags=["msk"],
        verified=False,
        onboarding_status="collecting",
        city="Abuja",
    )
    db_session.add_all([patient_a, patient_b, active, idle])
    db_session.flush()
    paid = create_draft(
        db_session, patient_a.id, active.id, "teleconsult", slot_start=None, amount_kobo=1_000_000
    )
    mark_awaiting_payment(paid, "ref_digest_paid")
    advance_to_confirmed(db_session, paid.id, source="paystack_webhook")
    done = create_draft(
        db_session, patient_b.id, active.id, "teleconsult", slot_start=None, amount_kobo=500_000
    )
    mark_awaiting_payment(done, "ref_digest_done")
    advance_to_confirmed(db_session, done.id, source="paystack_webhook")
    mark_completed(done)
    patient_c = Patient(phone_e164="+2348000006214", name="Chioma")
    db_session.add(patient_c)
    db_session.flush()
    create_draft(
        db_session, patient_c.id, idle.id, "teleconsult", slot_start=None, amount_kobo=9_000_000
    )
    text = digest(db_session)
    assert "booking" in text.lower()
    assert "1500000" in text
    assert "revenue_kobo" in text.lower()
    assert "1" in text
    assert "active_physio" in text.lower() or "active physio" in text.lower()
    assert db_session.query(Booking).count() == 3
    confirmed_or_done = [
        row
        for row in db_session.query(Booking).all()
        if row.status in {BookingStatus.CONFIRMED, BookingStatus.COMPLETED}
    ]
    assert len(confirmed_or_done) == 2


def test_stats_digest_job_unauthorized_without_token(client):
    response = client.post("/api/internal/jobs/stats_digest")
    assert response.status_code == 401


def test_stats_digest_job_unauthorized_wrong_token(client):
    from app.config import get_settings

    get_settings().internal_job_token = "job-secret"
    response = client.post(
        "/api/internal/jobs/stats_digest",
        headers={"X-Internal-Job-Token": "nope"},
    )
    assert response.status_code == 401


def test_stats_digest_job_returns_json_digest(client, db_session):
    from app.config import get_settings

    get_settings().internal_job_token = "job-secret"
    response = client.post(
        "/api/internal/jobs/stats_digest",
        headers={"X-Internal-Job-Token": "job-secret"},
    )
    assert response.status_code == 200
    body = response.json()
    assert "digest" in body
    assert "booking" in body["digest"].lower()
    assert "text/html" not in response.headers.get("content-type", "")
