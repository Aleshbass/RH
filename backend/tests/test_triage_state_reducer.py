from app.conversation.response_strategy import grounded_triage_ack
from app.conversation.turn_handler import _is_greeting_only, _is_thanks_only
from app.conversation.triage_state_reducer import reduce_triage_turn
from app.models.types import ExtractedTriage
from app.triage.turn_decision import TriageDisposition, TriageTurnDecision


def test_reducer_applies_only_text_backed_severity_correction():
    result = reduce_triage_turn(
        ExtractedTriage(severity=1, body_location="ankle"),
        user_text="Severity is not 1, it is 4.",
        decision=TriageTurnDecision(
            disposition=TriageDisposition.CORRECTION,
            corrections={"severity": 4},
            confidence=0.98,
        ),
    )
    assert result.extracted.severity == 4
    assert result.corrections_applied == ("severity",)


def test_reducer_does_not_trust_an_unquoted_model_correction():
    result = reduce_triage_turn(
        ExtractedTriage(severity=5),
        user_text="It is painful today.",
        decision=TriageTurnDecision(
            disposition=TriageDisposition.CORRECTION,
            corrections={"severity": 9},
        ),
    )
    assert result.extracted.severity == 5
    assert result.corrections_applied == ()


def test_grounded_ack_replaces_generic_provider_fallback():
    reply = grounded_triage_ack(
        "",
        ExtractedTriage(body_location="ankle", onset="4 days", goals="return to sport safely"),
    )
    assert "ankle" in reply
    assert "4 days" in reply
    assert "received what you shared" not in reply


def test_grounded_ack_without_any_clinical_facts_is_a_welcome_not_a_triage_ack():
    reply = grounded_triage_ack("", ExtractedTriage())

    assert "hi, i’m joy" in reply.lower()
    assert "tell me what is bothering you" in reply.lower()
    assert "thanks for explaining" not in reply.lower()


def test_greeting_only_detection_does_not_treat_a_clinical_story_as_a_greeting():
    assert _is_greeting_only("hey Joy")
    assert _is_greeting_only("Good afternoon!")
    assert not _is_greeting_only("Hey Joy, my shoulder hurts")


def test_thank_you_variants_are_not_sent_into_triage():
    assert all(_is_thanks_only(value) for value in ("thanks", "thank you", "tnx", "tanks"))
    assert not _is_thanks_only("thanks, my shoulder hurts")
