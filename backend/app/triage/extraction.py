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

# These deliberately conservative patterns are a reliability backstop for facts
# patients state plainly. They do not make a diagnosis and do not set safety
# answers; Gemini can still extract richer clinical detail around them.
_BODY_LOCATION_RE = re.compile(
    r"\b(?:(?:lower|upper|mid(?:dle)?|left|right)\s+){0,2}"
    r"(?:back|neck|shoulder|knee|hip|ankle|wrist|elbow|foot|hand)\b",
    re.IGNORECASE,
)
_DURATION_RE = re.compile(
    r"\b(?:for|past|about|around|over)\s+(\d+\s+(?:hours?|days?|weeks?|months?|years?))\b"
    r"|\b(?:started|begin|began)\s+(\d+\s+(?:hours?|days?|weeks?|months?|years?))\s+ago\b",
    re.IGNORECASE,
)
_PAIN_QUALITY_RE = re.compile(
    r"\b(sharp|dull|aching|burning|stabbing|throbbing|shooting)\s+pain\b",
    re.IGNORECASE,
)
_WORSE_RE = re.compile(r"\b(?:worse|aggravated)\s+(?:when|with|by)\s+(.{2,100}?)(?=\s+(?:and\s+)?better\b|[.;,!\n]|$)", re.IGNORECASE)
_BETTER_RE = re.compile(r"\b(?:better|relieved)\s+(?:when|with|by)\s+([^.;,!\n]{2,100})", re.IGNORECASE)


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
    """Fill unambiguous gaps the LLM can drop, without overriding known facts."""
    updates: dict = {}
    text = (user_text or "").strip()
    if extracted.severity is None:
        severity = parse_severity_from_text(text)
        if severity is not None:
            updates["severity"] = severity
    if not extracted.body_location:
        location = _BODY_LOCATION_RE.search(text)
        if location:
            updates["body_location"] = location.group(0).casefold()
    if not extracted.onset:
        duration = _DURATION_RE.search(text)
        if duration:
            updates["onset"] = next(value for value in duration.groups() if value).casefold()
    if not extracted.symptoms:
        quality = _PAIN_QUALITY_RE.search(text)
        if quality:
            updates["symptoms"] = [quality.group(0).casefold()]
    if not extracted.aggravating:
        worse = _WORSE_RE.search(text)
        if worse:
            updates["aggravating"] = [worse.group(1).strip().casefold()]
    if not extracted.relieving:
        better = _BETTER_RE.search(text)
        if better:
            updates["relieving"] = [better.group(1).strip().casefold()]
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
