import json
import re

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.booking.booking_flow import AWAITING_PAYMENT, handle_booking_turn
from app.conversation.language import mirror_language
from app.conversation.orchestrator import decide_booking_substate, decide_phase, has_narrative
from app.conversation.state_manager import ConversationState, load, save_turn
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.identity.unknown_sender import (
    begin_unknown,
    maybe_provision_patient,
    maybe_provision_physio,
)
from app.llm.gemini_client import LLMClient
from app.llm.prompt_builder import build
from app.llm.rag.retriever import retrieve
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
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
from app.physio.availability import apply_availability_turn
from app.physio.booking_alerts import apply_physio_reply
from app.physio.home_visit_checkin import apply_checkin_turn
from app.physio.onboarding import apply_onboarding_turn
from app.physio.payouts import apply_payout_turn
from app.physio.session_notes import apply_note_turn
from app.triage.extraction import infer_condition_area, merge_extraction
from app.triage.question_batching import grouped_followup, missing_fields
from app.triage.summary import plain_summary

_YES_RE = re.compile(r"\b(yes|yeah|yep)\b", re.IGNORECASE)
_CORRECT_RE = re.compile(r"\bcorrect\b", re.IGNORECASE)
_NEGATED_CORRECT_RE = re.compile(
    r"\b(?:not|no|never)\b.{0,40}\bcorrect\b|\bcorrect\b.{0,20}\b(?:not|no)\b",
    re.IGNORECASE,
)

_LATER_PATH = (
    "This WhatsApp path is for later — I will be able to help you here in a later slice."
)
_MID_ACK = "Thanks, I've got that."
_DASHBOARD_RE = re.compile(
    r"(?i)(?:\b(?:update|edit|change|set)\b.{0,40}\b"
    r"(?:bio|photo|pricing|price list|rates|credentials)\b"
    r"|\b(?:my bio|my pricing|my rates|profile photo|price list|my credentials)\b)"
)
_DASHBOARD_REPLY = (
    "That lives on the web dashboard, not WhatsApp. I can't edit bio, photo, pricing, or credentials here."
)


def _is_summary_confirm(user_text: str) -> bool:
    if _YES_RE.search(user_text):
        return True
    if _CORRECT_RE.search(user_text) and not _NEGATED_CORRECT_RE.search(user_text):
        return True
    return False


def _history(state: ConversationState) -> list[dict[str, str]]:
    return [{"role": message.role, "text": message.text} for message in state.recent_messages]


def _user_history(state: ConversationState) -> list[dict[str, str]]:
    return [
        {"role": message.role, "text": message.text}
        for message in state.recent_messages
        if message.role == "user"
    ]


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


def _is_escalated(session: Session, state: ConversationState) -> bool:
    if state.triage_session_id is None:
        return False
    triage = session.get(TriageSession, state.triage_session_id)
    return triage is not None and triage.status == "escalated"


def _resend_safety_block(
    session: Session,
    identity: Identity,
    state: ConversationState,
    user_text: str,
    phase: PatientPhase,
    language: str,
    wa_message_id: str | None = None,
) -> TurnResult:
    safety = evaluate(state.extracted)
    reply = patient_message(safety)
    _audit_turn(session, identity, state.extracted, safety, phase)
    save_turn(
        session, state, user_text, reply, state.extracted, phase, language, wa_message_id
    )
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=phase,
        extracted=state.extracted,
        safety=safety,
        blocked_by_safety=True,
    )


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
        payload={**safety.model_dump(), "notify_family": False},
    )


def _reply_after_extract(
    session: Session,
    state: ConversationState,
    user_text: str,
    candidate_reply: str,
    extracted: ExtractedTriage,
    incoming_phase: PatientPhase,
    identity: Identity,
    paystack=None,
) -> tuple[str, PatientPhase]:
    if not has_narrative(extracted) or incoming_phase == PatientPhase.FIRST_CONTACT:
        return candidate_reply, PatientPhase.FIRST_CONTACT

    leftover = missing_fields(extracted)
    booking_sub = decide_booking_substate(state)
    if leftover and not booking_sub:
        followup = grouped_followup(leftover)
        if not followup:
            return _MID_ACK, PatientPhase.MID_TRIAGE
        return f"{_MID_ACK} {followup}", PatientPhase.MID_TRIAGE

    patient = session.get(Patient, identity.person_id)
    if patient is not None:
        booking_reply = handle_booking_turn(
            session,
            state,
            patient,
            extracted,
            user_text,
            paystack=paystack,
            summary_confirmed=(
                incoming_phase == PatientPhase.POST_TRIAGE and _is_summary_confirm(user_text)
            ),
        )
        if booking_reply is not None:
            return booking_reply, PatientPhase.POST_TRIAGE

    if booking_sub == AWAITING_PAYMENT:
        return candidate_reply, PatientPhase.POST_TRIAGE

    summary = plain_summary(extracted)
    _store_summary(session, state, summary)
    _set_triage_status(session, state, "summarised")
    return summary, PatientPhase.POST_TRIAGE


def _physio_turn(
    session: Session,
    identity: Identity,
    user_text: str,
    media: list[str] | None,
    wa_message_id: str | None,
    llm: LLMClient,
    paystack=None,
    location: tuple[float, float] | None = None,
) -> TurnResult:
    physio = session.get(Physiotherapist, identity.person_id)
    language = mirror_language(user_text, None)
    if physio is None:
        return TurnResult(
            reply_text=_LATER_PATH,
            language=language,
            phase=PatientPhase.FIRST_CONTACT,
        )
    state = load(session, identity)
    conversation = session.get(Conversation, state.conversation_id)
    reply = apply_physio_reply(session, physio.id, user_text, conversation)
    if reply is None and authorize(identity, "physio_payout"):
        reply = apply_payout_turn(session, physio.id, user_text, paystack=paystack)
    if reply is None:
        reply = apply_checkin_turn(session, physio.id, user_text, location=location)
    if reply is None:
        reply = apply_note_turn(session, physio.id, user_text, llm)
    if (
        reply is None
        and physio.onboarding_status != "collecting"
        and _DASHBOARD_RE.search(user_text or "")
    ):
        reply = _DASHBOARD_REPLY
    if reply is None and conversation is not None:
        reply = apply_availability_turn(session, physio.id, user_text, conversation)
    if reply is None:
        reply = apply_onboarding_turn(session, physio, user_text, media)
    save_turn(
        session,
        state,
        user_text,
        reply,
        ExtractedTriage(),
        PatientPhase.FIRST_CONTACT,
        language,
        wa_message_id,
    )
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=PatientPhase.FIRST_CONTACT,
    )


def handle_turn(
    session: Session,
    phone: str,
    user_text: str,
    llm: LLMClient,
    wa_message_id: str | None = None,
    *,
    paystack=None,
    media: list[str] | None = None,
    location: tuple[float, float] | None = None,
) -> TurnResult:
    identity = resolve(session, phone)
    if identity is None:
        identity = maybe_provision_patient(session, phone, user_text)
    if identity is None:
        identity = maybe_provision_physio(session, phone, user_text)
    if identity is None:
        text = begin_unknown(session, phone)
        _audit_identity(session, phone)
        return TurnResult(
            reply_text=text,
            language=mirror_language(user_text, None),
            phase=PatientPhase.FIRST_CONTACT,
        )

    if identity.persona == Persona.PHYSIO:
        if not authorize(identity, "physio_onboard"):
            return TurnResult(
                reply_text=_LATER_PATH,
                language=mirror_language(user_text, None),
                phase=PatientPhase.FIRST_CONTACT,
            )
        return _physio_turn(
            session,
            identity,
            user_text,
            media,
            wa_message_id,
            llm,
            paystack=paystack,
            location=location,
        )

    if not authorize(identity, "triage"):
        return TurnResult(
            reply_text=_LATER_PATH,
            language=mirror_language(user_text, None),
            phase=PatientPhase.FIRST_CONTACT,
        )

    state = load(session, identity)
    phase = decide_phase(state)
    language = mirror_language(user_text, state.last_known_language)
    if _is_escalated(session, state):
        return _resend_safety_block(
            session, identity, state, user_text, phase, language, wa_message_id
        )

    extra_context = ""
    if state.known_facts:
        extra_context = f"KNOWN_FACTS:\n{json.dumps(state.known_facts, ensure_ascii=False)}"
    extract_prompt = build(
        identity, phase, state.extracted, language, _user_history(state), "", extra_context
    )
    response = llm.complete(extract_prompt, user_text)
    language = response.language or language

    extracted = _apply_inferred_area(merge_extraction(state.extracted, response.extraction_json))
    safety = evaluate(extracted)

    if safety.fired:
        reply = patient_message(safety)
        _set_triage_status(session, state, "escalated")
        _audit_turn(session, identity, extracted, safety, phase)
        save_turn(session, state, user_text, reply, extracted, phase, language, wa_message_id)
        return TurnResult(
            reply_text=reply,
            language=language,
            phase=phase,
            extracted=extracted,
            safety=safety,
            blocked_by_safety=True,
        )

    candidate_reply = response.reply_text
    if extracted.condition_area is not None:
        rag_snippet = retrieve(extracted.condition_area)
        if rag_snippet:
            reply_prompt = build(
                identity, phase, extracted, language, _history(state), rag_snippet, extra_context
            )
            reply_response = llm.complete(reply_prompt, user_text)
            candidate_reply = reply_response.reply_text
            language = reply_response.language or language

    reply, outgoing = _reply_after_extract(
        session,
        state,
        user_text,
        candidate_reply,
        extracted,
        phase,
        identity,
        paystack=paystack,
    )
    _audit_turn(session, identity, extracted, safety, outgoing)
    save_turn(session, state, user_text, reply, extracted, outgoing, language, wa_message_id)
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=outgoing,
        extracted=extracted,
        safety=safety,
        blocked_by_safety=False,
    )
