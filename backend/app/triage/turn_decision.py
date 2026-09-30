"""Validated, non-authoritative interpretation of a patient triage turn.

The model may suggest what a patient meant, but it does not change clinical
safety, booking eligibility, or the persisted record by itself.  This small
schema is deliberately separate from ``ExtractedTriage`` so a conversational
reply cannot silently become clinical state.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class TriageDisposition(StrEnum):
    ASK_RELEVANT_FOLLOW_UP = "ASK_RELEVANT_FOLLOW_UP"
    READY_TO_SUMMARIZE = "READY_TO_SUMMARIZE"
    CORRECTION = "CORRECTION"
    SAFETY_ANSWER = "SAFETY_ANSWER"
    UNCLEAR = "UNCLEAR"


class TriageTurnDecision(BaseModel):
    """A constrained interpretation proposed by the language model."""

    disposition: TriageDisposition = TriageDisposition.UNCLEAR
    # These are hints for the reducer and audit trail.  The reducer accepts
    # only fields independently corroborated by Joy's deterministic parsers.
    corrections: dict[str, Any] = Field(default_factory=dict)
    missing_relevant_fields: list[str] = Field(default_factory=list)
    reasoning: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)

    @classmethod
    def from_untrusted(cls, value: object) -> "TriageTurnDecision":
        if not isinstance(value, dict):
            return cls()
        try:
            return cls.model_validate(value)
        except (TypeError, ValueError):
            return cls()
