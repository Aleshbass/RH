from app.conversation.turn_handler import (
    _AWAITING_ADDITIONAL_DETAILS,
    _AWAITING_SUMMARY_CONFIRMATION,
    _TRIAGE_FLOW_KEY,
    _TRIAGE_QUESTIONNAIRE_ENABLED,
    _defer_amber_until_summary_is_complete,
    _is_no_further_details,
    _triage_summary_prompt,
)
from app.api.internal.rh_safety_eligibility import _triage_status_allows_service
from app.safety.escalation import specialist_review_offer
from app.models.types import ConditionArea, ExtractedTriage


def test_initial_summary_invites_correction_or_more_detail_and_explains_exit_phrase():
    prompt = _triage_summary_prompt(
        ExtractedTriage(
            body_location="ankle",
            onset="4 days ago",
            goals="return to sport safely",
            condition_area=ConditionArea.MSK,
        )
    ).lower()

    assert "ankle" in prompt
    assert "is that right" in prompt
    assert "anything else" in prompt
    assert "there’s nothing else" in prompt


def test_amber_is_deferred_only_while_the_initial_summary_can_still_change():
    assert _defer_amber_until_summary_is_complete({}, "my ankle hurts") is True
    assert _defer_amber_until_summary_is_complete(
        {_TRIAGE_FLOW_KEY: _AWAITING_SUMMARY_CONFIRMATION}, "yes, that is right"
    ) is True
    assert _defer_amber_until_summary_is_complete(
        {_TRIAGE_FLOW_KEY: _AWAITING_SUMMARY_CONFIRMATION}, "no"
    ) is True
    assert _defer_amber_until_summary_is_complete(
        {_TRIAGE_FLOW_KEY: _AWAITING_SUMMARY_CONFIRMATION}, "there's nothing else"
    ) is False
    assert _defer_amber_until_summary_is_complete(
        {_TRIAGE_FLOW_KEY: _AWAITING_ADDITIONAL_DETAILS}, "yes"
    ) is True
    assert _defer_amber_until_summary_is_complete(
        {_TRIAGE_FLOW_KEY: _AWAITING_ADDITIONAL_DETAILS}, "there's nothing else"
    ) is False


def test_specialist_review_eligibility_accepts_the_amber_triage_state():
    assert _triage_status_allows_service("summarised", "standard_consultation") is True
    assert _triage_status_allows_service("specialist_review", "specialist_review") is True
    assert _triage_status_allows_service("specialist_review", "standard_consultation") is False


def test_active_intake_flow_does_not_ask_triage_follow_up_questions():
    assert _TRIAGE_QUESTIONNAIRE_ENABLED is False


def test_completed_story_routes_to_the_specialist_triage_review_offer():
    offer = specialist_review_offer().lower()
    assert "specialist triage review" in offer
    assert "₦6,000" in offer
    assert "reply yes" in offer


def test_no_further_details_accepts_whatsapp_smart_apostrophes():
    assert _is_no_further_details("There’s nothing else.") is True
