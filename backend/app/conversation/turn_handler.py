import re

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.conversation.language import mirror_language
from app.conversation.orchestrator import decide_phase, has_narrative
from app.conversation.state_manager import ConversationState, load, save_turn
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.identity.unknown_sender import begin_unknown
from app.llm.gemini_client import LLMClient
from app.llm.prompt_builder import build
from app.matching.specialty_match import NotReadyError, match_physios
from app.models.conversation import Conversation
from app.models.triage_session import TriageSession
from app.models.types import (
    AuditKind,
    ExtractedTriage,
    Identity,
    PatientPhase,
    Persona,
    SafetyResult,
    TurnResult,
)
from app.safety.escalation import patient_message
from app.safety.evaluator import evaluate
from app.triage.extraction import infer_condition_area, merge_extraction
from app.triage.question_batching import grouped_followup, missing_fields
from app.triage.summary import plain_summary

_CONFIRM_RE = re.compile(r"\b(yes|yeah|yep|correct)\b", re.IGNORECASE)

_MATCHING_NEXT_SLICE = (
    "Thanks for confirming. Matching you with a specialist physio is the next slice. "
    "I will share options when that is ready."
)


def _is_summary_confirm(user_text: str) -> bool:
    return bool(_CONFIRM_RE.search(user_text))


def _history(state: ConversationState) -> list[dict[str, str]]:
    return [{"role": message.role, "text": message.text} for message in state.recent_messages]


def _apply_inferred_area(extracted: ExtractedTriage) -> ExtractedTriage:
    if extracted.condition_area is not None:
        return extracted
    area = infer_condition_area(extracted)
    if area is None:
        return extracted
    return extracted.model_copy(update={"condition_area": area})


def _set_triage_status(session: Session, state: ConversationState, status: str) -> None:
    if state.triage_session_id is None:
        return
    triage = session.get(TriageSession, state.triage_session_id)
    if triage is not None:
        triage.status = status


def _store_summary(session: Session, state: ConversationState, text: str) -> None:
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is not None:
        conversation.summary_text = text
    state.summary_text = text


def _audit_identity(session: Session, phone: str) -> None:
    append(
        session,
        kind=AuditKind.IDENTITY,
        actor_phone=phone,
        person_id=None,
        payload={"resolved": False},
    )


def _audit_turn(
    session: Session,
    identity: Identity,
    extracted: ExtractedTriage,
    safety: SafetyResult,
    phase: PatientPhase,
) -> None:
    append(
        session,
        kind=AuditKind.TRIAGE,
        actor_phone=identity.phone_e164,
        person_id=identity.person_id,
        payload={
            "phase": phase.value,
            "extracted": extracted.model_dump(mode="json"),
        },
    )
    append(
        session,
        kind=AuditKind.SAFETY,
        actor_phone=identity.phone_e164,
        person_id=identity.person_id,
        payload={**safety.model_dump(), "notify_family": True},
    )


def _reply_after_extract(
    session: Session,
    state: ConversationState,
    user_text: str,
    candidate_reply: str,
    extracted: ExtractedTriage,
    incoming_phase: PatientPhase,
) -> tuple[str, PatientPhase]:
    if not has_narrative(extracted) or incoming_phase == PatientPhase.FIRST_CONTACT:
        return candidate_reply, PatientPhase.FIRST_CONTACT

    leftover = missing_fields(extracted)
    if leftover:
        followup = grouped_followup(leftover)
        return followup or candidate_reply, PatientPhase.MID_TRIAGE

    if incoming_phase == PatientPhase.POST_TRIAGE and _is_summary_confirm(user_text):
        try:
            match_physios(session, extracted)
        except NotReadyError:
            return _MATCHING_NEXT_SLICE, PatientPhase.POST_TRIAGE
        return _MATCHING_NEXT_SLICE, PatientPhase.POST_TRIAGE

    summary = plain_summary(extracted)
    _store_summary(session, state, summary)
    return summary, PatientPhase.POST_TRIAGE


def handle_turn(session: Session, phone: str, user_text: str, llm: LLMClient) -> TurnResult:
    identity = resolve(session, phone)
    if identity is None:
        text = begin_unknown(session, phone)
        _audit_identity(session, phone)
        return TurnResult(
            reply_text=text,
            language=mirror_language(user_text, None),
            phase=PatientPhase.FIRST_CONTACT,
        )

    if identity.persona == Persona.PATIENT:
        authorize(identity, "triage")

    state = load(session, identity)
    phase = decide_phase(state)
    language = mirror_language(user_text, state.last_known_language)
    prompt = build(identity, phase, state.extracted, language, _history(state), "")
    response = llm.complete(prompt, user_text)
    language = response.language or language

    extracted = _apply_inferred_area(merge_extraction(state.extracted, response.extraction_json))
    safety = evaluate(extracted)

    if safety.fired:
        reply = patient_message(safety)
        _set_triage_status(session, state, "escalated")
        _audit_turn(session, identity, extracted, safety, phase)
        save_turn(session, state, user_text, reply, extracted, phase, language)
        return TurnResult(
            reply_text=reply,
            language=language,
            phase=phase,
            extracted=extracted,
            safety=safety,
            blocked_by_safety=True,
        )

    reply, outgoing = _reply_after_extract(
        session, state, user_text, response.reply_text, extracted, phase
    )
    _audit_turn(session, identity, extracted, safety, outgoing)
    save_turn(session, state, user_text, reply, extracted, outgoing, language)
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=outgoing,
        extracted=extracted,
        safety=safety,
        blocked_by_safety=False,
    )
