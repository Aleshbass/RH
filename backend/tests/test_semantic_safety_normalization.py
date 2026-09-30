from app.safety.protocol_runtime import ScheduledQuestion, NO
from app.safety.semantic_normalization import validated_semantic_safety_answers


def test_minor_assessed_accident_clears_major_injury_only():
    question = ScheduledQuestion("GEN-001-Q1", "GEN-001", "Did this start after a serious accident, major fall, or significant injury?", 0)
    result = validated_semantic_safety_answers(
        {"major_injury": {"answer": "NO", "evidence": "minor car accident 10 days ago"}},
        "I was in a minor car accident 10 days ago. The hospital said there was no fracture.",
        [question],
    )
    assert result == {"GEN-001-Q1": NO}


def test_bare_accident_cannot_be_cleared_by_model_proposal():
    question = ScheduledQuestion("GEN-001-Q1", "GEN-001", "Did this start after a serious accident, major fall, or significant injury?", 0)
    result = validated_semantic_safety_answers(
        {"major_injury": {"answer": "NO", "evidence": "accident"}},
        "I was in an accident yesterday.",
        [question],
    )
    assert result == {}


def test_low_energy_sport_twist_clears_major_injury_only():
    question = ScheduledQuestion("GEN-001-Q1", "GEN-001", "Did this start after a serious accident, major fall, or significant injury?", 0)
    result = validated_semantic_safety_answers(
        {"major_injury": {"answer": "NO", "evidence": "twisted my ankle playing football"}},
        "I twisted my ankle playing football four days ago. It hurts when I walk.",
        [question],
    )
    assert result == {"GEN-001-Q1": NO}
