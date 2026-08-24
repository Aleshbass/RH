from app.models.types import ConditionArea, ExtractedTriage
from app.triage.extraction import infer_condition_area, merge_extraction
from app.triage.non_msk import infer_non_msk_area
from app.triage.question_batching import grouped_followup, missing_fields
from app.triage.summary import plain_summary


def test_one_grouped_followup_not_checklist():
    extracted = merge_extraction(ExtractedTriage(), {"onset": "2 weeks", "body_location": "shoulder"})
    missing = missing_fields(extracted)
    assert "onset" not in missing
    followup = grouped_followup(missing)
    assert followup is not None
    assert followup.count("?") <= 2  # one grouped ask, not a chain of questions as separate turns
    assert "\n1." not in followup  # no numbered checklist


def test_neuro_not_labelled_msk():
    extracted = ExtractedTriage(goals="walk after stroke")
    assert infer_non_msk_area(extracted) == ConditionArea.NEURO


def test_merge_none_does_not_wipe_known_values():
    existing = ExtractedTriage(onset="2 weeks", severity=6, body_location="knee")
    merged = merge_extraction(existing, {"onset": None, "severity": 7})
    assert merged.onset == "2 weeks"
    assert merged.severity == 7
    assert merged.body_location == "knee"


def test_merge_explicit_empty_list_can_wipe():
    existing = ExtractedTriage(aggravating=["stairs"])
    merged = merge_extraction(existing, {"aggravating": []})
    assert merged.aggravating == []


def test_merge_explicit_empty_flags_does_not_wipe():
    existing = ExtractedTriage(flags={"fever": True})
    merged = merge_extraction(existing, {"flags": {}})
    assert merged.flags == {"fever": True}


def test_merge_unset_keys_do_not_wipe_collections():
    existing = ExtractedTriage(aggravating=["stairs"], flags={"fever": True})
    merged = merge_extraction(existing, {"severity": 6})
    assert merged.aggravating == ["stairs"]
    assert merged.flags == {"fever": True}
    assert merged.severity == 6


def test_merge_flag_none_does_not_wipe_inner():
    existing = ExtractedTriage(flags={"fever": True})
    merged = merge_extraction(existing, {"flags": {"fever": None, "night_pain": False}})
    assert merged.flags["fever"] is True
    assert merged.flags["night_pain"] is False


def test_missing_fields_skips_present_and_needs_rest():
    extracted = merge_extraction(
        ExtractedTriage(),
        {"onset": "2 weeks", "body_location": "shoulder"},
    )
    missing = missing_fields(extracted)
    assert "onset" not in missing
    assert "body_location" not in missing
    assert "severity" in missing
    assert "goals" in missing
    assert "condition_area" in missing


def test_condition_narrative_satisfies_location():
    extracted = ExtractedTriage(goals="walk after stroke", onset="a month", severity=4)
    missing = missing_fields(extracted)
    assert "body_location" not in missing


def test_vague_goals_do_not_count_as_condition_narrative():
    extracted = ExtractedTriage(onset="2 weeks", severity=5, goals="get better")
    missing = missing_fields(extracted)
    assert "body_location" in missing
    assert "goals" not in missing


def test_msk_back_leg_missing_safety_is_one_grouped_sentence():
    extracted = ExtractedTriage(
        onset="1 week",
        severity=8,
        body_location="lower back",
        goals="walk to work",
        condition_area=ConditionArea.MSK,
        flags={"saddle_anesthesia": None, "bladder_bowel_change": None},
    )
    missing = missing_fields(extracted)
    assert "safety_flags" in missing
    followup = grouped_followup(missing)
    assert followup is not None
    assert followup.count("?") <= 2
    assert "\n1." not in followup
    lower = followup.lower()
    assert "saddle" in lower or "bladder" in lower or "leg" in lower


def test_safety_followup_only_asks_unanswered_flags():
    extracted = ExtractedTriage(
        onset="1 week",
        severity=8,
        body_location="lower back",
        goals="walk to work",
        condition_area=ConditionArea.MSK,
        flags={
            "saddle_anesthesia": False,
            "bladder_bowel_change": True,
            "bilateral_leg_weakness": None,
        },
    )
    missing = missing_fields(extracted)
    assert "safety_flags" in missing
    followup = grouped_followup(missing)
    assert followup is not None
    assert followup.count("?") == 1
    assert "\n1." not in followup
    lower = followup.lower()
    assert "leg" in lower or "weakness" in lower
    assert "saddle" not in lower
    assert "bladder" not in lower
    assert "bowel" not in lower


def test_shoulder_msk_does_not_require_cauda_flags():
    extracted = ExtractedTriage(
        onset="2 weeks",
        severity=5,
        body_location="shoulder",
        goals="lift my bag",
        condition_area=ConditionArea.MSK,
    )
    assert "safety_flags" not in missing_fields(extracted)
    assert missing_fields(extracted) == []


def test_grouped_followup_none_when_complete():
    extracted = ExtractedTriage(
        onset="2 weeks",
        severity=5,
        body_location="shoulder",
        goals="lift my bag",
        condition_area=ConditionArea.MSK,
    )
    assert grouped_followup(missing_fields(extracted)) is None


def test_infer_condition_area_keywords():
    assert infer_non_msk_area(ExtractedTriage(goals="Parkinson balance")) == ConditionArea.NEURO
    assert infer_non_msk_area(ExtractedTriage(goals="help my child walk")) == ConditionArea.PAEDIATRIC
    assert infer_non_msk_area(ExtractedTriage(goals="breathing after pneumonia")) == ConditionArea.CARDIORESPIRATORY
    assert infer_non_msk_area(ExtractedTriage(goals="pelvic floor after birth")) == ConditionArea.WOMENS_HEALTH
    assert infer_non_msk_area(ExtractedTriage(goals="rehab after knee surgery")) == ConditionArea.POST_SURGICAL


def test_unset_joint_pain_defaults_to_msk():
    extracted = ExtractedTriage(body_location="shoulder", goals="joint pain when I lift")
    assert infer_condition_area(extracted) == ConditionArea.MSK


def test_explicit_non_msk_not_overwritten_with_msk():
    extracted = ExtractedTriage(
        condition_area=ConditionArea.NEURO,
        body_location="shoulder",
        goals="joint pain and walk after stroke",
    )
    assert infer_condition_area(extracted) == ConditionArea.NEURO


def test_no_msk_default_without_joint_muscle_narrative():
    extracted = ExtractedTriage(goals="I need help getting stronger")
    assert infer_condition_area(extracted) is None
    assert infer_non_msk_area(extracted) is None


def test_plain_summary_asks_confirm_or_correct():
    extracted = ExtractedTriage(
        onset="2 weeks",
        severity=6,
        body_location="shoulder",
        goals="lift my bag",
        condition_area=ConditionArea.MSK,
    )
    text = plain_summary(extracted)
    lower = text.lower()
    assert "shoulder" in lower
    assert "2 weeks" in lower
    assert "confirm" in lower or "correct" in lower
    assert "?" in text
