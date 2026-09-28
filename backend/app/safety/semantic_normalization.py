"""Deterministic validation for evidence-backed model safety proposals.

An LLM can recognize patient phrasing that is not covered by a small regular
expression vocabulary. It must never directly clear a red-flag question: this
module accepts only a narrow, cited proposal whose evidence appears verbatim in
the inbound message and meets the corresponding code-owned safety rule.
"""

from __future__ import annotations

import re
from typing import Any

from app.safety.protocol_runtime import NO


def _compact(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold()).strip()


def _question_is_major_injury(text: str) -> bool:
    lowered = text.casefold()
    return any(term in lowered for term in ("serious accident", "major fall", "significant injury"))


def _minor_incident_with_reassuring_assessment(text: str) -> bool:
    """Accept only a specifically described *minor* incident plus assessment.

    A bare "accident" is never converted to NO. The additional reassurance is
    deliberately required so the model cannot minimise a potentially serious
    injury just because the patient used a casual word.
    """
    minor_incident = re.search(r"\bminor\s+(?:car\s+)?(?:accident|collision|fall|injury)\b", text)
    reassuring_assessment = any(
        phrase in text
        for phrase in ("no fracture", "nothing was broken", "nothing broken", "no broken bone")
    )
    return bool(minor_incident and reassuring_assessment)


def validated_semantic_safety_answers(
    proposals: Any,
    user_text: str,
    questions: list[Any],
) -> dict[str, str]:
    """Return only model proposals that pass deterministic evidence checks.

    ``proposals`` is untrusted JSON from Gemini. For now the only semantic NO
    that can clear a protocol item is a minor, clinically assessed incident;
    all other safety negatives continue through the explicit text parser or a
    patient follow-up question.
    """
    if not isinstance(proposals, dict):
        return {}
    candidate = proposals.get("major_injury")
    if not isinstance(candidate, dict):
        return {}
    answer = str(candidate.get("answer") or "").upper().strip()
    evidence = str(candidate.get("evidence") or "").strip()
    text = _compact(user_text or "")
    quoted = _compact(evidence)
    if answer != NO or not quoted or quoted not in text:
        return {}
    if not _minor_incident_with_reassuring_assessment(text):
        return {}
    return {
        str(question.id): NO
        for question in questions
        if _question_is_major_injury(str(question.text))
    }
