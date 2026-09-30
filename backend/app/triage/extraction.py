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
_SEVERITY_NAMED = re.compile(
    r"\b(?:severity|pain\s+(?:score|level))\s*(?:is|=|:)\s*(10|[0-9])\b",
    re.IGNORECASE,
)
_SEVERITY_CORRECTION = re.compile(
    r"\b(?:severity|pain\s+(?:score|level))\s+(?:is\s+)?not\s+(?:10|[0-9])"
    r"(?:\s*(?:out\s+of|/)\s*10)?\s*[,;]?\s*"
    r"(?:it'?s|it\s+is|but\s+(?:it\s+)?(?:is|it'?s))\s*(10|[0-9])\b",
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
# Patients commonly put the duration after the mechanism: "I twisted my ankle
# playing football 4 days ago." The earlier pattern only accepted "started 4
# days ago", which made Joy forget a plainly supplied onset when Gemini's
# structured extraction was unavailable.
_DURATION_AGO_RE = re.compile(
    r"\b(\d+\s+(?:hours?|days?|weeks?|months?|years?))\s+ago\b",
    re.IGNORECASE,
)
_GOAL_RE = re.compile(
    r"\b(?:i(?:'d| would)\s+like|i\s+want|i(?:'m| am)\s+hoping)"
    r"\s+(?:physiotherapy\s+)?(?:to\s+)?([^.!?]{3,120})",
    re.IGNORECASE,
)
_PAIN_QUALITY_RE = re.compile(
    r"\b(sharp|dull|aching|burning|stabbing|throbbing|shooting)\s+pain\b",
    re.IGNORECASE,
)
_WORSE_RE = re.compile(r"\b(?:worse|aggravated)\s+(?:when|with|by)\s+(.{2,100}?)(?=\s+(?:and\s+)?better\b|[.;,!\n]|$)", re.IGNORECASE)
_BETTER_RE = re.compile(r"\b(?:better|relieved)\s+(?:when|with|by)\s+([^.;,!\n]{2,100})", re.IGNORECASE)


def merge_extraction(existing: ExtractedTriage, incoming: dict) -> ExtractedTriage:
    """Merge an untrusted model extraction without allowing it to break a turn.

    Structured-output providers occasionally return a human-friendly category
    (``musculoskeletal``) or put a descriptive word in a typed field such as
    ``severity``.  Those are incomplete facts, not a reason to abandon the
    patient's inbound WhatsApp message.  Validate fields independently and
    retain only the usable ones.
    """
    payload: dict = {}
    area_aliases = {
        "musculoskeletal": ConditionArea.MSK.value,
        "neurological": ConditionArea.NEURO.value,
        "pediatric": ConditionArea.PAEDIATRIC.value,
        "paediatrics": ConditionArea.PAEDIATRIC.value,
        "cardio-respiratory": ConditionArea.CARDIORESPIRATORY.value,
        "women's health": ConditionArea.WOMENS_HEALTH.value,
        "womens health": ConditionArea.WOMENS_HEALTH.value,
        "post-surgical": ConditionArea.POST_SURGICAL.value,
        "postsurgical": ConditionArea.POST_SURGICAL.value,
    }
    for key, value in incoming.items():
        if key not in ExtractedTriage.model_fields:
            continue
        if key == "condition_area" and isinstance(value, str):
            value = area_aliases.get(value.casefold().strip(), value)
        # Validate each field in isolation.  A bad optional field must not
        # discard valid facts from the same model response or crash the worker.
        try:
            ExtractedTriage.model_validate({key: value})
        except (TypeError, ValueError):
            continue
        payload[key] = value

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
    for pattern in (
        _SEVERITY_CORRECTION,
        _SEVERITY_NAMED,
        _SEVERITY_EXPLICIT,
        _SEVERITY_HOW_BAD,
        _SEVERITY_SLASH_LEAD,
    ):
        match = pattern.search(text)
        if match:
            return _coerce_severity(match.group(1))
    match = _SEVERITY_BARE_LEAD.search(text)
    if not match:
        return None
    # A numbered safety response such as "1. No" is an answer label, never a
    # pain score. This was previously misread as severity 1.
    after = text[match.end() : match.end() + 24]
    if re.match(r"\s*(?:yes|no|unsure)\b", after, re.IGNORECASE):
        return None
    # Reject "4 days" / "2 weeks" style durations at the start of a clause.
    if _DURATION_NEAR.search(after):
        return None
    return _coerce_severity(match.group(1))


def constrain_model_extraction(incoming: dict, user_text: str) -> dict:
    """Keep model fields typed *and* grounded in this patient message.

    A schema-valid number is not evidence that a patient reported a pain score.
    Severity is therefore owned by the deterministic numeric parser, never an
    inference made from pain quality such as ``sharp`` or ``severe``.
    """
    constrained = dict(incoming or {})
    # The model may propose semantic safety evidence, but it cannot directly
    # write protocol answers or safety flags. Those are validated later by the
    # deterministic safety layer against the patient's actual message.
    constrained.pop("safety_answers", None)
    constrained.pop("safety_question_order", None)
    constrained.pop("safety_protocol_version", None)
    constrained.pop("flags", None)
    if "severity" in constrained:
        reported = parse_severity_from_text(user_text)
        if reported is None:
            constrained.pop("severity", None)
        else:
            constrained["severity"] = reported
    return constrained


def enrich_from_user_text(extracted: ExtractedTriage, user_text: str) -> ExtractedTriage:
    """Fill unambiguous gaps the LLM can drop, without overriding known facts."""
    updates: dict = {}
    text = (user_text or "").strip()
    # A patient can correct an earlier score. The parser accepts only a clear
    # score expression and ignores numbered safety answers, so a later explicit
    # value must replace a prior one rather than remain stuck indefinitely.
    severity = parse_severity_from_text(text)
    if severity is not None:
        updates["severity"] = severity
    location = _BODY_LOCATION_RE.search(text)
    if location:
        observed_location = location.group(0).casefold()
        # A later explicit "lower back" must refine an earlier generic "back"
        # rather than leaving the protocol stuck without a region.
        if not extracted.body_location or (
            extracted.body_location.casefold().strip() == "back"
            and observed_location != "back"
        ):
            updates["body_location"] = observed_location
    # An explicit duration is more precise than a model label such as "acute".
    duration = _DURATION_RE.search(text) or _DURATION_AGO_RE.search(text)
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
    if not extracted.goals:
        goal = _GOAL_RE.search(text)
        if goal:
            updates["goals"] = goal.group(1).strip().casefold()
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
