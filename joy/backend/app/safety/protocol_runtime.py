"""Pure deterministic runtime for the versioned clinical safety protocol.

This module intentionally has no LLM dependency.  It validates the published
JSON, chooses the region from already-extracted facts, and schedules only the
questions that the protocol itself permits.
"""

from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from app.safety.clinical_engine import engine_version, infer_body_region, load_engine

YES = "YES"
NO = "NO"
UNCLEAR = "UNCLEAR"
UNANSWERED = "UNANSWERED"
_RANK = {"GREEN": 0, "AMBER": 1, "ORANGE": 2, "RED": 3}


@dataclass(frozen=True)
class ScheduledQuestion:
    id: str
    rule_id: str
    text: str
    order: int


def validate_protocol(engine: dict[str, Any]) -> None:
    meta = engine.get("engine")
    if not isinstance(meta, dict) or not meta.get("version"):
        raise ValueError("clinical safety protocol requires engine.version")
    seen: set[str] = set()
    groups = [engine.get("general_rules") or []]
    groups.extend((region.get("rules") or []) for region in (engine.get("regions") or {}).values())
    for rules in groups:
        for rule in rules:
            if not rule.get("rule_id") or not isinstance(rule.get("logic"), dict):
                raise ValueError("every clinical safety rule requires rule_id and logic")
            for question in [*(rule.get("questions") or []), *(rule.get("follow_up_if_yes") or [])]:
                question_id, text = question.get("id"), question.get("text")
                if not question_id or not text:
                    raise ValueError(f"rule {rule['rule_id']} has an incomplete question")
                if question_id in seen:
                    raise ValueError(f"duplicate clinical safety question id: {question_id}")
                seen.add(question_id)


def validate_active_protocol() -> None:
    validate_protocol(load_engine())


def select_region(extracted: Any) -> str | None:
    """Choose only a known protocol region; return None for a controlled clarification."""
    supplied = getattr(extracted, "body_region", None) or getattr(extracted, "safety_region", None)
    regions = (load_engine().get("regions") or {})
    if supplied in regions:
        return supplied
    source = " ".join(filter(None, [
        getattr(extracted, "body_location", None), getattr(extracted, "main_complaint", None),
    ]))
    if not source:
        return None
    selected = infer_body_region(source)
    return selected if selected in regions else None


def normalize_answer(text: str | None) -> str:
    """Exact affirmative/negative handling. Complex language is never guessed as NO."""
    value = (text or "").strip().casefold().strip(". !?")
    if value in {"yes", "y", "yeah", "yep", "true", "correct", "oui"}:
        return YES
    # These compact WhatsApp replies are unambiguous when answering the
    # current grouped safety screen; they are not free-form clinical inference.
    if value in {"no", "n", "nope", "false", "none", "no, none", "no none", "no to all"}:
        return NO
    # Patients naturally use fuller negative phrases in WhatsApp. Accept only
    # clearly universal negatives; ambiguous clinical prose must still be
    # clarified rather than guessed as safe.
    compact = re.sub(r"[,.!;:\\-_/]+", " ", value)
    compact = re.sub(r"\s+", " ", compact).strip()
    if compact in {
        "no none at all", "no not at all", "no nothing", "none at all",
        "none of those", "no to any", "no to all of them", "not at all",
    }:
        return NO
    return UNANSWERED if not value else UNCLEAR


def _rules(region: str | None) -> list[dict[str, Any]]:
    engine = load_engine()
    rules = list(engine.get("general_rules") or [])
    if region:
        rules.extend(((engine.get("regions") or {}).get(region) or {}).get("rules") or [])
    return sorted(rules, key=lambda rule: (-int(rule.get("priority") or 0), str(rule.get("rule_id"))))


def schedule_questions(extracted: Any, *, limit: int = 4) -> list[ScheduledQuestion]:
    """Return the next backend-selected questions, preserving protocol order."""
    answers = dict(getattr(extracted, "safety_answers", None) or {})
    scheduled: list[ScheduledQuestion] = []
    order = len(getattr(extracted, "safety_question_order", None) or [])
    for rule in _rules(select_region(extracted)):
        questions = list(rule.get("questions") or [])
        primary_answers = [answers.get(q.get("id"), UNANSWERED) for q in questions]
        if any(answer not in {YES, NO, UNCLEAR} for answer in primary_answers):
            for question in questions:
                if answers.get(question.get("id"), UNANSWERED) == UNANSWERED:
                    scheduled.append(ScheduledQuestion(question["id"], rule["rule_id"], question["text"], order))
                    order += 1
                    if len(scheduled) >= limit:
                        return scheduled
            continue
        if YES in primary_answers:
            for question in rule.get("follow_up_if_yes") or []:
                if answers.get(question.get("id"), UNANSWERED) == UNANSWERED:
                    scheduled.append(ScheduledQuestion(question["id"], rule["rule_id"], question["text"], order))
                    order += 1
                    if len(scheduled) >= limit:
                        return scheduled
    return scheduled


def evaluate_protocol(extracted: Any) -> dict[str, Any]:
    """Evaluate known answers only; unanswered questions keep the screen incomplete."""
    answers = dict(getattr(extracted, "safety_answers", None) or {})
    level, rule_ids = "GREEN", []
    for rule in _rules(select_region(extracted)):
        questions = list(rule.get("questions") or [])
        values = [answers.get(question.get("id"), UNANSWERED) for question in questions]
        if UNANSWERED in values:
            continue
        logic = rule.get("logic") or {}
        outcome = None
        if UNCLEAR in values:
            outcome = logic.get("unclear")
        elif logic.get("yes_to_any") and YES in values:
            outcome = logic["yes_to_any"]
        elif logic.get("no_to_all") and all(value == NO for value in values):
            outcome = logic["no_to_all"]
        elif len(values) == 1:
            outcome = logic.get(values[0].lower())
        if outcome in _RANK and _RANK[outcome] >= _RANK[level]:
            level = outcome
            rule_ids.append(rule["rule_id"])
    action = {"GREEN": "continue", "AMBER": "specialist_review", "ORANGE": "medical_review", "RED": "escalate_doctor"}[level]
    return {
        "protocol_version": engine_version(), "region": select_region(extracted),
        "risk_level": level, "action": action, "rule_ids": list(dict.fromkeys(rule_ids)),
        "answers": answers, "question_ids": list(getattr(extracted, "safety_question_order", None) or []),
        "complete": not schedule_questions(extracted, limit=1),
    }
