from app.models.types import ConditionArea, ExtractedTriage, Persona, SafetyResult


def test_extracted_triage_defaults():
    extracted = ExtractedTriage()
    assert extracted.condition_area is None
    assert extracted.flags == {}
    assert Persona.PATIENT == "patient"
    assert ConditionArea.NEURO == "neuro"
    result = SafetyResult(fired=False, rule_ids=[], reason_plain_language="", action="continue")
    assert result.fired is False
