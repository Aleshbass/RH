import json
from pathlib import Path

from app.models.types import ExtractedTriage
from app.triage.extraction import enrich_from_user_text, parse_severity_from_text


CORPUS = Path(__file__).parent / "fixtures" / "joy_triage_eval_corpus.json"


def test_triage_eval_corpus_is_well_formed_and_covers_regressions():
    payload = json.loads(CORPUS.read_text(encoding="utf-8"))
    scenarios = payload["scenarios"]
    assert payload["version"] == "joy-triage-v1"
    assert len(scenarios) >= 24
    assert len({scenario["id"] for scenario in scenarios}) == len(scenarios)
    categories = {scenario["category"] for scenario in scenarios}
    assert {"severity_correction", "natural_safety_negative", "mechanism_already_known", "resilience"} <= categories


def test_corpus_severity_and_story_regressions_are_deterministically_covered():
    payload = json.loads(CORPUS.read_text(encoding="utf-8"))
    by_id = {scenario["id"]: scenario for scenario in payload["scenarios"]}
    assert parse_severity_from_text(by_id["severity-correction"]["messages"][0]) == 4
    assert parse_severity_from_text(by_id["severity-numbered-answer-not-score"]["messages"][0]) is None
    enriched = enrich_from_user_text(
        ExtractedTriage(), by_id["sport-ankle-complete-story"]["messages"][0]
    )
    assert enriched.onset == "4 days"
    assert enriched.body_location == "ankle"
