from datetime import datetime, timezone

import pytest

from app.audit.logger import append
from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
from app.config import get_settings
from app.main import app
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.referral_fee import ReferralFee
from app.models.types import AuditKind, BookingStatus

HEADERS = {"X-Internal-Key": "test-key"}


def _settings():
    override = app.dependency_overrides.get(get_settings)
    return override() if override is not None else get_settings()


@pytest.fixture(autouse=True)
def internal_api_key(client):
    _settings().internal_api_secret = "test-key"


@pytest.fixture
def safety_audit_row(db_session, patient_identity):
    event_id = append(
        db_session,
        kind=AuditKind.SAFETY,
        actor_phone=patient_identity.phone_e164,
        person_id=patient_identity.person_id,
        payload={"fired": True, "rule_ids": ["chest_pain"]},
    )
    from app.models.audit_log import AuditEvent

    return db_session.get(AuditEvent, event_id)


@pytest.fixture
def confirmed_booking(db_session):
    patient = Patient(phone_e164="+2348000006301", name="Ada Okonkwo")
    physio = Physiotherapist(
        phone_e164="+2348000006302",
        specialty_tags=["msk"],
        price_kobo=1_500_000,
        city="Lagos",
        credential_urls=["https://files/mrtb.jpg"],
        verified=True,
    )
    db_session.add_all([patient, physio])
    db_session.flush()
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        amount_kobo=1_500_000,
    )
    mark_awaiting_payment(booking, "ref_internal_receipt")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.flush()
    return booking


def test_audit_is_independently_queryable(client, db_session, safety_audit_row):
    response = client.get(
        "/api/internal/audit",
        params={"kind": "safety", "person_id": str(safety_audit_row.person_id)},
        headers={"X-Internal-Key": "test-key"},
    )
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()["events"]]
    assert str(safety_audit_row.id) in ids


def test_audit_rejects_patch(client):
    response = client.patch("/api/internal/audit/00000000-0000-0000-0000-000000000001", json={"kind": "x"}, headers={"X-Internal-Key": "test-key"})
    assert response.status_code in {404, 405, 422}


def test_receipt_json_not_html(client, confirmed_booking):
    response = client.get(f"/api/internal/receipts/{confirmed_booking.id}", headers={"X-Internal-Key": "test-key"})
    assert response.status_code == 200
    assert "text/html" not in response.headers.get("content-type", "")
    assert "amount_kobo" in response.json()


def test_audit_unauthorized_without_key(client, safety_audit_row):
    response = client.get("/api/internal/audit", params={"kind": "safety"})
    assert response.status_code == 401


def test_audit_unauthorized_wrong_key(client, safety_audit_row):
    response = client.get(
        "/api/internal/audit",
        params={"kind": "safety"},
        headers={"X-Internal-Key": "wrong-key"},
    )
    assert response.status_code == 401


def test_internal_routes_fail_closed_when_secret_empty(client, safety_audit_row):
    _settings().internal_api_secret = ""
    response = client.get(
        "/api/internal/audit",
        params={"kind": "safety"},
        headers={"X-Internal-Key": "test-key"},
    )
    assert response.status_code == 401


def test_audit_lists_events_ascending(client, db_session, patient_identity):
    from app.models.audit_log import AuditEvent

    later = AuditEvent(
        kind=AuditKind.TRIAGE,
        actor_phone=patient_identity.phone_e164,
        person_id=patient_identity.person_id,
        payload={"n": 1},
        created_at=datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc),
    )
    earlier = AuditEvent(
        kind=AuditKind.MATCH,
        actor_phone=patient_identity.phone_e164,
        person_id=patient_identity.person_id,
        payload={"n": 2},
        created_at=datetime(2026, 8, 1, 11, 0, tzinfo=timezone.utc),
    )
    db_session.add_all([later, earlier])
    db_session.flush()

    response = client.get(
        "/api/internal/audit",
        params={"person_id": str(patient_identity.person_id)},
        headers=HEADERS,
    )
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()["events"]]
    assert ids.index(str(earlier.id)) < ids.index(str(later.id))


def test_audit_filters_kind_person_and_time(client, db_session, patient_identity):
    other = Patient(phone_e164="+2348000006303")
    db_session.add(other)
    db_session.flush()
    kept = append(
        db_session,
        kind=AuditKind.SAFETY,
        actor_phone=patient_identity.phone_e164,
        person_id=patient_identity.person_id,
        payload={"keep": True},
    )
    append(
        db_session,
        kind=AuditKind.TRIAGE,
        actor_phone=patient_identity.phone_e164,
        person_id=patient_identity.person_id,
        payload={"wrong_kind": True},
    )
    append(
        db_session,
        kind=AuditKind.SAFETY,
        actor_phone=other.phone_e164,
        person_id=other.id,
        payload={"wrong_person": True},
    )
    from app.models.audit_log import AuditEvent

    old_row = AuditEvent(
        kind=AuditKind.SAFETY,
        actor_phone=patient_identity.phone_e164,
        person_id=patient_identity.person_id,
        payload={"too_old": True},
        created_at=datetime(2020, 1, 1, tzinfo=timezone.utc),
    )
    db_session.add(old_row)
    db_session.flush()
    old = old_row.id

    response = client.get(
        "/api/internal/audit",
        params={
            "kind": "safety",
            "person_id": str(patient_identity.person_id),
            "from": "2026-01-01T00:00:00+00:00",
            "to": "2026-12-31T23:59:59+00:00",
        },
        headers=HEADERS,
    )
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()["events"]]
    assert str(kept) in ids
    assert str(old) not in ids
    assert all(row["kind"] == "safety" for row in response.json()["events"])


def test_audit_rejects_put_and_delete(client):
    event_id = "00000000-0000-0000-0000-000000000001"
    put = client.put(
        f"/api/internal/audit/{event_id}",
        json={"kind": "x"},
        headers=HEADERS,
    )
    delete = client.delete(f"/api/internal/audit/{event_id}", headers=HEADERS)
    assert put.status_code in {404, 405, 422}
    assert delete.status_code in {404, 405, 422}


def test_physio_profile_get_and_put(client, db_session):
    physio = Physiotherapist(
        phone_e164="+2348000006304",
        specialty_tags=["msk"],
        price_kobo=2_000_000,
        city="Abuja",
        credential_urls=["https://files/old.jpg"],
        mrtb_number="MRT-1",
        verified=True,
    )
    db_session.add(physio)
    db_session.flush()

    got = client.get(f"/api/internal/physios/{physio.id}/profile", headers=HEADERS)
    assert got.status_code == 200
    body = got.json()
    assert body["price_kobo"] == 2_000_000
    assert body["city"] == "Abuja"
    assert body["credential_urls"] == ["https://files/old.jpg"]
    assert "text/html" not in got.headers.get("content-type", "")

    put = client.put(
        f"/api/internal/physios/{physio.id}/profile",
        json={
            "price_kobo": 2_500_000,
            "city": "Lagos",
            "specialty_tags": ["neuro"],
            "credential_urls": ["https://files/new.jpg"],
        },
        headers=HEADERS,
    )
    assert put.status_code == 200
    assert put.json()["price_kobo"] == 2_500_000
    assert put.json()["city"] == "Lagos"
    db_session.refresh(physio)
    assert physio.price_kobo == 2_500_000
    assert physio.city == "Lagos"
    assert physio.specialty_tags == ["neuro"]
    assert physio.credential_urls == ["https://files/new.jpg"]
    assert physio.verified is True


def test_physio_profile_unauthorized(client, db_session):
    physio = Physiotherapist(phone_e164="+2348000006305", specialty_tags=["msk"])
    db_session.add(physio)
    db_session.flush()
    response = client.get(f"/api/internal/physios/{physio.id}/profile")
    assert response.status_code == 401


def test_partner_referrals_lists_patients_and_fees(client, db_session):
    partner = Partner(phone_e164="+2348000006306")
    other = Partner(phone_e164="+2348000006307")
    db_session.add_all([partner, other])
    db_session.flush()
    patient = Patient(
        phone_e164="+2348000006308",
        name="Chidi",
        referred_by_partner_id=partner.id,
    )
    outsider = Patient(
        phone_e164="+2348000006309",
        name="Not Ours",
        referred_by_partner_id=other.id,
    )
    physio = Physiotherapist(phone_e164="+2348000006310", specialty_tags=["msk"])
    db_session.add_all([patient, outsider, physio])
    db_session.flush()
    booking = create_draft(
        db_session, patient.id, physio.id, "teleconsult", amount_kobo=500_000
    )
    mark_awaiting_payment(booking, "ref_partner_fee")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    fee = ReferralFee(
        patient_id=patient.id,
        partner_id=partner.id,
        booking_id=booking.id,
        amount_kobo=200_000,
    )
    db_session.add(fee)
    db_session.flush()

    response = client.get(
        f"/api/internal/partners/{partner.id}/referrals",
        headers=HEADERS,
    )
    assert response.status_code == 200
    body = response.json()
    patient_ids = {row["id"] for row in body["patients"]}
    assert str(patient.id) in patient_ids
    assert str(outsider.id) not in patient_ids
    fee_ids = {row["id"] for row in body["fees"]}
    assert str(fee.id) in fee_ids
    assert all(row["amount_kobo"] == 200_000 for row in body["fees"])


def test_receipt_payload_fields(client, confirmed_booking, db_session):
    response = client.get(
        f"/api/internal/receipts/{confirmed_booking.id}",
        headers=HEADERS,
    )
    assert response.status_code == 200
    assert "text/html" not in response.headers.get("content-type", "")
    body = response.json()
    assert body["amount_kobo"] == confirmed_booking.amount_kobo
    assert body["reference"] == confirmed_booking.paystack_reference
    assert body["patient_name"] == "Ada Okonkwo"
    assert body["physio_name"]
    assert body["paid_at"]


def test_receipt_does_not_confirm_unpaid_booking(client, db_session):
    patient = Patient(phone_e164="+2348000006311", name="Tunde")
    physio = Physiotherapist(phone_e164="+2348000006312", specialty_tags=["msk"])
    db_session.add_all([patient, physio])
    db_session.flush()
    booking = create_draft(
        db_session, patient.id, physio.id, "teleconsult", amount_kobo=100_000
    )
    mark_awaiting_payment(booking, "ref_unpaid")
    db_session.flush()

    response = client.get(f"/api/internal/receipts/{booking.id}", headers=HEADERS)
    assert response.status_code == 404
    db_session.refresh(booking)
    assert booking.status == BookingStatus.AWAITING_PAYMENT
    assert booking.status != BookingStatus.CONFIRMED


def test_audit_default_limit_is_100(client, db_session, patient_identity):
    for i in range(101):
        append(
            db_session,
            kind=AuditKind.TRIAGE,
            actor_phone=patient_identity.phone_e164,
            person_id=patient_identity.person_id,
            payload={"n": i},
        )
    response = client.get("/api/internal/audit", headers=HEADERS)
    assert response.status_code == 200
    assert len(response.json()["events"]) == 100


def test_audit_limit_and_offset(client, db_session, patient_identity):
    from app.models.audit_log import AuditEvent

    rows = []
    for i in range(5):
        row = AuditEvent(
            kind=AuditKind.MATCH,
            actor_phone=patient_identity.phone_e164,
            person_id=patient_identity.person_id,
            payload={"n": i},
            created_at=datetime(2026, 8, 1, 10, i, tzinfo=timezone.utc),
        )
        db_session.add(row)
        rows.append(row)
    db_session.flush()
    first = client.get(
        "/api/internal/audit",
        params={"person_id": str(patient_identity.person_id), "kind": "match", "limit": 2},
        headers=HEADERS,
    )
    assert first.status_code == 200
    assert len(first.json()["events"]) == 2
    second = client.get(
        "/api/internal/audit",
        params={
            "person_id": str(patient_identity.person_id),
            "kind": "match",
            "limit": 2,
            "offset": 2,
        },
        headers=HEADERS,
    )
    assert second.status_code == 200
    first_ids = [row["id"] for row in first.json()["events"]]
    second_ids = [row["id"] for row in second.json()["events"]]
    assert first_ids == [str(rows[0].id), str(rows[1].id)]
    assert second_ids == [str(rows[2].id), str(rows[3].id)]


def test_audit_limit_rejects_over_500(client):
    response = client.get(
        "/api/internal/audit",
        params={"limit": 501},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_receipt_paid_at_prefers_confirmed_at(client, confirmed_booking, db_session):
    confirmed = datetime(2026, 8, 1, 12, 0, tzinfo=timezone.utc)
    completed = datetime(2026, 8, 2, 15, 0, tzinfo=timezone.utc)
    confirmed_booking.confirmed_at = confirmed
    confirmed_booking.completed_at = completed
    db_session.flush()
    response = client.get(
        f"/api/internal/receipts/{confirmed_booking.id}",
        headers=HEADERS,
    )
    assert response.status_code == 200
    paid_at = response.json()["paid_at"]
    assert paid_at.startswith("2026-08-01T12:00:00")


def test_alembic_is_0018_booking_confirmed_at():
    from pathlib import Path

    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    path = versions / "0018_booking_confirmed_at.py"
    assert path.is_file()
    source = path.read_text()
    assert 'revision: str = "0018_booking_confirmed_at"' in source
    assert "0017_physio_city" in source
    assert "confirmed_at" in source


def test_internal_api_files_do_not_confirm_bookings_or_ship_html_ui():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app" / "api" / "internal"
    for name in ("admin_panel.py", "physio_profile.py", "partner_portal.py", "receipts.py"):
        source = (root / name).read_text().lower()
        assert "advance_to_confirmed" not in source
        assert "booking.status =" not in source
        assert "<html" not in source
        assert "hmo" not in source
        assert "retool" not in source
