from app.models.types import ExtractedTriage

from app.triage.msk import needs_cauda_screen, unanswered_cauda_flags
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

_SAFETY_SENTENCE = (
    "Any numbness around the saddle area, a change in bladder or bowel control, "
    "or weakness in both legs?"
)


def _has_condition_narrative(extracted: ExtractedTriage) -> bool:
    if extracted.body_location and extracted.body_location.strip():
        return True
    if extracted.goals and extracted.goals.strip():
        return True
    return infer_non_msk_area(extracted) is not None


def missing_fields(extracted: ExtractedTriage) -> list[str]:
    missing: list[str] = []
    if not extracted.onset:
        missing.append("onset")
    if extracted.severity is None:
        missing.append("severity")
    if not _has_condition_narrative(extracted):
        missing.append("body_location")
    if extracted.condition_area is None:
        missing.append("condition_area")
    if not extracted.goals:
        missing.append("goals")
    if needs_cauda_screen(extracted) and unanswered_cauda_flags(extracted):
        missing.append("safety_flags")
    return missing


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
        parts.append(_SAFETY_SENTENCE)
    return " ".join(parts) if parts else None
