"""Apply a model suggestion to Joy's triage state conservatively.

This is modelled after Stradha's state-reducer boundary: semantic judgement is
useful, but only explicit, independently verified facts can alter state.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models.types import ExtractedTriage
from app.triage.extraction import enrich_from_user_text, parse_severity_from_text
from app.triage.turn_decision import TriageDisposition, TriageTurnDecision


@dataclass(frozen=True)
class TriageReduction:
    extracted: ExtractedTriage
    decision: TriageTurnDecision
    corrections_applied: tuple[str, ...] = ()


def reduce_triage_turn(
    extracted: ExtractedTriage,
    *,
    user_text: str,
    decision: TriageTurnDecision,
) -> TriageReduction:
    """Return state after only safe, text-backed correction application.

    ``enrich_from_user_text`` already owns deterministic extraction for facts
    such as a pain score.  A model's correction declaration is therefore an
    audit-friendly signal, not permission to overwrite a patient record.
    """
    reduced = enrich_from_user_text(extracted, user_text)
    applied: list[str] = []
    explicit_severity = parse_severity_from_text(user_text)
    if (
        decision.disposition == TriageDisposition.CORRECTION
        and "severity" in decision.corrections
        and explicit_severity is not None
        and reduced.severity == explicit_severity
    ):
        applied.append("severity")
    return TriageReduction(
        extracted=reduced,
        decision=decision,
        corrections_applied=tuple(applied),
    )
