"""After payment: the dashboard link, the physio's request on WhatsApp, cancellations, and
honest answers when a patient asks to cancel or move a paid booking."""

import hashlib
import hmac
import json
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.api.internal.rh_events import booking_cancelled_text, dashboard_link_text, physio_request_text
from app.config import get_settings
from app.models.appointment_reminder import AppointmentReminder
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.rh_identity_mapping import RHIdentityMapping

START_MS = int(datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc).timestamp() * 1000)  # 10am WAT


def test_physio_request_names_the_booking_and_the_deadline():
    text = physio_request_text({
        "booking_id": "k57booking123", "booking_code": "RH-B42", "patient_first_name": "Ada",
        "service_mode": "home_visit", "start_time": START_MS, "area": "Lekki",
        "provider_response_due_at": START_MS - 20 * 3600 * 1000,
    })
    assert text.startswith("New paid Rehabify booking RH-B42: Ada, home visit on 10th Nov at 10am WAT in Lekki.")
    assert "ACCEPT k57booking123 or REJECT k57booking123 by 9th Nov at 2pm WAT" in text
    assert physio_request_text({"booking_id": ""}) is None


@pytest.mark.parametrize(("data", "expected"), [
    ({"cancelled_by": "system", "paid": False}, "wasn't paid for in time"),
    ({"cancelled_by": "patient", "paid": True, "refund_status": "pending"}, "cancelled as you asked. Your refund is being processed"),
    ({"cancelled_by": "physiotherapist", "paid": True, "refund_status": "pending"}, "I'm sorry, your appointment"),
    ({"cancelled_by": "care_team", "paid": True, "refund_status": None}, "our care team will contact you about your payment"),
])
def test_cancellation_messages_say_what_happens_next(data, expected):
    assert expected in booking_cancelled_text({"booking_code": "RH-B42", "start_time": START_MS, **data})


def test_dashboard_link_message_warns_not_to_share():
    text = dashboard_link_text("https://physioaroundme.com/go/abc")
    assert "https://physioaroundme.com/go/abc" in text and "don't share it" in text


def _post_event(client, event_type, data, secret="evt-secret"):
    payload = {"event_id": f"evt-{uuid.uuid4()}", "event_type": event_type, "api_version": "1", "data": data}
    body = json.dumps(payload)
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), "\n".join([timestamp, payload["event_id"], body]).encode(), hashlib.sha256).hexdigest()
    return client.post("/api/integrations/rh/events", content=body, headers={
        "Content-Type": "application/json", "X-RH-Event-Timestamp": timestamp, "X-RH-Event-Signature": signature,
    })


@pytest.fixture
def events(client, db_session, patient_identity, monkeypatch):
    from app.main import app

    settings = app.dependency_overrides[get_settings]()
    monkeypatch.setattr(settings, "rh_event_hmac_secret", "evt-secret")
    sent: list[tuple[str, str, str]] = []
    monkeypatch.setattr(
        "app.api.internal.rh_events.enqueue_booking_confirmed",
        lambda phone, booking_id, text, **kw: sent.append((phone, booking_id, text)),
    )
    db_session.add(RHIdentityMapping(persona="patient", joy_person_id=patient_identity.person_id, rh_record_id="rh-pat-1"))
    db_session.flush()
    return sent


def test_dashboard_ready_sends_the_link(client, events, patient_identity):
    response = _post_event(client, "patient.dashboard_ready", {
        "patient_id": "rh-pat-1", "booking_id": "b1", "dashboard_url": "https://physioaroundme.com/go/xyz",
    })
    assert response.status_code == 200
    assert events[0][0] == patient_identity.phone_e164
    assert "https://physioaroundme.com/go/xyz" in events[0][2]


def test_paid_booking_asks_the_physio_on_whatsapp(client, events):
    _post_event(client, "booking.provider_response_requested", {
        "booking_id": "k57booking123", "patient_id": "rh-pat-1", "physiotherapist_phone": "+2348099990000",
        "service_mode": "online", "start_time": START_MS,
    })
    assert events[0][0] == "+2348099990000"
    assert "ACCEPT k57booking123" in events[0][2]


def test_physio_request_without_a_phone_is_skipped(client, events):
    _post_event(client, "booking.provider_response_requested", {"booking_id": "k57booking123", "physiotherapist_phone": None})
    assert events == []


def test_cancellation_stops_reminders_and_tells_the_patient(client, events, db_session, patient_identity):
    from app.conversation.state_manager import load

    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_context = {"rh_booking_id": "b-cancel", "rh_booking_status": "confirmed"}
    start = datetime.now(timezone.utc) + timedelta(days=2)
    db_session.add(AppointmentReminder(
        rh_booking_id="b-cancel", patient_id=patient_identity.person_id, phone_e164=patient_identity.phone_e164,
        provider_name="Tolu", service_mode="online", session_start=start, reminder_at=start - timedelta(minutes=30),
        duration_minutes=60, status="pending",
    ))
    db_session.flush()
    _post_event(client, "booking.cancelled", {
        "booking_id": "b-cancel", "patient_id": "rh-pat-1", "cancelled_by": "physiotherapist", "paid": True,
        "refund_status": "pending", "start_time": START_MS,
    })
    reminder = db_session.scalar(select(AppointmentReminder).where(AppointmentReminder.rh_booking_id == "b-cancel"))
    assert reminder.status == "cancelled"
    db_session.refresh(conversation)
    assert conversation.booking_context["rh_booking_status"] == "cancelled"
    assert "cancelled by our care team" in events[0][2] and "refund is being processed" in events[0][2]


class _FakeRH:
    def __init__(self):
        self.requests = []

    def dashboard_link(self, *, patient_id, sender_phone):
        return {"ok": True, "dashboard_url": "https://physioaroundme.com/go/new"}

    def resolve_physiotherapist(self, phone, actor):
        from app.integrations.rh_client import PhysiotherapistResolution

        return PhysiotherapistResolution(resolution="MATCH", physiotherapist_id="prof-1", rh_user_id="user-physio-1", display_name="Tolu", capabilities=None)

    def _request(self, method, path, payload=None, idempotency_key=""):
        self.requests.append((method, path, payload))
        return {"recorded": True}


def test_asking_for_the_dashboard_sends_a_fresh_link(db_session, patient_identity, fake_llm, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    db_session.add(RHIdentityMapping(persona="patient", joy_person_id=patient_identity.person_id, rh_record_id="rh-pat-1"))
    db_session.flush()
    monkeypatch.setattr("app.conversation.turn_handler.configured_rh_client", lambda: _FakeRH())
    result = handle_turn(db_session, patient_identity.phone_e164, "Please send me my dashboard link", fake_llm)
    assert "https://physioaroundme.com/go/new" in result.reply_text


def test_cancel_after_payment_points_to_the_dashboard_honestly(db_session, patient_identity, monkeypatch):
    from app.booking import booking_flow
    from app.conversation.state_manager import load

    monkeypatch.setattr(booking_flow, "configured_rh_client", lambda: _FakeRH())
    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_context = {"rh_booking_id": "b1", "rh_patient_id": "rh-pat-1", "rh_payment_status": "succeeded"}
    patient = db_session.get(Patient, patient_identity.person_id)
    reply = booking_flow._maybe_cancel(db_session, conversation, patient, "please cancel it")
    assert "you cancel it from your Rehabify dashboard" in reply
    assert "https://physioaroundme.com/go/new" in reply
    assert "try again shortly" not in reply


def test_a_physio_new_to_joy_can_accept_from_whatsapp(db_session, fake_llm, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    fake = _FakeRH()
    monkeypatch.setattr("app.conversation.turn_handler.configured_rh_client", lambda: fake)
    phone = f"+234809{uuid.uuid4().int % 10**7:07d}"
    result = handle_turn(db_session, phone, "ACCEPT k57booking123", fake_llm)
    assert result.reply_text == "Booking response recorded by Rehabify."
    assert fake.requests[0][1] == "/api/v1/joy/bookings/k57booking123/respond"
    assert fake.requests[0][2]["response"] == "accept"
