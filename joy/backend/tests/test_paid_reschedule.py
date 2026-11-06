"""Moving a paid booking in the chat: the physio's free times, the app's rules, reminders follow."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

NOW = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
CURRENT = NOW + timedelta(days=2)
FREE_1 = NOW + timedelta(days=3, hours=1)
FREE_2 = NOW + timedelta(days=4, hours=2)


def _ms(when):
    return int(when.timestamp() * 1000)


class _RH:
    def __init__(self, moved=True, physio_id="prof1"):
        self.moved = moved
        self.physio_id = physio_id
        self.mutations = []

    def booking_status(self, booking_id, *, patient_id):
        return {"booking_status": "confirmed", "physiotherapist_id": self.physio_id, "service_mode": "online",
                "duration_minutes": 60, "session_start": _ms(CURRENT), "provider": {"display_name": "Ada Obi"}}

    def availability(self, physio_id, *, start_ms, end_ms, duration_minutes, service_mode):
        return {"slots": [{"start": _ms(FREE_1)}, {"start": _ms(CURRENT)}, {"start": _ms(FREE_2)}]}

    def operational_mutation(self, operation, *, actor, data, idempotency_key):
        self.mutations.append((operation, data))
        if self.moved:
            return {"moved": True, "physio_name": "Ada Obi"}
        return {"moved": False, "message": "You've already moved this visit once at short notice. You can still cancel it."}

    def dashboard_link(self, *, patient_id, sender_phone):
        return {"ok": True, "dashboard_url": "https://physioaroundme.com/go/abc"}


@pytest.fixture
def booked(db_session, patient_identity):
    from app.conversation.state_manager import load
    from app.models.appointment_reminder import AppointmentReminder
    from app.models.conversation import Conversation
    from app.models.types import ConversationStage

    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_context = {
        "rh_booking_id": "b1", "rh_patient_id": "rh-pat-1", "rh_booking_status": "confirmed", "rh_payment_status": "succeeded",
    }
    conversation.stage = ConversationStage.BOOKING_CONFIRMED.value
    db_session.add(AppointmentReminder(
        rh_booking_id="b1", patient_id=patient_identity.person_id, phone_e164=patient_identity.phone_e164,
        provider_name="Ada Obi", service_mode="online", session_start=CURRENT, reminder_at=CURRENT - timedelta(minutes=30),
        duration_minutes=60, status="pending",
    ))
    db_session.flush()
    return conversation


def _turn(db_session, patient_identity, fake_llm, text):
    from app.conversation.turn_handler import handle_turn

    return handle_turn(db_session, patient_identity.phone_e164, text, fake_llm)


def test_moving_a_paid_booking_offers_times_then_moves_it(db_session, patient_identity, fake_llm, booked, monkeypatch):
    from app.conversation.interactive import interactive_for
    from app.models.appointment_reminder import AppointmentReminder
    from app.models.types import ConversationStage

    rh = _RH()
    monkeypatch.setattr("app.booking.booking_flow.configured_rh_client", lambda: rh)
    offer = _turn(db_session, patient_identity, fake_llm, "I need to reschedule my appointment")
    assert offer.reply_text.startswith("Let's move your appointment (now ")
    assert "Ada Obi's free times" in offer.reply_text and "1. " in offer.reply_text and "3. " not in offer.reply_text  # current time left out
    assert booked.booking_substate == "rh_awaiting_reschedule"
    menu = interactive_for(booked)
    assert menu["type"] == "list" and menu["action"]["sections"][0]["rows"][-1]["id"] == "keep"

    done = _turn(db_session, patient_identity, fake_llm, "2")
    assert done.reply_text.startswith("Done. I've asked Ada Obi to confirm ")
    assert rh.mutations == [("patient_reschedule_booking", {"patient_id": "rh-pat-1", "booking_id": "b1", "slot_start": _ms(FREE_2)})]
    assert booked.booking_substate is None and booked.stage == ConversationStage.BOOKING_CONFIRMED.value
    reminder = db_session.scalar(select(AppointmentReminder).where(AppointmentReminder.rh_booking_id == "b1"))
    assert reminder.session_start == FREE_2 and reminder.reminder_at == FREE_2 - timedelta(minutes=30)


def test_a_refused_move_explains_and_keeps_the_choice_open(db_session, patient_identity, fake_llm, booked, monkeypatch):
    monkeypatch.setattr("app.booking.booking_flow.configured_rh_client", lambda: _RH(moved=False))
    _turn(db_session, patient_identity, fake_llm, "reschedule")
    refused = _turn(db_session, patient_identity, fake_llm, "1")
    assert refused.reply_text.startswith("You've already moved this visit once at short notice.")
    assert "Reply with another number" in refused.reply_text
    assert booked.booking_substate == "rh_awaiting_reschedule"


def test_keep_leaves_the_booking_as_it_was(db_session, patient_identity, fake_llm, booked, monkeypatch):
    rh = _RH()
    monkeypatch.setattr("app.booking.booking_flow.configured_rh_client", lambda: rh)
    _turn(db_session, patient_identity, fake_llm, "can I change the time")
    kept = _turn(db_session, patient_identity, fake_llm, "keep")
    assert kept.reply_text == "No problem, your appointment stays as it is."
    assert booked.booking_substate is None and rh.mutations == []


def test_no_physio_yet_falls_back_to_the_dashboard(db_session, patient_identity, fake_llm, booked, monkeypatch):
    monkeypatch.setattr("app.booking.booking_flow.configured_rh_client", lambda: _RH(physio_id=""))
    reply = _turn(db_session, patient_identity, fake_llm, "reschedule please")
    assert "from your Rehabify dashboard" in reply.reply_text and "https://physioaroundme.com/go/abc" in reply.reply_text
    assert booked.booking_substate is None
