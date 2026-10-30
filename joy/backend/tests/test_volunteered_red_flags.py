"""Red flags a patient volunteers in their own words must escalate at once.

These tests drive ``handle_turn`` with a model that returns *no* safety flags,
so escalation can only come from the deterministic detector. That is the
contract: the LLM never decides safety, and an omitted flag cannot silence a
clearly reported emergency symptom.
"""

import pytest

from app.safety.volunteered_red_flags import detect_volunteered_red_flags


@pytest.mark.parametrize(
    ("text", "flag"),
    [
        ("chest pain and shoulder ache", "chest_pain"),
        ("I have pain in my chest when I lift my arm", "chest_pain"),
        ("there's a tightness in my chest", "chest_pain"),
        ("my chest dey pain me since morning", "chest_pain"),
        ("My face is drooping and my speech is slurred", "sudden_neuro_deficit"),
        ("sudden weakness in my right arm", "sudden_neuro_deficit"),
        ("numbness around my groin with back pain", "saddle_anesthesia"),
        ("back pain and I can't control my bladder", "bladder_bowel_change"),
        ("weakness in both legs since yesterday", "bilateral_leg_weakness"),
    ],
)
def test_detects_volunteered_red_flags(text, flag):
    assert detect_volunteered_red_flags(text).get(flag) is True


@pytest.mark.parametrize(
    "text",
    [
        "no chest pain, just my shoulder",
        "I don't have any chest pain",
        "knee pain without chest pain or breathlessness",
        "never had slurred speech",
        "shoulder pain after lifting weights 5 days ago",
        "1 no 2 no 3 no",
    ],
)
def test_ignores_denied_or_absent_red_flags(text):
    assert detect_volunteered_red_flags(text) == {}


def test_first_message_chest_pain_escalates_without_model_flags(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"condition_area": "msk", "body_region": "shoulder"}
    fake_llm.reply = "Thanks for sharing. Let's get you booked!"

    result = handle_turn(db_session, patient_phone, "chest pain and shoulder ache", fake_llm)

    assert result.blocked_by_safety is True
    assert result.safety is not None and result.safety.risk_level == "RED"
    assert "book" not in result.reply_text.lower()


def test_red_flag_during_booking_still_escalates(db_session, patient_phone, fake_llm):
    """A symptom reported mid-booking must not be swallowed by the booking flow."""
    from app.conversation.turn_handler import handle_turn
    from app.models.conversation import Conversation
    from app.models.patient import Patient
    from app.conversation.orchestrator import AWAITING_PAYMENT
    from sqlalchemy import select

    fake_llm.extraction = {}
    fake_llm.reply = ""
    handle_turn(db_session, patient_phone, "my knee hurts when I run, started 4 days ago", fake_llm)
    patient = db_session.scalars(select(Patient).where(Patient.phone_e164 == patient_phone)).one()
    conversation = db_session.scalars(
        select(Conversation).where(Conversation.person_id == patient.id)
    ).first()
    conversation.booking_substate = AWAITING_PAYMENT
    db_session.flush()

    result = handle_turn(db_session, patient_phone, "sorry, I now have chest pain too", fake_llm)

    assert result.blocked_by_safety is True
    assert result.safety is not None and result.safety.risk_level == "RED"


def test_denied_red_flag_does_not_escalate(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"condition_area": "msk", "body_region": "shoulder"}
    fake_llm.reply = ""

    result = handle_turn(
        db_session, patient_phone, "shoulder pain for 5 days, no chest pain", fake_llm
    )

    assert result.blocked_by_safety is False


def test_reply_after_escalation_does_not_crash(db_session, patient_phone, fake_llm):
    """Regression: "ok" after RED guidance raised an invalid stage transition."""
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {}
    first = handle_turn(db_session, patient_phone, "I have chest pain", fake_llm)
    assert first.blocked_by_safety is True

    second = handle_turn(db_session, patient_phone, "ok", fake_llm)

    assert second.blocked_by_safety is True
    assert second.safety is not None and second.safety.risk_level == "RED"
