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
    ConversationStage.SAFETY_SCREEN: {
        ConversationStage.SAFETY_SCREEN, ConversationStage.TRIAGE_SUMMARY,
        ConversationStage.SPECIALIST_REVIEW, ConversationStage.MEDICAL_ESCALATION,
        ConversationStage.EMERGENCY_ESCALATION,
    },
    ConversationStage.TRIAGE_SUMMARY: {
        ConversationStage.TRIAGE_SUMMARY,
        ConversationStage.SAFETY_SCREEN,
        ConversationStage.POLICY_REVIEW,
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
    ConversationStage.POLICY_ACCEPTANCE: {ConversationStage.POLICY_ACCEPTANCE, ConversationStage.SPECIALIST_MATCHING},
    ConversationStage.SPECIALIST_MATCHING: {ConversationStage.SPECIALIST_MATCHING, ConversationStage.SLOT_SELECTION},
    # A rejected RH hold can safely return to provider selection; this is a
    # recovery transition, not a booking confirmation or clinical shortcut.
    ConversationStage.SLOT_SELECTION: {
        ConversationStage.SLOT_SELECTION,
        ConversationStage.SPECIALIST_MATCHING,
        ConversationStage.AWAITING_PAYMENT,
    },
    ConversationStage.AWAITING_PAYMENT: {ConversationStage.AWAITING_PAYMENT, ConversationStage.BOOKING_CONFIRMED},
    ConversationStage.BOOKING_CONFIRMED: {ConversationStage.BOOKING_CONFIRMED},
    ConversationStage.SPECIALIST_REVIEW: {ConversationStage.AWAITING_SPECIALIST_REVIEW},
    ConversationStage.AWAITING_SPECIALIST_REVIEW: {ConversationStage.REVIEW_OUTCOME_PENDING},
    ConversationStage.REVIEW_OUTCOME_PENDING: {ConversationStage.REVIEW_OUTCOME_PENDING},
    ConversationStage.MEDICAL_ESCALATION: {ConversationStage.MEDICAL_ESCALATION},
    ConversationStage.EMERGENCY_ESCALATION: {ConversationStage.EMERGENCY_ESCALATION},
}


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
