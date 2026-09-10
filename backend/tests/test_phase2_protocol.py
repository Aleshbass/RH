from app.models.types import ConversationStage, ExtractedTriage
from app.safety.protocol_runtime import NO, YES, evaluate_protocol, schedule_questions, validate_active_protocol


def test_protocol_is_valid_and_schedules_approved_questions_only():
    validate_active_protocol()
    extracted = ExtractedTriage(body_location="lower back pain")
    questions = schedule_questions(extracted)
    assert questions
    assert all(question.id.startswith(("GEN-", "LB-")) for question in questions)
    assert questions == schedule_questions(extracted)


def test_protocol_evaluates_cauda_equina_from_question_answers():
    extracted = ExtractedTriage(
        body_location="low back",
        safety_answers={"LB-001-Q1": YES, "LB-001-Q2": NO},
        safety_question_order=["LB-001-Q1", "LB-001-Q2"],
    )
    result = evaluate_protocol(extracted)
    assert result["risk_level"] == "RED"
    assert result["action"] == "escalate_doctor"
    assert "LB-001" in result["rule_ids"]


def test_stage_machine_rejects_unsafe_shortcut():
    from app.conversation.stage_machine import assert_transition
    import pytest

    with pytest.raises(ValueError):
        assert_transition(ConversationStage.STORY_CAPTURE, ConversationStage.BOOKING_CONFIRMED)
