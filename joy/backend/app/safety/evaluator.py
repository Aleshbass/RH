from app.models.types import ExtractedTriage, SafetyResult
from app.safety.clinical_engine import evaluate_flags
from app.safety.protocol_runtime import evaluate_protocol
from app.safety.red_flag_rules import RULES


def evaluate(extracted: ExtractedTriage) -> SafetyResult:
    """Deterministic safety — clinical engine levels + legacy red-flag reasons."""
    mapped = evaluate_flags(extracted.flags or {})
    protocol = evaluate_protocol(extracted)
    # Preserve legacy rule ids for audit/openers when flags match classic RULES.
    legacy = [rule for rule in RULES if rule.matches(extracted.flags or {})]
    legacy_ids = [rule.id for rule in legacy]
    legacy_reasons = [rule.reason_plain_language for rule in legacy]

    rule_ids = list(dict.fromkeys([*(mapped["rule_ids"] or []), *legacy_ids]))
    reasons = list(dict.fromkeys([*(mapped["reasons"] or []), *legacy_reasons]))
    risk_level = mapped["risk_level"]
    action = mapped["action"]
    fired = bool(mapped["fired"])

    if {"GREEN": 0, "AMBER": 1, "ORANGE": 2, "RED": 3}[protocol["risk_level"]] > {"GREEN": 0, "AMBER": 1, "ORANGE": 2, "RED": 3}[risk_level]:
        risk_level = protocol["risk_level"]
        action = protocol["action"]
        rule_ids = list(dict.fromkeys([*rule_ids, *protocol["rule_ids"]]))
        fired = risk_level in {"ORANGE", "RED"}
        if not reasons:
            reasons = [
                "Your answers need the safety route selected by Rehabify's clinical protocol."
            ]

    # If only legacy rules fire without flag map (shouldn't happen), escalate.
    if legacy and not mapped["rule_ids"] and not mapped["fired"]:
        risk_level = "RED"
        action = "escalate_doctor"
        fired = True
        reasons = legacy_reasons
        rule_ids = legacy_ids

    if protocol["rule_ids"] and not reasons:
        reasons = ["Your answers need the safety route selected by Rehabify's clinical protocol."]

    return SafetyResult(
        fired=fired,
        risk_level=risk_level,
        rule_ids=rule_ids,
        reason_plain_language=" ".join(reasons),
        action=action,
        protocol_version=protocol["protocol_version"],
        question_ids=protocol["question_ids"],
        answers=protocol["answers"],
    )
