"""Regression (Nov 2026): every turn after the safety questions crashed on the stage rules.

After "No to all" the conversation was in SAFETY_SCREEN and the policy, booking and payment
stages were refused, so each reply came from the fallback path. A "Yes, book online" tap was
then read as an email address ("Please reply with a valid email address").
"""

import pytest

from app.conversation.stage_machine import assert_transition
from app.models.types import ConversationStage


@pytest.mark.parametrize("target", [
    ConversationStage.POLICY_REVIEW, ConversationStage.POLICY_ACCEPTANCE,
    ConversationStage.SPECIALIST_MATCHING, ConversationStage.AWAITING_PAYMENT,
])
def test_a_clear_safety_screen_can_move_on_to_booking(target):
    assert assert_transition(ConversationStage.SAFETY_SCREEN, target) == target


def test_the_unsafe_shortcut_is_still_refused():
    with pytest.raises(ValueError):
        assert_transition(ConversationStage.STORY_CAPTURE, ConversationStage.AWAITING_PAYMENT)
    with pytest.raises(ValueError):
        assert_transition(ConversationStage.SAFETY_SCREEN, ConversationStage.BOOKING_CONFIRMED)


def test_a_failed_turn_is_undone_before_the_fallback(db_session, patient_identity, fake_llm, monkeypatch):
    from app.conversation.state_manager import load
    from app.models.conversation import Conversation
    from app.models.types import TurnResult
    from app.queue import worker

    state = load(db_session, patient_identity)
    conversation_id = state.conversation_id
    seen = {}

    def half_done_then_crash(session, phone, text, llm, **kwargs):
        conversation = session.get(Conversation, conversation_id)
        conversation.booking_substate = "rh_awaiting_payment_email"  # what the failed attempt got to
        session.flush()
        raise ValueError("unauthorised conversation stage transition")

    def fallback(session, phone, text, wa_message_id=None):
        seen["substate"] = session.get(Conversation, conversation_id).booking_substate
        return TurnResult(reply_text="ok", language="en", phase="first_contact")

    monkeypatch.setattr(worker, "handle_turn", half_done_then_crash)
    monkeypatch.setattr(worker, "provider_unavailable_reply", fallback)
    worker.process_inbound(db_session, "wamid.stage.1", patient_identity.phone_e164, "yes", fake_llm)
    assert seen["substate"] is None  # the fallback saw the state from before the failed attempt
