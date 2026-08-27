import json
import re

from sqlalchemy.orm import Session

from app.admin.escalation_router import (
    detect_off_platform,
    flags_from_triage_text,
    route_escalation,
    route_safety,
    takeover_notice,
)
from app.admin.verification_queue import apply_admin_turn
from app.audit.logger import append
from app.booking.booking_flow import AWAITING_PAYMENT, handle_booking_turn
from app.conversation.language import mirror_language
from app.conversation.orchestrator import decide_booking_substate, decide_phase, has_narrative
from app.conversation.state_manager import ConversationState, load, save_turn
from app.family.access import apply_family_turn
from app.family.relay import apply_pending_physio_answer, ask_physio, is_relay_ask
from app.partner.referral import apply_inbound_code, apply_partner_turn, maybe_provision_from_referral
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.identity.unknown_sender import resolve_unknown_sender
from app.llm.gemini_client import LLMClient
from app.llm.prompt_builder import build
from app.llm.rag.retriever import retrieve
from app.models.admin import Admin
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
from app.safety.escalation import notify_family_on_safety, patient_message
from app.safety.evaluator import evaluate
from app.physio.availability import apply_availability_turn
from app.physio.booking_alerts import apply_physio_reply
from app.physio.home_visit_checkin import apply_checkin_turn
from app.physio.onboarding import apply_onboarding_turn
from app.physio.payouts import apply_payout_turn
from app.physio.session_notes import apply_note_turn
from app.triage.extraction import enrich_from_user_text, infer_condition_area, merge_extraction
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
    *,
    notify_family: bool = False,
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
        payload={**safety.model_dump(), "notify_family": notify_family},
    )


def _safety_fire_reply(
    session: Session,
    identity: Identity,
    state: ConversationState,
    user_text: str,
    extracted: ExtractedTriage,
    safety: SafetyResult,
    phase: PatientPhase,
    language: str,
    wa_message_id: str | None = None,
) -> TurnResult:
    reply = patient_message(safety)
    notified = notify_family_on_safety(session, identity.person_id, safety)
    _set_triage_status(session, state, "escalated")
    route_safety(session, safety, {"patient_id": str(identity.person_id)})
    _audit_turn(
        session, identity, extracted, safety, phase, notify_family=notified
    )
    save_turn(session, state, user_text, reply, extracted, phase, language, wa_message_id)
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=phase,
        extracted=extracted,
        safety=safety,
        blocked_by_safety=True,
    )


def _maybe_route_off_platform(
    session: Session, user_text: str, *, patient_id=None, physio_id=None
) -> None:
    if detect_off_platform(user_text) is None:
        return
    payload: dict = {"text": user_text}
    if patient_id is not None:
        payload["patient_id"] = str(patient_id)
    if physio_id is not None:
        payload["physio_id"] = str(physio_id)
    route_escalation(session, "off_platform", payload)


def _patient_takeover_turn(
    session: Session,
    identity: Identity,
    state: ConversationState,
    conversation: Conversation,
    user_text: str,
    phase: PatientPhase,
    language: str,
    wa_message_id: str | None = None,
) -> TurnResult:
    flags = flags_from_triage_text(user_text)
    incoming = {"flags": flags} if flags else {}
    extracted = _apply_inferred_area(merge_extraction(state.extracted, incoming))
    safety = evaluate(extracted)
    if safety.fired:
        return _safety_fire_reply(
            session,
            identity,
            state,
            user_text,
            extracted,
            safety,
            phase,
            language,
            wa_message_id,
        )
    reply = takeover_notice(conversation)
    save_turn(
        session, state, user_text, reply, extracted, phase, language, wa_message_id
    )
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=phase,
        extracted=extracted,
        safety=safety,
        blocked_by_safety=False,
    )


def _admin_turn(
    session: Session,
    identity: Identity,
    user_text: str,
    wa_message_id: str | None,
) -> TurnResult:
    language = mirror_language(user_text, None)
    admin = session.get(Admin, identity.person_id)
    if admin is None:
        return TurnResult(
            reply_text=_LATER_PATH,
            language=language,
            phase=PatientPhase.FIRST_CONTACT,
        )
    state = load(session, identity)
    language = mirror_language(user_text, state.last_known_language)
    reply = apply_admin_turn(session, admin, user_text)
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


def _mid_followup_reply(candidate_reply: str, followup: str, incoming_phase: PatientPhase) -> str:
    """Prefer a care-only model sentence on first story dump; never a second open ask."""
    care = (candidate_reply or "").strip()
    if incoming_phase == PatientPhase.FIRST_CONTACT and care and "?" not in care:
        return f"{care} {followup}"
    return f"{_MID_ACK} {followup}"


def _thin_first_contact(extracted: ExtractedTriage) -> bool:
    """Body-part-only mentions still get the open ask; a timed story gets the batch."""
    return not extracted.onset and extracted.severity is None


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
    if not has_narrative(extracted):
        return candidate_reply, PatientPhase.FIRST_CONTACT

    leftover = missing_fields(extracted)
    booking_sub = decide_booking_substate(state)
    if (
        incoming_phase == PatientPhase.FIRST_CONTACT
        and leftover
        and _thin_first_contact(extracted)
    ):
        return candidate_reply, PatientPhase.FIRST_CONTACT

    if leftover and not booking_sub:
        followup = grouped_followup(leftover)
        if not followup:
            return _MID_ACK, PatientPhase.MID_TRIAGE
        # Mined story already in hand: one grouped leftover ask, not another open probe.
        return (
            _mid_followup_reply(candidate_reply, followup, incoming_phase),
            PatientPhase.MID_TRIAGE,
        )

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
    prior_status = physio.onboarding_status
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
        reply = apply_pending_physio_answer(session, physio.id, user_text, conversation)
    if reply is None:
        reply = apply_onboarding_turn(session, physio, user_text, media)
    _maybe_route_off_platform(session, user_text, physio_id=physio.id)
    if prior_status != "submitted" and physio.onboarding_status == "submitted":
        route_escalation(
            session,
            "verification",
            {"physio_id": str(physio.id)},
        )
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


def _linked_patient(session: Session, identity: Identity) -> Patient | None:
    if identity.linked_patient_id is None:
        return None
    return session.get(Patient, identity.linked_patient_id)


def _patient_actor(patient: Patient) -> Identity:
    return Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=patient.phone_e164,
    )


def _family_progress_copy(patient: Patient, patient_state: ConversationState) -> str:
    name = patient.name or "your family member"
    summary = (patient_state.summary_text or "").strip()
    if summary:
        return f"Here's the latest on {name}:\n\n{summary}"
    if has_narrative(patient_state.extracted):
        return f"Here's the latest on {name}:\n\n{plain_summary(patient_state.extracted)}"
    return (
        f"I don't have a triage summary for {name} yet. "
        "I'll share progress here once they have talked with me."
    )


def _family_turn(
    session: Session,
    identity: Identity,
    user_text: str,
    wa_message_id: str | None,
    paystack=None,
) -> TurnResult:
    language = mirror_language(user_text, None)
    patient = _linked_patient(session, identity)
    if patient is None:
        return TurnResult(
            reply_text=_LATER_PATH,
            language=language,
            phase=PatientPhase.FIRST_CONTACT,
        )
    family_state = load(session, identity)
    language = mirror_language(user_text, family_state.last_known_language)
    patient_state = load(session, _patient_actor(patient))
    reply = None
    if is_relay_ask(user_text):
        thread = ask_physio(session, identity.person_id, user_text)
        reply = thread.family_visible_text or ""
    if reply is None and (authorize(identity, "book") or authorize(identity, "pay")):
        leftover = missing_fields(patient_state.extracted)
        book_intent = bool(re.search(r"\bbook\b", user_text, re.I))
        reply = handle_booking_turn(
            session,
            patient_state,
            patient,
            patient_state.extracted,
            user_text,
            paystack=paystack,
            summary_confirmed=book_intent and not leftover,
        )
    if reply is None:
        reply = _family_progress_copy(patient, patient_state)
    phase = decide_phase(patient_state)
    save_turn(
        session,
        family_state,
        user_text,
        reply,
        family_state.extracted,
        phase,
        language,
        wa_message_id,
    )
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=phase,
    )


def _partner_turn(
    session: Session,
    identity: Identity,
    user_text: str,
    wa_message_id: str | None,
) -> TurnResult:
    language = mirror_language(user_text, None)
    state = load(session, identity)
    language = mirror_language(user_text, state.last_known_language)
    reply = apply_partner_turn(session, identity.person_id, user_text)
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
        identity = maybe_provision_from_referral(session, phone, user_text)
    if identity is None:
        decision = resolve_unknown_sender(session, phone, user_text, llm)
        if decision.identity is None:
            _audit_identity(session, phone)
            return TurnResult(
                reply_text=decision.reply_text,
                language=mirror_language(user_text, None),
                phase=PatientPhase.FIRST_CONTACT,
            )
        identity = decision.identity

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

    if identity.persona == Persona.FAMILY:
        if not authorize(identity, "view_progress"):
            return TurnResult(
                reply_text=_LATER_PATH,
                language=mirror_language(user_text, None),
                phase=PatientPhase.FIRST_CONTACT,
            )
        return _family_turn(
            session, identity, user_text, wa_message_id, paystack=paystack
        )

    if identity.persona == Persona.PARTNER:
        if not authorize(identity, "partner_refer"):
            return TurnResult(
                reply_text=_LATER_PATH,
                language=mirror_language(user_text, None),
                phase=PatientPhase.FIRST_CONTACT,
            )
        return _partner_turn(session, identity, user_text, wa_message_id)

    if identity.persona == Persona.ADMIN:
        if not authorize(identity, "admin"):
            return TurnResult(
                reply_text=_LATER_PATH,
                language=mirror_language(user_text, None),
                phase=PatientPhase.FIRST_CONTACT,
            )
        return _admin_turn(session, identity, user_text, wa_message_id)

    if not authorize(identity, "triage"):
        return TurnResult(
            reply_text=_LATER_PATH,
            language=mirror_language(user_text, None),
            phase=PatientPhase.FIRST_CONTACT,
        )

    state = load(session, identity)
    if identity.persona == Persona.PATIENT:
        apply_inbound_code(session, identity.person_id, user_text)
        _maybe_route_off_platform(session, user_text, patient_id=identity.person_id)
    phase = decide_phase(state)
    language = mirror_language(user_text, state.last_known_language)
    if _is_escalated(session, state):
        return _resend_safety_block(
            session, identity, state, user_text, phase, language, wa_message_id
        )

    conversation = session.get(Conversation, state.conversation_id)
    if (
        identity.persona == Persona.PATIENT
        and conversation is not None
        and conversation.human_takeover
    ):
        return _patient_takeover_turn(
            session,
            identity,
            state,
            conversation,
            user_text,
            phase,
            language,
            wa_message_id,
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
    extracted = enrich_from_user_text(extracted, user_text)
    safety = evaluate(extracted)

    if safety.fired:
        return _safety_fire_reply(
            session,
            identity,
            state,
            user_text,
            extracted,
            safety,
            phase,
            language,
            wa_message_id,
        )

    if identity.persona == Persona.PATIENT:
        family_reply = apply_family_turn(session, identity.person_id, user_text)
        if family_reply is not None:
            save_turn(
                session,
                state,
                user_text,
                family_reply,
                state.extracted,
                state.phase,
                language,
                wa_message_id,
            )
            return TurnResult(
                reply_text=family_reply,
                language=language,
                phase=state.phase,
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
