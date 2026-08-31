from app.models.types import ExtractedTriage, SafetyResult
from app.safety.clinical_engine import evaluate_flags
from app.safety.red_flag_rules import RULES


def evaluate(extracted: ExtractedTriage) -> SafetyResult:
    """Deterministic safety — clinical engine levels + legacy red-flag reasons."""
    mapped = evaluate_flags(extracted.flags or {})
    # Preserve legacy rule ids for audit/openers when flags match classic RULES.
    legacy = [rule for rule in RULES if rule.matches(extracted.flags or {})]
    legacy_ids = [rule.id for rule in legacy]
    legacy_reasons = [rule.reason_plain_language for rule in legacy]

    rule_ids = list(dict.fromkeys([*(mapped["rule_ids"] or []), *legacy_ids]))
    reasons = list(dict.fromkeys([*(mapped["reasons"] or []), *legacy_reasons]))
    risk_level = mapped["risk_level"]
    action = mapped["action"]
    fired = bool(mapped["fired"])

    # If only legacy rules fire without flag map (shouldn't happen), escalate.
    if legacy and not mapped["rule_ids"] and not mapped["fired"]:
        risk_level = "RED"
        action = "escalate_doctor"
        fired = True
        reasons = legacy_reasons
        rule_ids = legacy_ids

    return SafetyResult(
        fired=fired,
        risk_level=risk_level,
        rule_ids=rule_ids,
        reason_plain_language=" ".join(reasons),
        action=action,
    )
