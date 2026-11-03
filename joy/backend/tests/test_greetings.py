"""Hello from a new number, and hello from someone Joy already knows."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.conversation.state_manager import load
from app.identity.greetings import is_greeting_only
from app.models.conversation import Conversation, Message
from app.models.types import ConversationStage, PatientPhase


@pytest.mark.parametrize("text", ["Hi", "hello Joy!", "Good morning ma", "How far", "Bawo ni", "E kaaro", "Kedu", "Ndewo", "Sannu", "Ina kwana", "Hi 👋"])
def test_greetings_in_joys_languages(text):
    assert is_greeting_only(text)


@pytest.mark.parametrize("text", ["Hi, my back hurts", "hello I want to book", "good morning, my knee is swollen"])
def test_a_greeting_with_a_problem_is_not_only_a_greeting(text):
    assert not is_greeting_only(text)


def _new_phone():
    return f"+234803{uuid.uuid4().int % 10**7:07d}"


@pytest.mark.parametrize("text", ["Hi", "Bawo ni"])
def test_a_new_number_saying_hi_gets_the_rehabify_welcome(db_session, fake_llm, text):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "MODEL WROTE THIS"
    result = handle_turn(db_session, _new_phone(), text, fake_llm)
    assert result.reply_text.startswith("Hello 👋 Welcome to Rehabify.")
    assert "reply *PT*" in result.reply_text and "Messaging for someone else?" in result.reply_text
    assert "MODEL WROTE THIS" not in result.reply_text


def _history(db_session, patient_identity, *, hours_ago, joy_text, phase=PatientPhase.POST_TRIAGE, stage=None, substate=None):
    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.phase = phase
    if stage is not None:
        conversation.stage = stage.value
    conversation.booking_substate = substate
    when = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
    db_session.add(Message(conversation_id=conversation.id, role="user", text="my knee hurts", created_at=when))
    db_session.add(Message(conversation_id=conversation.id, role="joy", text=joy_text, created_at=when + timedelta(seconds=1)))
    db_session.flush()
    return conversation


def test_a_returning_patient_is_welcomed_back_with_options(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    _history(db_session, patient_identity, hours_ago=30, joy_text="Thanks, your physio will be in touch.")
    result = handle_turn(db_session, patient_identity.phone_e164, "Hello", fake_llm)
    assert result.reply_text.startswith("Welcome back, Ada 👋. How can I help today?")
    assert [b["reply"]["title"] for b in result.interactive["action"]["buttons"]] == ["My exercises", "My dashboard"]


def test_mid_booking_hello_carries_on_from_the_last_question(db_session, patient_identity, fake_llm):
    from app.booking.booking_flow import AWAITING_RH_SLOT
    from app.conversation.turn_handler import handle_turn

    _history(db_session, patient_identity, hours_ago=1, joy_text="Which time suits you? Reply 1, 2 or 3.", substate=AWAITING_RH_SLOT)
    result = handle_turn(db_session, patient_identity.phone_e164, "hi", fake_llm)
    assert result.reply_text == "Hi Ada 👋. Let's carry on from where we stopped:\n\nWhich time suits you? Reply 1, 2 or 3."


def test_a_booked_patient_saying_hi_sees_their_appointment(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    _history(db_session, patient_identity, hours_ago=48, joy_text="Your appointment is confirmed.", stage=ConversationStage.BOOKING_CONFIRMED)
    result = handle_turn(db_session, patient_identity.phone_e164, "Good morning", fake_llm)
    assert result.reply_text.startswith("Welcome back, Ada 👋\n\nYour appointment is confirmed.")
