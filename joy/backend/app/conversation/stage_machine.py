"""Validated, backend-owned transitions for the patient journey."""

from app.models.types import ConversationStage, PatientPhase


_ALLOWED: dict[ConversationStage, set[ConversationStage]] = {
    ConversationStage.STORY_CAPTURE: {
        ConversationStage.STORY_CAPTURE, ConversationStage.SAFETY_INTRODUCTION,
        # V1 confirms the extracted story before presenting the one grouped
        # safety screen, while still evaluating deterministic safety every turn.
        ConversationStage.SAFETY_SCREEN, ConversationStage.TRIAGE_SUMMARY,
        ConversationStage.MEDICAL_ESCALATION, ConversationStage.EMERGENCY_ESCALATION,
    },
    ConversationStage.SAFETY_INTRODUCTION: {ConversationStage.SAFETY_SCREEN, ConversationStage.EMERGENCY_ESCALATION},
    # A clear safety screen ("No to all") presents the booking policy in the same turn, so the
    # policy, booking and payment stages follow it directly (V1 has no separate summary turn
    # after the screen). Refusing these crashed every turn after the safety questions (Nov 2026).
    ConversationStage.SAFETY_SCREEN: {
        ConversationStage.SAFETY_SCREEN, ConversationStage.TRIAGE_SUMMARY,
        ConversationStage.SPECIALIST_REVIEW, ConversationStage.MEDICAL_ESCALATION,
        ConversationStage.EMERGENCY_ESCALATION,
        ConversationStage.POLICY_REVIEW, ConversationStage.POLICY_ACCEPTANCE,
        ConversationStage.SPECIALIST_MATCHING, ConversationStage.SLOT_SELECTION,
        ConversationStage.AWAITING_PAYMENT,
    },
    ConversationStage.TRIAGE_SUMMARY: {
        ConversationStage.TRIAGE_SUMMARY,
        ConversationStage.SAFETY_SCREEN,
        ConversationStage.POLICY_REVIEW,
        ConversationStage.POLICY_ACCEPTANCE,
        ConversationStage.SPECIALIST_MATCHING,
        ConversationStage.AWAITING_PAYMENT,
    },
    # Policy acceptance is verified deterministically in the same turn that
    # may fetch matching options.  Permit that atomic transition instead of
    # crashing the WhatsApp worker after a valid “I accept”.
    ConversationStage.POLICY_REVIEW: {
        ConversationStage.POLICY_REVIEW,
        ConversationStage.POLICY_ACCEPTANCE,
        ConversationStage.SPECIALIST_MATCHING,
        # Quick/full virtual consultations create the fixed-price booking in
        # the same verified policy-acceptance turn, then immediately collect
        # the receipt email. This is a valid atomic transition, not a bypass.
        ConversationStage.AWAITING_PAYMENT,
    },
    ConversationStage.POLICY_ACCEPTANCE: {
        ConversationStage.POLICY_ACCEPTANCE,
        ConversationStage.SPECIALIST_MATCHING,
        ConversationStage.AWAITING_PAYMENT,
    },
    # Nobody free when the patient chose ("When are you free?"): the care team takes over, which
    # parks the conversation at the summary. A hand-over to a person, not a clinical shortcut.
    ConversationStage.SPECIALIST_MATCHING: {
        ConversationStage.SPECIALIST_MATCHING, ConversationStage.SLOT_SELECTION, ConversationStage.TRIAGE_SUMMARY,
    },
    # A rejected RH hold can safely return to provider selection; this is a
    # recovery transition, not a booking confirmation or clinical shortcut.
    ConversationStage.SLOT_SELECTION: {
        ConversationStage.SLOT_SELECTION,
        ConversationStage.SPECIALIST_MATCHING,
        ConversationStage.AWAITING_PAYMENT,
        # "Cancel booking" then nobody free on the new day: the care team takes over
        ConversationStage.TRIAGE_SUMMARY,
    },
    # A patient whose answers turn AMBER while a payment link is open is moved to the
    # specialist review (and its policy) instead of crashing the turn.
    ConversationStage.AWAITING_PAYMENT: {
        ConversationStage.AWAITING_PAYMENT,
        ConversationStage.BOOKING_CONFIRMED,
        ConversationStage.SPECIALIST_REVIEW,
        ConversationStage.POLICY_REVIEW,
    },
    ConversationStage.BOOKING_CONFIRMED: {ConversationStage.BOOKING_CONFIRMED},
    # A patient who chooses the specialist-review route must review the
    # booking policy before we collect a receipt email or initialise payment.
    ConversationStage.SPECIALIST_REVIEW: {
        ConversationStage.POLICY_REVIEW,
        ConversationStage.AWAITING_SPECIALIST_REVIEW,
    },
    ConversationStage.AWAITING_SPECIALIST_REVIEW: {ConversationStage.REVIEW_OUTCOME_PENDING},
    ConversationStage.REVIEW_OUTCOME_PENDING: {ConversationStage.REVIEW_OUTCOME_PENDING},
    ConversationStage.MEDICAL_ESCALATION: {ConversationStage.MEDICAL_ESCALATION},
    ConversationStage.EMERGENCY_ESCALATION: {ConversationStage.EMERGENCY_ESCALATION},
}


# Safety escalation must be reachable from every stage: a red flag reported
# mid-booking or mid-payment cannot be refused by the conversation machine.
# RED (emergency) also supersedes an earlier ORANGE (medical) escalation.
for _stage, _targets in _ALLOWED.items():
    if _stage is not ConversationStage.EMERGENCY_ESCALATION:
        _targets.add(ConversationStage.EMERGENCY_ESCALATION)
    if _stage not in {ConversationStage.EMERGENCY_ESCALATION, ConversationStage.MEDICAL_ESCALATION}:
        _targets.add(ConversationStage.MEDICAL_ESCALATION)


def assert_transition(current: ConversationStage, target: ConversationStage) -> ConversationStage:
    if target not in _ALLOWED[current]:
        raise ValueError(f"unauthorised conversation stage transition: {current} -> {target}")
    return target


def stage_for_legacy_phase(phase: PatientPhase) -> ConversationStage:
    return {
        PatientPhase.FIRST_CONTACT: ConversationStage.STORY_CAPTURE,
        PatientPhase.MID_TRIAGE: ConversationStage.SAFETY_SCREEN,
        PatientPhase.POST_TRIAGE: ConversationStage.TRIAGE_SUMMARY,
    }[phase]
