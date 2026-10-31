from pathlib import Path

import pytest

from app.models.types import ExtractedTriage
from app.safety.clinical_engine import engine_version, load_engine, prompt_digest
from app.safety.evaluator import evaluate
from app.safety.escalation import patient_message

_CARE_MARKS = ("concern", "sorry", "care", "worried", "with you")
_INSTRUCTION_MARKS = ("doctor", "hospital", "emergency")

_HARD_FLAG_CASES = (
    ("saddle_anesthesia", "cauda_equina", "RED", "escalate_doctor"),
    ("bladder_bowel_change", "cauda_equina", "RED", "escalate_doctor"),
    ("bilateral_leg_weakness", "cauda_equina", "RED", "escalate_doctor"),
    ("recent_trauma", "major_trauma", "ORANGE", "medical_review"),
    ("chest_pain", "cardiac", "RED", "escalate_doctor"),
    ("sudden_neuro_deficit", "acute_neuro", "RED", "escalate_doctor"),
)

_AMBER_FLAG_CASES = (
    ("fever", "infection"),
    ("night_sweats", "infection"),
    ("unexplained_weight_loss", "malignancy_screen"),
    ("unexplained_numbness", "acute_neuro"),
)


def test_clinical_engine_json_loads():
    engine = load_engine()
    assert engine["engine"]["version"] == "1.0.0"
    assert "low_back" in engine["regions"]
    assert engine_version() == "1.0.0"
    digest = prompt_digest().lower()
    assert "green" in digest and "red" in digest


def test_cauda_equina_fires_without_llm():
    extracted = ExtractedTriage(flags={"saddle_anesthesia": True})
    result = evaluate(extracted)
    assert result.fired is True
    assert result.risk_level == "RED"
    assert "cauda_equina" in result.rule_ids
    text = patient_message(result)
    assert "doctor" in text.lower() or "hospital" in text.lower() or "emergency" in text.lower()
    assert len(result.reason_plain_language) > 20
    care_marks = ("concern", "sorry", "care", "worried", "with you")
    assert any(m in text.lower() for m in care_marks)
    instruction_at = min(
        i
        for i in (
            text.lower().find("doctor"),
            text.lower().find("hospital"),
            text.lower().find("emergency"),
        )
        if i >= 0
    )
    care_at = min(text.lower().find(m) for m in care_marks if m in text.lower())
    assert care_at < instruction_at
    assert "book" not in text.lower() or "booking" not in text.lower()


def test_unknown_flags_do_not_fire():
    extracted = ExtractedTriage(flags={"saddle_anesthesia": None})
    assert evaluate(extracted).fired is False


def test_safety_module_has_no_llm_import():
    import app.safety.evaluator as ev
    import pathlib

    source = pathlib.Path(ev.__file__).read_text()
    assert "gemini" not in source.lower()
    assert "app.llm" not in source


@pytest.mark.parametrize(("flag", "rule_id", "level", "action"), _HARD_FLAG_CASES)
def test_hard_flag_maps_to_engine_level(flag: str, rule_id: str, level: str, action: str) -> None:
    result = evaluate(ExtractedTriage(flags={flag: True}))
    assert result.fired is True
    assert rule_id in result.rule_ids
    assert result.risk_level == level
    assert result.action == action
    assert len(result.reason_plain_language) > 20


@pytest.mark.parametrize(("flag", "legacy_id"), _AMBER_FLAG_CASES)
def test_amber_flags_route_to_specialist_review(flag: str, legacy_id: str) -> None:
    result = evaluate(ExtractedTriage(flags={flag: True}))
    assert result.fired is False
    assert result.risk_level == "AMBER"
    assert result.action == "specialist_review"
    assert legacy_id in result.rule_ids or result.rule_ids
    text = patient_message(result).lower()
    assert "5 minutes" in text or "specialist" in text
    assert "emergency hospital" not in text


@pytest.mark.parametrize(
    "flag", [case[0] for case in _HARD_FLAG_CASES] + [case[0] for case in _AMBER_FLAG_CASES]
)
def test_false_flag_does_not_fire(flag: str) -> None:
    result = evaluate(ExtractedTriage(flags={flag: False}))
    assert result.fired is False
    assert result.rule_ids == []
    assert result.action == "continue"
    assert result.risk_level == "GREEN"


def test_missing_flags_do_not_fire() -> None:
    result = evaluate(ExtractedTriage())
    assert result.fired is False
    assert result.rule_ids == []
    assert result.action == "continue"


def test_malignancy_cancer_plus_night_pain_is_amber() -> None:
    result = evaluate(
        ExtractedTriage(flags={"history_of_cancer": True, "night_pain": True})
    )
    assert result.risk_level == "AMBER"
    assert result.action == "specialist_review"
    assert result.fired is False


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


def test_safety_package_has_no_llm_imports() -> None:
    import app.safety

    root = Path(app.safety.__file__).resolve().parent
    for path in root.rglob("*.py"):
        source = path.read_text()
        assert "gemini" not in source.lower(), path
        assert "app.llm" not in source, path
        assert "from app.llm" not in source, path
        assert "import app.llm" not in source, path


def test_prompt_builder_uses_core_and_stage_prompt_not_master_prompt():
    from app.llm.prompt_builder import build
    from app.models.types import Identity, PatientPhase, Persona
    from uuid import uuid4

    prompt = build(
        Identity(persona=Persona.PATIENT, person_id=uuid4(), phone_e164="+2348000000001"),
        PatientPhase.MID_TRIAGE,
        ExtractedTriage(),
        "en",
        [],
        "",
    )
    assert "Joy — Master System Prompt" not in prompt
    assert "backend owns" in prompt.lower()
    assert "CLINICAL SAFETY ENGINE" not in prompt
    assert "privacy" in prompt.lower()
