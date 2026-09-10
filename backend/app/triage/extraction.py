import re

from app.models.types import ConditionArea, ExtractedTriage

from app.triage.msk import is_msk_narrative
from app.triage.non_msk import infer_non_msk_area

# Prefer explicit /10 scales; avoid treating "4 days" as severity.
_SEVERITY_EXPLICIT = re.compile(
    r"\b([0-9]|10)\s*(?:/\s*10|out\s+of\s+10)\b",
    re.IGNORECASE,
)
_SEVERITY_SLASH_LEAD = re.compile(r"(?m)^\s*([0-9]|10)\s*/\s*")
_SEVERITY_HOW_BAD = re.compile(
    r"\b([0-9]|10)\s*(?:that's|that is|is)?\s*how\s+bad\b",
    re.IGNORECASE,
)
_SEVERITY_BARE_LEAD = re.compile(r"(?m)^\s*([0-9]|10)\s*(?:[.!]|$|\s)")
_DURATION_NEAR = re.compile(
    r"\b(?:day|days|week|weeks|month|months|year|years|hour|hours)\b",
    re.IGNORECASE,
)


def merge_extraction(existing: ExtractedTriage, incoming: dict) -> ExtractedTriage:
    payload = {key: value for key, value in incoming.items() if key in ExtractedTriage.model_fields}
    parsed = ExtractedTriage.model_validate(payload)
    merged = existing.model_dump()
    for key in parsed.model_fields_set:
        value = getattr(parsed, key)
        if value is None:
            continue
        if isinstance(value, dict):
            if not value:
                continue
            current = dict(merged.get(key) or {})
            for inner_key, inner_value in value.items():
                if inner_value is not None:
                    current[inner_key] = inner_value
            merged[key] = current
            continue
        merged[key] = value
    return ExtractedTriage.model_validate(merged)


def _coerce_severity(raw: str) -> int | None:
    try:
        value = int(raw)
    except ValueError:
        return None
    if 0 <= value <= 10:
        return value
    return None


def parse_severity_from_text(user_text: str) -> int | None:
    text = (user_text or "").strip()
    if not text:
        return None
    for pattern in (_SEVERITY_EXPLICIT, _SEVERITY_HOW_BAD, _SEVERITY_SLASH_LEAD):
        match = pattern.search(text)
        if match:
            return _coerce_severity(match.group(1))
    match = _SEVERITY_BARE_LEAD.search(text)
    if not match:
        return None
    # Reject "4 days" / "2 weeks" style durations at the start of a clause.
    after = text[match.end() : match.end() + 24]
    if _DURATION_NEAR.search(after):
        return None
    return _coerce_severity(match.group(1))


def enrich_from_user_text(extracted: ExtractedTriage, user_text: str) -> ExtractedTriage:
    """Fill gaps the LLM often drops (e.g. leading '8 / …' severity)."""
    updates: dict = {}
    if extracted.severity is None:
        severity = parse_severity_from_text(user_text)
        if severity is not None:
            updates["severity"] = severity
    if not updates:
        return extracted
    return extracted.model_copy(update=updates)


def infer_condition_area(extracted: ExtractedTriage) -> ConditionArea | None:
    if extracted.condition_area is not None:
        return extracted.condition_area
    non_msk = infer_non_msk_area(extracted)
    if non_msk is not None:
        return non_msk
    if is_msk_narrative(extracted):
        return ConditionArea.MSK
    return None
