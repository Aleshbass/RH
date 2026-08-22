from pathlib import Path

import pytest

from app.models.types import ExtractedTriage
from app.safety.evaluator import evaluate
from app.safety.escalation import patient_message

_CARE_MARKS = ("concern", "sorry", "care", "worried", "with you")
_INSTRUCTION_MARKS = ("doctor", "hospital", "emergency")

_TRUE_FLAG_CASES = (
    ("saddle_anesthesia", "cauda_equina"),
    ("bladder_bowel_change", "cauda_equina"),
    ("bilateral_leg_weakness", "cauda_equina"),
    ("fever", "infection"),
    ("night_sweats", "infection"),
    ("unexplained_weight_loss", "malignancy_screen"),
    ("recent_trauma", "major_trauma"),
    ("chest_pain", "cardiac"),
    ("sudden_neuro_deficit", "acute_neuro"),
    ("unexplained_numbness", "acute_neuro"),
)


def test_cauda_equina_fires_without_llm():
    extracted = ExtractedTriage(flags={"saddle_anesthesia": True})
    result = evaluate(extracted)
    assert result.fired is True
    assert "cauda_equina" in result.rule_ids
    text = patient_message(result)
    assert "doctor" in text.lower() or "hospital" in text.lower() or "emergency" in text.lower()
    assert len(result.reason_plain_language) > 20
    care_marks = ("concern", "sorry", "care", "worried", "with you")
    assert any(m in text.lower() for m in care_marks)
    instruction_at = min(i for i in (text.lower().find("doctor"), text.lower().find("hospital"), text.lower().find("emergency")) if i >= 0)
    care_at = min(text.lower().find(m) for m in care_marks if m in text.lower())
    assert care_at < instruction_at
    assert "book" not in text.lower()
    assert "physio" not in text.lower()


def test_unknown_flags_do_not_fire():
    extracted = ExtractedTriage(flags={"saddle_anesthesia": None})
    assert evaluate(extracted).fired is False


def test_safety_module_has_no_llm_import():
    import app.safety.evaluator as ev
    import pathlib
    source = pathlib.Path(ev.__file__).read_text()
    assert "gemini" not in source.lower()
    assert "app.llm" not in source


@pytest.mark.parametrize(("flag", "rule_id"), _TRUE_FLAG_CASES)
def test_true_flag_fires_matching_rule(flag: str, rule_id: str) -> None:
    result = evaluate(ExtractedTriage(flags={flag: True}))
    assert result.fired is True
    assert rule_id in result.rule_ids
    assert result.action == "escalate_doctor"
    assert len(result.reason_plain_language) > 20


@pytest.mark.parametrize("flag", [case[0] for case in _TRUE_FLAG_CASES])
def test_false_flag_does_not_fire(flag: str) -> None:
    result = evaluate(ExtractedTriage(flags={flag: False}))
    assert result.fired is False
    assert result.rule_ids == []
    assert result.action == "continue"


def test_missing_flags_do_not_fire() -> None:
    result = evaluate(ExtractedTriage())
    assert result.fired is False
    assert result.rule_ids == []
    assert result.action == "continue"


def test_malignancy_fires_on_cancer_plus_night_pain() -> None:
    result = evaluate(
        ExtractedTriage(flags={"history_of_cancer": True, "night_pain": True})
    )
    assert result.fired is True
    assert "malignancy_screen" in result.rule_ids


def test_malignancy_does_not_fire_on_night_pain_or_cancer_alone() -> None:
    assert evaluate(ExtractedTriage(flags={"night_pain": True})).fired is False
    assert evaluate(ExtractedTriage(flags={"history_of_cancer": True})).fired is False


def test_multiple_rules_can_fire() -> None:
    result = evaluate(
        ExtractedTriage(flags={"saddle_anesthesia": True, "chest_pain": True})
    )
    assert result.fired is True
    assert "cauda_equina" in result.rule_ids
    assert "cardiac" in result.rule_ids


def test_patient_message_includes_reason_and_names_situation() -> None:
    result = evaluate(ExtractedTriage(flags={"chest_pain": True}))
    text = patient_message(result)
    lowered = text.lower()
    assert result.reason_plain_language.lower() in lowered
    assert "chest pain" in lowered
    instruction_at = min(i for i in (lowered.find(m) for m in _INSTRUCTION_MARKS) if i >= 0)
    care_at = min(lowered.find(m) for m in _CARE_MARKS if m in lowered)
    assert care_at < instruction_at
    assert "book" not in lowered
    assert "physio" not in lowered


def test_safety_package_has_no_llm_imports() -> None:
    import app.safety

    root = Path(app.safety.__file__).resolve().parent
    for path in root.rglob("*.py"):
        source = path.read_text()
        assert "gemini" not in source.lower(), path
        assert "app.llm" not in source, path
        assert "from app.llm" not in source, path
        assert "import app.llm" not in source, path
