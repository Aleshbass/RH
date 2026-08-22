from app.models.types import ExtractedTriage, SafetyResult
from app.safety.red_flag_rules import RULES


def evaluate(extracted: ExtractedTriage) -> SafetyResult:
    flags = extracted.flags
    fired = [rule for rule in RULES if rule.matches(flags)]
    if not fired:
        return SafetyResult(
            fired=False,
            rule_ids=[],
            reason_plain_language="",
            action="continue",
        )
    return SafetyResult(
        fired=True,
        rule_ids=[rule.id for rule in fired],
        reason_plain_language=" ".join(rule.reason_plain_language for rule in fired),
        action="escalate_doctor",
    )
