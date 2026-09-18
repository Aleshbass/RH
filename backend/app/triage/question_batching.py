from app.models.types import ExtractedTriage

from app.triage.msk import is_msk_narrative
from app.triage.non_msk import infer_non_msk_area

_FIELD_PHRASES = {
    "onset": "when this started",
    "severity": "how bad it feels from 1 to 10",
    "body_location": "where you feel it",
    "condition_area": (
        "whether this is joint or muscle pain, or something like stroke, "
        "children's, breathing, pelvic, or post-surgery rehab"
    ),
    "goals": "what you're hoping to get back to",
}

_SAFETY_PHRASES = {
    "saddle_anesthesia": "numbness around the saddle area",
    "bladder_bowel_change": "a change in bladder or bowel control",
    "bilateral_leg_weakness": "weakness in both legs",
}


def _has_condition_narrative(extracted: ExtractedTriage) -> bool:
    if extracted.body_location and extracted.body_location.strip():
        return True
    if infer_non_msk_area(extracted) is not None:
        return True
    return is_msk_narrative(extracted)


def missing_fields(extracted: ExtractedTriage) -> list[str]:
    missing: list[str] = []
    if not extracted.onset:
        missing.append("onset")
    if not _has_condition_narrative(extracted):
        missing.append("body_location")
    if extracted.condition_area is None:
        missing.append("condition_area")
    # Severity and goals enrich a consultation but are not prerequisites for
    # entering the deterministic safety screen. Safety questions are scheduled
    # exclusively by the protocol runtime, never folded into a vague story
    # follow-up where they could be skipped or answered ambiguously.
    return missing


def _join_phrases(phrases: list[str]) -> str:
    if len(phrases) == 1:
        return phrases[0]
    if len(phrases) == 2:
        return f"{phrases[0]} or {phrases[1]}"
    return ", ".join(phrases[:-1]) + f", or {phrases[-1]}"


def _safety_sentence(missing: list[str]) -> str:
    phrases = [_SAFETY_PHRASES[key] for key in _SAFETY_PHRASES if key in missing]
    if not phrases:
        phrases = list(_SAFETY_PHRASES.values())
    return f"Any {_join_phrases(phrases)}?"


def grouped_followup(missing: list[str]) -> str | None:
    if not missing:
        return None
    core = [key for key in missing if key != "safety_flags" and key in _FIELD_PHRASES]
    parts: list[str] = []
    if core:
        phrases = [_FIELD_PHRASES[key] for key in core]
        if len(phrases) == 1:
            joined = phrases[0]
        elif len(phrases) == 2:
            joined = f"{phrases[0]} and {phrases[1]}"
        else:
            joined = ", ".join(phrases[:-1]) + f", and {phrases[-1]}"
        parts.append(f"Could you tell me {joined}?")
    if "safety_flags" in missing:
        parts.append(_safety_sentence(missing))
    return " ".join(parts) if parts else None
