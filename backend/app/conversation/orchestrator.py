from app.conversation.state_manager import ConversationState
from app.models.types import ExtractedTriage, PatientPhase
from app.triage.msk import is_msk_narrative
from app.triage.non_msk import infer_non_msk_area
from app.triage.question_batching import missing_fields


def has_narrative(extracted: ExtractedTriage) -> bool:
    if extracted.body_location and extracted.body_location.strip():
        return True
    if infer_non_msk_area(extracted) is not None:
        return True
    return is_msk_narrative(extracted)


def decide_phase(state: ConversationState) -> PatientPhase:
    if not has_narrative(state.extracted):
        return PatientPhase.FIRST_CONTACT
    if missing_fields(state.extracted):
        return PatientPhase.MID_TRIAGE
    if state.summary_text:
        return PatientPhase.POST_TRIAGE
    return PatientPhase.MID_TRIAGE
