"""Regression (4 Nov 2026, owner's test phone): questions asked while a payment link was open.

"Do I need to pay first before telling you my location?" got "Your payment is being verified"
(nothing had been paid). "What if I need a home visit" fell through to the paid specialist-review
offer, and every "Yes" after that repeated the offer (the YES path also crashed on the stage
rules: AWAITING_PAYMENT -> POLICY_REVIEW).
"""

from types import SimpleNamespace

import pytest

from app.booking.step_help import booking_step_help
from app.conversation.stage_machine import assert_transition
from app.models.types import ConversationStage

LINK = "https://checkout.paystack.com/ayumcue1bon82rv"
CTX = {
    "booking_route": "admin_scheduled_virtual",
    "treatment_option": "quick_initial",
    "rh_amount_kobo": 600_000,
    "authorization_url": LINK,
    "rh_booking_id": "k57booking",
    "rh_patient_id": "rh-pat-1",
}
PAYING = "rh_awaiting_payment"


def test_location_question_is_answered_not_called_a_payment():
    reply = booking_step_help(PAYING, CTX, "Do I need to pay first before telling you my location?")
    assert reply.startswith("No, you don't need to share your location.")
    assert "being verified" not in reply
    assert LINK in reply


def test_home_visit_question_explains_the_online_first_step():
    reply = booking_step_help(PAYING, CTX, "What if I need a home visit")
    assert "nobody comes to your home" in reply and "home visits can be arranged after the call" in reply
    assert "specialist triage review" not in reply
    assert LINK in reply


@pytest.mark.parametrize(("text", "expected"), [
    ("How much is it?", "₦6,000"),
    ("how long is the call", "about 20 minutes"),
    ("who is my physio", "assigned after payment"),
    ("when is my appointment", "sets your clinician, date and time"),
    ("is this safe? I don't want to be scammed", "Paystack's secure checkout"),
    ("can I get a refund", "nothing to refund"),
])
def test_common_questions_get_fixed_answers(text, expected):
    reply = booking_step_help(PAYING, CTX, text)
    assert expected in reply and LINK in reply


@pytest.mark.parametrize("text", [
    "How long will my knee take to heal?",
    "Is it safe to walk on it?",
    "When I bend it hurts more",
    "Can my sister join the call with me?",
])
def test_vague_or_clinical_questions_never_get_a_fixed_booking_answer(text):
    assert booking_step_help(PAYING, CTX, text).startswith("To go ahead, pay securely here:")


def test_a_plain_yes_repeats_what_the_step_needs():
    reply = booking_step_help(PAYING, CTX, "YES")
    assert reply.startswith(f"To go ahead, pay securely here: {LINK}")


class _Model:
    def __init__(self, text):
        self.text = text
        self.prompts = []

    def complete(self, prompt, user_text):
        self.prompts.append(prompt)
        return SimpleNamespace(reply_text=self.text)


def test_other_questions_use_the_model_with_the_booking_facts_only():
    model = _Model("Good question! The clinician will go through that with you on the call.")
    reply = booking_step_help(PAYING, CTX, "Can my sister join the call with me?", llm=model)
    assert reply.startswith("Good question!") and LINK in reply
    assert "ONLY the facts" in model.prompts[0] and "₦6,000" in model.prompts[0]


@pytest.mark.parametrize("bad", [
    "Sure, pay here instead: https://evil.example/pay",
    "It's only ₦3,000 today.",
    "",
])
def test_a_model_answer_with_a_new_link_or_price_is_dropped(bad):
    reply = booking_step_help(PAYING, CTX, "Can my sister join the call with me?", llm=_Model(bad))
    assert reply.startswith("To go ahead, pay securely here:")


def test_after_payment_joy_says_it_arrived():
    reply = booking_step_help(PAYING, {**CTX, "rh_payment_status": "succeeded"}, "what next?")
    assert "Your payment has been received" in reply and LINK not in reply


@pytest.mark.parametrize("target", [ConversationStage.SPECIALIST_REVIEW, ConversationStage.POLICY_REVIEW])
def test_an_open_payment_can_move_to_the_specialist_review(target):
    assert assert_transition(ConversationStage.AWAITING_PAYMENT, target) == target


def test_an_open_payment_still_cannot_jump_back_to_story_capture():
    with pytest.raises(ValueError):
        assert_transition(ConversationStage.AWAITING_PAYMENT, ConversationStage.STORY_CAPTURE)


def _paying_conversation(db_session, patient_identity, *, triage_status="summarised", flow="initial_consultation_offered"):
    from app.conversation.state_manager import load
    from app.models.conversation import Conversation
    from app.models.triage_session import TriageSession
    from app.models.types import ExtractedTriage

    state = load(db_session, patient_identity)
    triage = db_session.get(TriageSession, state.triage_session_id)
    triage.extracted = ExtractedTriage(body_location="lower back").model_dump(mode="json")
    triage.status = triage_status
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_substate = PAYING
    conversation.booking_context = {**CTX, "triage_flow_state": flow}
    conversation.stage = ConversationStage.AWAITING_PAYMENT.value
    db_session.flush()
    return conversation, triage


def test_whole_turn_home_visit_question_while_paying(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    conversation, triage = _paying_conversation(db_session, patient_identity)
    result = handle_turn(db_session, patient_identity.phone_e164, "What if I need a home visit", fake_llm)
    assert "nobody comes to your home" in result.reply_text and LINK in result.reply_text
    assert "specialist triage review" not in result.reply_text
    assert triage.status == "summarised"
    assert conversation.booking_substate == PAYING


def test_whole_turn_a_chat_stuck_on_the_mistaken_offer_recovers(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    conversation, triage = _paying_conversation(
        db_session, patient_identity, triage_status="specialist_review", flow="specialist_review_offered",
    )
    result = handle_turn(db_session, patient_identity.phone_e164, "YES", fake_llm)
    assert "specialist triage review" not in result.reply_text
    assert LINK in result.reply_text
    assert triage.status == "summarised"
    assert conversation.booking_context["triage_flow_state"] == "initial_consultation_offered"


def test_a_review_the_patient_started_is_left_alone(db_session, patient_identity):
    from app.conversation.state_manager import load
    from app.conversation.turn_handler import _undo_mistaken_specialist_offer

    conversation, triage = _paying_conversation(
        db_session, patient_identity, triage_status="specialist_review", flow="specialist_review_offered",
    )
    conversation.booking_context = {**conversation.booking_context, "amber_review_requested": True}
    db_session.flush()
    state = load(db_session, patient_identity)
    assert _undo_mistaken_specialist_offer(db_session, patient_identity, state) is False
    assert triage.status == "specialist_review"
