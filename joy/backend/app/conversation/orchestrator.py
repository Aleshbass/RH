from app.conversation.state_manager import ConversationState
from app.models.types import ExtractedTriage, PatientPhase
from app.triage.msk import is_msk_narrative
from app.triage.non_msk import infer_non_msk_area
from app.triage.question_batching import missing_fields

OFFERING_MATCHES = "offering_matches"
AWAITING_SLOT_MODE = "awaiting_slot_mode"
AWAITING_PAYMENT = "awaiting_payment"
# RH-backed booking uses the same conversation record, but its substates were
# added after this router.  Omitting them lets a receipt email fall back into
# triage before ``handle_booking_turn`` can initialize payment.
BOOKING_SUBSTATES = (
    OFFERING_MATCHES,
    AWAITING_SLOT_MODE,
    AWAITING_PAYMENT,
    "rh_awaiting_service_mode",
    "rh_awaiting_location",
    "rh_awaiting_provider",
    "rh_awaiting_slot",
    "rh_awaiting_payment_email",
    "rh_awaiting_payment",
    "rh_awaiting_replacement",
    "awaiting_treatment_option",
    "awaiting_policy_acceptance",
    "awaiting_initial_consultation_confirmation",
    "rh_awaiting_reschedule",
)


def has_narrative(extracted: ExtractedTriage) -> bool:
    if extracted.body_location and extracted.body_location.strip():
        return True
    if infer_non_msk_area(extracted) is not None:
        return True
    return is_msk_narrative(extracted)


def decide_booking_substate(state: ConversationState) -> str | None:
    sub = state.booking_substate
    if sub in BOOKING_SUBSTATES:
        return sub
    return None


def decide_phase(state: ConversationState) -> PatientPhase:
    if not has_narrative(state.extracted):
        return PatientPhase.FIRST_CONTACT
    if decide_booking_substate(state):
        return PatientPhase.POST_TRIAGE
    if missing_fields(state.extracted):
        return PatientPhase.MID_TRIAGE
    if state.summary_text:
        return PatientPhase.POST_TRIAGE
    return PatientPhase.MID_TRIAGE
