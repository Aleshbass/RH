import hashlib
import hmac
import json

import pytest

from app.booking.state import create_draft, mark_awaiting_payment
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist

PAYSTACK_WEBHOOK_SECRET = "test-paystack-secret"
PAYSTACK_REFERENCE = "ref_paystack_charge"
AMOUNT_KOBO = 2_000_000
PAYSTACK_EVENT_ID = "302961"


def _sign(body: bytes, secret: str = PAYSTACK_WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()


@pytest.fixture
def awaiting_booking(db_session, client):
    from app.config import get_settings

    get_settings().paystack_webhook_secret = PAYSTACK_WEBHOOK_SECRET
    patient = Patient(
        phone_e164="+2348000006001",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
    physio = Physiotherapist(
        phone_e164="+2348000006101",
        specialty_tags=["msk"],
        lat=6.5244,
        lng=3.3792,
        price_kobo=AMOUNT_KOBO,
        rating=4.5,
        verified=True,
        service_radius_km=10.0,
    )
    db_session.add_all([patient, physio])
    db_session.flush()
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=AMOUNT_KOBO,
    )
    mark_awaiting_payment(booking, PAYSTACK_REFERENCE)
    db_session.flush()
    return booking


@pytest.fixture
def paystack_signed_body(awaiting_booking):
    payload = {
        "event": "charge.success",
        "data": {
            "id": int(PAYSTACK_EVENT_ID),
            "reference": awaiting_booking.paystack_reference,
            "amount": awaiting_booking.amount_kobo,
            "status": "success",
        },
    }
    body = json.dumps(payload).encode()
    return body, _sign(body)


def test_invalid_signature_does_not_confirm(client, db_session, awaiting_booking):
    response = client.post("/webhooks/paystack", content=b'{"event":"charge.success"}', headers={"x-paystack-signature": "nope"})
    assert response.status_code in {400, 401, 403}
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status != "confirmed"


def test_valid_charge_success_confirms(client, db_session, awaiting_booking, paystack_signed_body):
    body, sig = paystack_signed_body
    response = client.post("/webhooks/paystack", content=body, headers={"x-paystack-signature": sig})
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status == "confirmed"


def test_confirmed_booking_accepts_new_event_id_without_second_enqueue(
    client, db_session, awaiting_booking, paystack_signed_body
):
    from app.queue.tasks import BOOKING_CONFIRMED_QUEUE, _redis

    redis_client = _redis()
    redis_client.delete(BOOKING_CONFIRMED_QUEUE)
    body, sig = paystack_signed_body
    headers = {"x-paystack-signature": sig}
    assert client.post("/webhooks/paystack", content=body, headers=headers).status_code == 200

    payload = json.loads(body)
    payload["data"]["id"] = int(PAYSTACK_EVENT_ID) + 1
    second_body = json.dumps(payload).encode()
    second_headers = {"x-paystack-signature": _sign(second_body)}
    response = client.post(
        "/webhooks/paystack", content=second_body, headers=second_headers
    )
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status == "confirmed"
    assert redis_client.llen(BOOKING_CONFIRMED_QUEUE) == 1


def test_duplicate_event_is_idempotent(client, db_session, awaiting_booking, paystack_signed_body):
    from app.queue.tasks import BOOKING_CONFIRMED_QUEUE, _redis

    redis_client = _redis()
    redis_client.delete(BOOKING_CONFIRMED_QUEUE)
    body, sig = paystack_signed_body
    headers = {"x-paystack-signature": sig}
    assert client.post("/webhooks/paystack", content=body, headers=headers).status_code == 200
    response = client.post("/webhooks/paystack", content=body, headers=headers)
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status == "confirmed"
    assert redis_client.llen(BOOKING_CONFIRMED_QUEUE) == 1


def test_amount_mismatch_does_not_confirm(client, db_session, awaiting_booking):
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind

    payload = {
        "event": "charge.success",
        "data": {
            "id": 999001,
            "reference": awaiting_booking.paystack_reference,
            "amount": awaiting_booking.amount_kobo + 1,
            "status": "success",
        },
    }
    body = json.dumps(payload).encode()
    response = client.post(
        "/webhooks/paystack",
        content=body,
        headers={"x-paystack-signature": _sign(body)},
    )
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status != "confirmed"
    audits = db_session.query(AuditEvent).filter(AuditEvent.kind == AuditKind.BOOKING).all()
    assert any(row.payload.get("decision") == "amount_mismatch" for row in audits)
    admin_mismatches = [
        row
        for row in db_session.query(AuditEvent).filter(AuditEvent.kind == AuditKind.ADMIN).all()
        if row.payload.get("decision") == "amount_mismatch"
    ]
    assert admin_mismatches == []


def test_charge_success_enqueues_booking_confirmed(
    client, db_session, awaiting_booking, paystack_signed_body
):
    from app.queue.tasks import BOOKING_CONFIRMED_QUEUE, _redis

    redis_client = _redis()
    redis_client.delete(BOOKING_CONFIRMED_QUEUE)
    body, sig = paystack_signed_body
    response = client.post(
        "/webhooks/paystack", content=body, headers={"x-paystack-signature": sig}
    )
    assert response.status_code == 200
    raw = redis_client.lpop(BOOKING_CONFIRMED_QUEUE)
    assert raw is not None
    job = json.loads(raw)
    assert job["phone"] == "+2348000006001"
    assert "confirmed" in str(job.get("text") or "").lower()


def test_initialize_transaction_returns_authorization_url(monkeypatch):
    from app.booking.paystack_client import initialize_transaction

    class _Resp:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return {
                "status": True,
                "data": {
                    "authorization_url": "https://checkout.paystack.com/abc",
                    "reference": "ref_init",
                },
            }

    captured: dict = {}

    def _post(url: str, *args, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs.get("headers")
        captured["json"] = kwargs.get("json")
        return _Resp()

    monkeypatch.setenv("PAYSTACK_SECRET_KEY", "sk_test_fake")
    monkeypatch.setattr("app.booking.paystack_client.httpx.post", _post)
    monkeypatch.setattr(
        "app.booking.paystack_client.get_settings",
        lambda: type(
            "S",
            (),
            {"paystack_secret_key": "sk_test_fake"},
        )(),
    )
    result = initialize_transaction(
        "ada@example.com", 2000000, "ref_init", "https://example.test/callback"
    )
    assert result["authorization_url"] == "https://checkout.paystack.com/abc"
    assert result["reference"] == "ref_init"
    assert captured["json"]["amount"] == 2000000
    assert captured["json"]["email"] == "ada@example.com"
    assert captured["json"]["reference"] == "ref_init"
    assert "Bearer sk_test_fake" in captured["headers"]["Authorization"]


def test_fake_paystack_initialize_transaction():
    from tests.fakes import FakePaystack

    fake = FakePaystack()
    result = fake.initialize_transaction(
        "ada@example.com", 2000000, "ref_fake", "https://cb"
    )
    assert result["authorization_url"]
    assert result["reference"] == "ref_fake"


def test_charge_success_on_cancelled_booking_returns_200(
    client, db_session, awaiting_booking
):
    from app.booking.state import cancel
    from app.models.audit_log import AuditEvent
    from app.models.paystack_event import PaystackEvent
    from app.models.types import AuditKind, BookingStatus

    cancel(awaiting_booking)
    db_session.flush()
    payload = {
        "event": "charge.success",
        "data": {
            "id": 888001,
            "reference": awaiting_booking.paystack_reference,
            "amount": awaiting_booking.amount_kobo,
            "status": "success",
        },
    }
    body = json.dumps(payload).encode()
    response = client.post(
        "/webhooks/paystack",
        content=body,
        headers={"x-paystack-signature": _sign(body)},
    )
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status == BookingStatus.CANCELLED
    assert db_session.get(PaystackEvent, "888001") is not None
    audits = (
        db_session.query(AuditEvent).filter(AuditEvent.kind == AuditKind.BOOKING).all()
    )
    assert any(
        row.payload.get("decision") in {"non_confirmable_charge_success", "anomaly"}
        or row.payload.get("status") == BookingStatus.CANCELLED
        for row in audits
    )


def test_charge_success_confirms_and_audits_booking(
    client, db_session, awaiting_booking, paystack_signed_body
):
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind, BookingStatus

    body, sig = paystack_signed_body
    response = client.post(
        "/webhooks/paystack", content=body, headers={"x-paystack-signature": sig}
    )
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status == BookingStatus.CONFIRMED
    audits = (
        db_session.query(AuditEvent).filter(AuditEvent.kind == AuditKind.BOOKING).all()
    )
    assert any(row.payload.get("decision") == "confirmed" for row in audits)


def test_unknown_paystack_reference_returns_200_and_audits(
    client, db_session, awaiting_booking
):
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind, BookingStatus

    payload = {
        "event": "charge.success",
        "data": {
            "id": 777001,
            "reference": "ref_does_not_exist",
            "amount": awaiting_booking.amount_kobo,
            "status": "success",
        },
    }
    body = json.dumps(payload).encode()
    response = client.post(
        "/webhooks/paystack",
        content=body,
        headers={"x-paystack-signature": _sign(body)},
    )
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status == BookingStatus.AWAITING_PAYMENT
    audits = (
        db_session.query(AuditEvent).filter(AuditEvent.kind == AuditKind.BOOKING).all()
    )
    assert any(row.payload.get("decision") == "unknown_reference" for row in audits)


def test_booking_confirmed_queue_sends_whatsapp_without_confirming(
    db_session, awaiting_booking, monkeypatch
):
    from app.booking.state import mark_processing
    from app.models.types import BookingStatus
    from app.queue import worker
    from app.queue.tasks import BOOKING_CONFIRMED_QUEUE, enqueue_booking_confirmed, _redis

    sent: list[tuple[str, str]] = []
    monkeypatch.setattr(
        worker, "send_whatsapp_text", lambda phone, text: sent.append((phone, text))
    )
    client = _redis()
    client.delete(BOOKING_CONFIRMED_QUEUE)
    mark_processing(awaiting_booking)
    db_session.flush()
    try:
        enqueue_booking_confirmed(
            "+2348000006001", str(awaiting_booking.id), "Your booking is confirmed."
        )
        assert worker.process_booking_confirmed_once(timeout=1) is True
        assert sent == [("+2348000006001", "Your booking is confirmed.")]
        db_session.refresh(awaiting_booking)
        assert awaiting_booking.status == BookingStatus.PROCESSING
        assert awaiting_booking.status != BookingStatus.CONFIRMED
        from pathlib import Path

        worker_src = (Path(__file__).resolve().parents[1] / "app" / "queue" / "worker.py").read_text()
        assert "advance_to_confirmed" not in worker_src
    finally:
        client.delete(BOOKING_CONFIRMED_QUEUE)
