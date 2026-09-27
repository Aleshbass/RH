from app.models.types import ConditionArea, ExtractedTriage
from app.triage.extraction import constrain_model_extraction, infer_condition_area, merge_extraction
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


def test_model_severity_requires_a_patient_stated_numeric_score():
    assert constrain_model_extraction({"severity": 1}, "I have a sharp lower-back pain") == {}
    assert constrain_model_extraction({"severity": 1}, "My pain is 6 out of 10") == {"severity": 6}


def test_merge_normalizes_common_model_area_alias_and_ignores_bad_optional_fields():
    """A malformed Gemini extraction must not prevent the WhatsApp reply."""
    merged = merge_extraction(
        ExtractedTriage(),
        {
            "body_location": "lower back",
            "condition_area": "musculoskeletal",
            "severity": "sharp",
            "extraction_confidence": {"body_location": "high"},
        },
    )
    assert merged.body_location == "lower back"
    assert merged.condition_area == ConditionArea.MSK
    assert merged.severity is None
    assert merged.extraction_confidence == {}


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
    assert "severity" not in missing
    assert "goals" not in missing
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


def test_msk_back_leg_safety_is_scheduled_by_protocol_not_story_fields():
    extracted = ExtractedTriage(
        onset="1 week",
        severity=8,
        body_location="lower back",
        goals="walk to work",
        condition_area=ConditionArea.MSK,
        flags={"saddle_anesthesia": None, "bladder_bowel_change": None},
    )
    from app.safety.protocol_runtime import schedule_questions

    assert "safety_flags" not in missing_fields(extracted)
    assert schedule_questions(extracted)


def test_safety_protocol_keeps_question_state_out_of_story_followup():
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
    assert "safety_flags" not in missing_fields(extracted)


def test_shoulder_msk_does_not_require_cauda_flags():
    extracted = ExtractedTriage(
        onset="2 weeks",
        severity=5,
        body_location="shoulder",
        goals="lift my bag",
        condition_area=ConditionArea.MSK,
    )
    assert missing_fields(extracted) == []


def test_knee_get_back_to_goals_do_not_require_cauda():
    """Goals like 'get back to running' must not trip the 'back' cauda marker."""
    extracted = ExtractedTriage(
        onset="4 days",
        severity=8,
        body_location="left knee",
        goals="get back to running",
        condition_area=ConditionArea.MSK,
        aggravating=["stairs", "long distances"],
    )
    assert missing_fields(extracted) == []


def test_lower_back_pain_uses_protocol_scheduler_not_story_missing_fields():
    extracted = ExtractedTriage(
        onset="1 week",
        severity=7,
        body_location="lower back",
        goals="get back to work",
        condition_area=ConditionArea.MSK,
    )
    from app.safety.protocol_runtime import schedule_questions

    assert "safety_flags" not in missing_fields(extracted)
    assert schedule_questions(extracted)


def test_lower_back_safety_prompt_is_grouped_and_backend_owned():
    from app.conversation.turn_handler import _safety_prompt, _safety_screen
    from app.safety.protocol_runtime import schedule_questions

    extracted = ExtractedTriage(body_location="lower back", condition_area=ConditionArea.MSK)
    prompt = _safety_prompt(extracted)
    screen = _safety_screen(extracted)
    assert "Reply Yes, No, or Unsure" in prompt
    assert "1." in prompt
    assert "LB-" not in prompt  # patient copy contains approved wording, not internal IDs
    assert len(screen) == 4
    covered = [question.id for _, questions in screen for question in questions]
    assert set(covered) == {question.id for question in schedule_questions(extracted, limit=100)}
    assert len(covered) == len(set(covered))


def test_safety_parser_accepts_slash_separated_case_insensitive_answers():
    from app.conversation.turn_handler import _safety_screen
    from app.safety.protocol_runtime import NO, YES, normalize_answer
    import re

    extracted = ExtractedTriage(body_location="lower back", condition_area=ConditionArea.MSK)
    screen = _safety_screen(extracted)
    parsed = {
        int(index): normalize_answer(answer)
        for index, answer in re.findall(
            r"(?:^|[\s,;/|])#?(\d{1,2})\s*[).:=-]?\s*(yes|no|unsure)\b",
            "1.no/2. NO / 3) no, 4 - Yes",
            re.I,
        )
    }
    assert len(screen) == 4
    assert parsed == {1: NO, 2: NO, 3: NO, 4: YES}


def test_narrative_safety_negatives_are_mined_without_using_the_model():
    from app.conversation.turn_handler import _narrative_no_answers, _safety_screen

    extracted = ExtractedTriage(body_location="lower back", condition_area=ConditionArea.MSK)
    answers = _narrative_no_answers(
        "I have not had an injury, numbness, weakness, or bladder/bowel changes.",
        _safety_screen(extracted),
    )
    assert answers
    assert set(answers.values()) == {"NO"}


def test_plain_summary_hides_internal_specialty_and_system_copy():
    from app.triage.summary import plain_summary

    summary = plain_summary(ExtractedTriage(
        body_location="lower back", onset="3 days", severity=5,
        goals="sit and stand comfortably", condition_area=ConditionArea.MSK,
    )).lower()

    assert "msk" not in summary
    assert "guidance only" not in summary
    assert "not a doctor" not in summary


def test_enrichment_refines_generic_back_to_lower_back():
    from app.triage.extraction import enrich_from_user_text

    enriched = enrich_from_user_text(ExtractedTriage(body_location="back"), "It is in my lower back.")
    assert enriched.body_location == "lower back"


def test_enrich_severity_from_slash_reply_when_llm_omits_it():
    from app.triage.extraction import enrich_from_user_text

    existing = ExtractedTriage(
        onset="4 days",
        body_location="knee",
        goals="get back to running",
        condition_area=ConditionArea.MSK,
    )
    enriched = enrich_from_user_text(
        existing,
        "8 / i hope to get back to running, i'm athlete you see...",
    )
    assert enriched.severity == 8


def test_enrich_severity_ignores_duration_numbers():
    from app.triage.extraction import enrich_from_user_text

    existing = ExtractedTriage(body_location="knee")
    enriched = enrich_from_user_text(
        existing,
        "my knee hurts, it's been hurting for the past 4 days",
    )
    assert enriched.severity is None


def test_enrich_severity_from_out_of_ten():
    from app.triage.extraction import enrich_from_user_text

    existing = ExtractedTriage(body_location="knee")
    enriched = enrich_from_user_text(existing, "9 that's how bad it feels")
    assert enriched.severity == 9


def test_safety_normalizer_accepts_compact_negative_replies():
    from app.safety.protocol_runtime import NO, normalize_answer

    assert normalize_answer("no, none") == NO
    assert normalize_answer("No to all") == NO


def test_enrich_keeps_plain_lower_back_facts_when_llm_omits_them():
    """Regression: clear patient facts must not be lost to a sparse LLM extraction."""
    from app.triage.extraction import enrich_from_user_text

    enriched = enrich_from_user_text(
        ExtractedTriage(),
        "My lower back has had a sharp pain for 3 days. It is worse when I walk and better when I rest.",
    )
    assert enriched.body_location == "lower back"
    assert enriched.onset == "3 days"
    assert enriched.symptoms == ["sharp pain"]
    assert enriched.aggravating == ["i walk"]
    assert enriched.relieving == ["i rest"]
    assert infer_condition_area(enriched) == ConditionArea.MSK


def test_enrich_preserves_explicit_duration_over_model_label():
    from app.triage.extraction import enrich_from_user_text

    enriched = enrich_from_user_text(
        ExtractedTriage(onset="acute", body_location="lower back"),
        "My lower back has hurt for 3 days.",
    )
    assert enriched.onset == "3 days"


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


def test_plain_summary_does_not_duplicate_the_confirmation_question():
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
    assert "confirm" in lower
    assert "?" not in text
    assert "accept" not in lower
