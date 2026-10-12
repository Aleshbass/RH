import json
import logging
import re
import hashlib
from time import perf_counter
from uuid import NAMESPACE_URL, uuid5

import httpx
from sqlalchemy import select
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
from app.booking.booking_flow import (
    AWAITING_PAYMENT,
    AWAITING_RH_LOCATION,
    AWAITING_RH_PAYMENT_EMAIL,
    AWAITING_RH_PAYMENT,
    AWAITING_RH_PROVIDER,
    AWAITING_RH_SERVICE_MODE,
    AWAITING_RH_SLOT,
    AWAITING_SLOT_MODE,
    AWAITING_POLICY_ACCEPTANCE,
    AWAITING_INITIAL_CONSULTATION_CONFIRMATION,
    OFFERING_MATCHES,
    begin_selected_treatment,
    booking_policy_acceptance_prompt,
    handle_booking_turn,
    initial_consultation_offer,
    offer_matches,
    _set_substate,
)
from app.conversation.language import mirror_language
from app.conversation.orchestrator import decide_booking_substate, decide_phase, has_narrative
from app.conversation.stage_machine import assert_transition
from app.conversation.state_manager import ConversationState, load, save_turn
from app.family.access import apply_family_turn
from app.family.relay import apply_pending_physio_answer, ask_physio, is_relay_ask
from app.partner.referral import apply_inbound_code, apply_partner_turn, maybe_provision_from_referral
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.identity.unknown_sender import resolve_unknown_sender
from app.llm.gemini_client import LLMClient
from app.observability import elapsed_ms, log_event
from app.llm.prompt_builder import build
from app.integrations.rh_client import RHPaymentInitialization, RHActor, RHIntegrationError, configured_rh_client
from app.integrations.typesafe_client import TypeSafeClient, TypeSafeError
from app.config import get_settings
from app.booking.paystack_client import initialize_transaction
from app.api.internal.rh_safety_eligibility import EligibilityRequest, issue_eligibility_reference
from app.models.admin import Admin
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.triage_session import TriageSession
from app.models.rh_identity_mapping import RHIdentityMapping
from app.models.types import (
    AuditKind,
    ConversationStage,
    ExtractedTriage,
    Identity,
    PatientPhase,
    Persona,
    SafetyResult,
    TurnResult,
)
from app.safety.protocol_runtime import UNCLEAR, NO, YES, ScheduledQuestion, normalize_answer, schedule_questions
from app.safety.semantic_normalization import (
    clearly_non_major_sport_mechanism,
    validated_semantic_safety_answers,
)
from app.safety.escalation import notify_family_on_safety, patient_message, specialist_review_offer
from app.safety.evaluator import evaluate
from app.physio.availability import apply_availability_turn
from app.physio.booking_alerts import apply_physio_reply
from app.physio.home_visit_checkin import apply_checkin_turn
from app.physio.onboarding import apply_onboarding_turn
from app.physio.payouts import apply_payout_turn
from app.physio.session_notes import apply_note_turn
from app.physio.rh_operations import apply as apply_rh_physio_operation, help_text as rh_physio_help
from app.triage.extraction import (
    constrain_model_extraction,
    enrich_from_user_text,
    infer_condition_area,
    merge_extraction,
    parse_severity_from_text,
)
from app.triage.question_batching import missing_fields
from app.triage.summary import confirmation_summary, plain_summary
from app.triage.turn_decision import TriageTurnDecision
from app.conversation.triage_state_reducer import reduce_triage_turn
from app.conversation.response_strategy import grounded_triage_ack

logger = logging.getLogger(__name__)

_YES_RE = re.compile(
    r"\b(yes|yeah|yep|yup|yea|yh|ya|ok|okay|sure|alright)\b",
    re.IGNORECASE,
)
_CONFIRM_RE = re.compile(
    r"\b(confirmed|confirm)\b",
    re.IGNORECASE,
)
_AFFIRM_PHRASE_RE = re.compile(
    r"\b(?:this|that|it)\s+is\s+right\b"
    r"|\b(?:sounds|looks)\s+good\b"
    r"|\ball\s+good\b"
    r"|\bthat'?s\s+right\b"
    r"|\bthat'?s\s+correct\b"
    r"|\ball\s+right\b"
    r"|\b(?:looks|seems)\s+correct\b",
    re.IGNORECASE,
)
_NEGATED_CONFIRM_RE = re.compile(
    r"\b(?:not|no|never|n't)\b.{0,40}\b(?:correct|right|confirm|confirmed)\b"
    r"|\b(?:correct|right|confirm|confirmed)\b.{0,20}\b(?:not|no)\b",
    re.IGNORECASE,
)


_LATER_PATH = (
    "This WhatsApp path is for later — I will be able to help you here in a later slice."
)
_MID_ACK = "Thanks, I've got that."
_POLICY_CONTEXT_KEY = "policy_accepted"
_POLICY_PRESENTED_KEY = "policy_presented"
_INITIAL_CONSULTATION_PATH_KEY = "green_initial_consultation_path"
_DASHBOARD_RE = re.compile(
    r"(?i)(?:\b(?:update|edit|change|set)\b.{0,40}\b"
    r"(?:bio|photo|pricing|price list|rates|credentials)\b"
    r"|\b(?:my bio|my pricing|my rates|profile photo|price list|my credentials)\b)"
)
_DASHBOARD_REPLY = (
    "That lives on the web dashboard, not WhatsApp. I can't edit bio, photo, pricing, or credentials here."
)
_REFERRAL_CODE_RE = re.compile(r"\bRHB\s*[-–—]\s*(\d{4,})\b", re.IGNORECASE)
_PARTNER_LINK_CODE_RE = re.compile(r"\bJOYREF\s*[:=-]\s*([A-Za-z0-9-]{4,64})\b", re.IGNORECASE)
_GREETING_ONLY_RE = re.compile(
    r"^\s*(?:hi|hello|hey|good\s+(?:morning|afternoon|evening))"
    r"(?:\s+(?:joy|there))?[!,.\s]*$",
    re.IGNORECASE,
)
_THANKS_ONLY_RE = re.compile(
    r"^\s*(?:thanks?|thank\s+you|tnx|thnx|tanks)(?:\s+(?:joy|so\s+much|a\s+lot))?[!,.\s]*$",
    re.IGNORECASE,
)
_FIRST_CONTACT_WELCOME = (
    "Hello 👋 Welcome to Rehabify.\n\n"
    "Could you tell me what’s going on today?\n\n"
    "You can tell me:\n\n"
    "• what’s bothering you\n"
    "• which part of your body is affected\n"
    "• how long you’ve had it\n"
    "• whether you’ve seen anyone about it\n"
    "• anything you’ve already tried\n\n"
    "Just tell me in your own words. There’s no need to fill out a form."
)
_TRIAGE_FLOW_KEY = "triage_flow_state"
_AWAITING_SUMMARY_CONFIRMATION = "awaiting_summary_confirmation"
_AWAITING_SUMMARY_CORRECTION = "awaiting_summary_correction"
_AWAITING_ADDITIONAL_DETAILS = "awaiting_additional_details"
_COLLECTING_ADDITIONAL_DETAILS = "collecting_additional_details"
_AWAITING_SAFETY_SCREEN = "awaiting_safety_screen"
# Intake is conversational until the patient confirms their account. Safety is
# then assessed by the deterministic, grouped protocol below—not by Gemini.
_TRIAGE_QUESTIONNAIRE_ENABLED = True


def _is_greeting_only(user_text: str) -> bool:
    """Keep a greeting out of the clinical-triage and model paths."""
    return bool(_GREETING_ONLY_RE.fullmatch(user_text or ""))


def _is_thanks_only(user_text: str) -> bool:
    """Acknowledge gratitude without treating it as a clinical update."""
    return bool(_THANKS_ONLY_RE.fullmatch(user_text or ""))


def _verified_referral_turn(
    session: Session,
    identity: Identity,
    state: ConversationState,
    user_text: str,
    language: str,
    wa_message_id: str | None,
) -> TurnResult | None:
    """Apply a referral only after RH verifies code ownership for this sender."""
    match = _REFERRAL_CODE_RE.search(user_text or "")
    if identity.persona != Persona.PATIENT or match is None:
        return None
    tracking_code = f"RHB-{match.group(1)}"
    patient = session.get(Patient, identity.person_id)
    conversation = session.get(Conversation, state.conversation_id)
    if patient is None or conversation is None:
        return None
    actor = RHActor(persona="patient", sender_phone=patient.phone_e164)
    try:
        client = configured_rh_client()
        resolved_patient = client.resolve_patient(
            patient.phone_e164, str(patient.id), actor, name=patient.name
        )
        if not resolved_patient.patient_id:
            raise RHIntegrationError("PATIENT_NOT_RESOLVED", "RH patient identity was not resolved")
        mapping = session.scalar(select(RHIdentityMapping).where(
            RHIdentityMapping.persona == Persona.PATIENT.value,
            RHIdentityMapping.joy_person_id == patient.id,
        ))
        if mapping is None:
            session.add(RHIdentityMapping(
                persona=Persona.PATIENT.value,
                joy_person_id=patient.id,
                rh_record_id=resolved_patient.patient_id,
            ))
        referral_result = client.resolve_referral_context(
            tracking_code,
            phone=patient.phone_e164,
            joy_person_id=str(patient.id),
            actor=RHActor(
                persona="patient", sender_phone=patient.phone_e164,
                rh_user_id=resolved_patient.patient_id,
            ),
        )
    except RHIntegrationError:
        # A dependency problem must not be represented as an invalid referral.
        return TurnResult(
            reply_text="I can’t verify your Rehabify referral right now. Please try again shortly.",
            language=language, phase=state.phase, extracted=state.extracted, safety=evaluate(state.extracted),
        )

    if referral_result.resolution != "MATCH" or not referral_result.referral:
        return TurnResult(
            reply_text=(
                "I couldn’t verify that referral code for this WhatsApp number. "
                "Please check the code or contact Rehabify support."
            ),
            language=language, phase=state.phase, extracted=state.extracted, safety=evaluate(state.extracted),
        )

    referral = referral_result.referral
    patient_context = referral.get("patient") if isinstance(referral.get("patient"), dict) else {}
    location = referral.get("location") if isinstance(referral.get("location"), dict) else {}
    name = patient_context.get("display_name")
    if isinstance(name, str) and name.strip() and (not patient.name or patient.name == "Patient"):
        patient.name = name.strip()
    for attr, value in (("city", location.get("city")), ("area", location.get("area"))):
        if isinstance(value, str) and value.strip() and not getattr(patient, attr):
            setattr(patient, attr, value.strip())
    if not patient.location and patient.city and patient.area:
        patient.location = f"{patient.area}, {patient.city}"

    # Persist only the RH-approved, customer-facing projection.  In particular
    # this must never retain referral clinical notes, payment details, or a raw
    # Convex document in Joy's conversation database.
    context = dict(conversation.booking_context or {})
    context["rh_referral"] = referral
    conversation.booking_context = context
    state.booking_context = context
    state.known_facts.update({key: value for key, value in {
        "name": patient.name, "city": patient.city, "area": patient.area,
        "location": patient.location,
    }.items() if value})
    append(
        session,
        kind=AuditKind.IDENTITY,
        actor_phone=patient.phone_e164,
        person_id=patient.id,
        payload={
            "event": "rh_referral_verified",
            "tracking_code_sha256": hashlib.sha256(tracking_code.encode("utf-8")).hexdigest(),
            "referral_id": referral.get("referral_id"),
            "billing_mode": referral.get("billing_mode"),
            "next_step": referral.get("next_step"),
        },
    )
    billing_mode = referral.get("billing_mode")
    if billing_mode == "hmo_direct_billing":
        reply = (
            "I found your HMO referral and have your care details. I’ll collect only the "
            "remaining clinical information and route the case to care coordination; no payment will be requested here. "
            "Please describe the problem you need help with, in your own words."
        )
    else:
        reply = (
            "I found your Rehabify referral and have your saved contact and location details. "
            "I won’t ask for those again. Please describe the problem you need help with, in your own words."
        )
    save_turn(session, state, user_text, reply, state.extracted, state.phase, language, wa_message_id)
    return TurnResult(reply_text=reply, language=language, phase=state.phase, extracted=state.extracted, safety=evaluate(state.extracted))


def _capture_partner_attribution(session: Session, identity: Identity, state: ConversationState, user_text: str) -> None:
    """Persist a referral-link source only after RH verifies the active link."""
    match = _PARTNER_LINK_CODE_RE.search(user_text or "")
    if identity.persona != Persona.PATIENT or match is None:
        return
    patient = session.get(Patient, identity.person_id)
    conversation = session.get(Conversation, state.conversation_id)
    if patient is None or conversation is None:
        return
    context = dict(conversation.booking_context or {})
    if isinstance(context.get("partner_attribution"), dict):
        return
    try:
        client = configured_rh_client()
        mapping = session.scalar(select(RHIdentityMapping).where(
            RHIdentityMapping.persona == Persona.PATIENT.value,
            RHIdentityMapping.joy_person_id == patient.id,
        ))
        if mapping is None:
            resolved = client.resolve_patient(
                patient.phone_e164, str(patient.id),
                RHActor(persona="patient", sender_phone=patient.phone_e164), name=patient.name,
            )
            if not resolved.patient_id:
                return
            mapping = RHIdentityMapping(
                persona=Persona.PATIENT.value, joy_person_id=patient.id, rh_record_id=resolved.patient_id,
            )
            session.add(mapping)
            session.flush()
        attribution = client.resolve_partner_attribution(
            patient_id=mapping.rh_record_id, public_code=match.group(1),
        )
    except RHIntegrationError:
        # Attribution failure must never block care or turn an ordinary intake
        # into a misleading unverified partner source.
        return
    if attribution.resolution != "MATCH" or not attribution.public_code or not attribution.partner_id:
        return
    context["partner_attribution"] = {
        "partner_id": attribution.partner_id,
        "partner_name": attribution.partner_name,
        "public_code": attribution.public_code,
    }
    conversation.booking_context = context
    state.booking_context = context
    append(
        session, kind=AuditKind.IDENTITY, actor_phone=patient.phone_e164, person_id=patient.id,
        payload={"event": "partner_attribution_verified", "partner_id": attribution.partner_id, "public_code": attribution.public_code},
    )
    session.flush()


def _shadow_jev_decision(session: Session, identity: Identity, user_text: str, stage: str) -> None:
    """Record a non-authoritative Jev decision without retaining message text."""
    settings = get_settings()
    if not settings.typesafe_enabled or not settings.typesafe_shadow_mode or not settings.typesafe_api_key:
        return
    client: TypeSafeClient | None = None
    try:
        client = TypeSafeClient(settings.typesafe_api_key, settings.typesafe_model)
        decision = client.evaluate_patient_message(user_text, stage=stage)
        append(session, kind=AuditKind.TRIAGE, actor_phone=identity.phone_e164, person_id=identity.person_id, payload={
            "event": "typesafe_shadow_decision", "intent": decision.intent,
            "intent_confidence": decision.intent_confidence,
            "needs_clarification_probability": decision.needs_clarification_probability,
            "model": decision.model,
        })
    except TypeSafeError as exc:
        append(session, kind=AuditKind.TRIAGE, actor_phone=identity.phone_e164, person_id=identity.person_id, payload={
            "event": "typesafe_shadow_error", "error": str(exc),
        })
    except Exception:
        # Shadow telemetry must never interrupt a patient conversation.
        append(session, kind=AuditKind.TRIAGE, actor_phone=identity.phone_e164, person_id=identity.person_id, payload={
            "event": "typesafe_shadow_error", "error": "unexpected_client_error",
        })
    finally:
        if client is not None:
            client.close()


def _is_summary_confirm(user_text: str) -> bool:
    text = (user_text or "").strip()
    if not text:
        return False
    if _NEGATED_CONFIRM_RE.search(text):
        return False
    if _YES_RE.search(text):
        return True
    if _AFFIRM_PHRASE_RE.search(text):
        return True
    if _CONFIRM_RE.search(text):
        return True
    return False


def _is_explicit_policy_acceptance(user_text: str) -> bool:
    """A summary 'yes' is intentionally insufficient consent."""
    text = _normalised_short_reply(user_text)
    # The policy is presented immediately before this step, so a short,
    # unambiguous affirmative is easier to use on WhatsApp than requiring the
    # patient to repeat the policy title verbatim.
    if text in {"i accept", "i agree"}:
        return True
    return bool(re.search(r"\b(?:i\s+)?(?:accept|agree to)\b.{0,80}\b(?:policy|terms|consultation)\b", text))


def _normalised_short_reply(user_text: str) -> str:
    """Normalise common WhatsApp punctuation before matching a short reply."""
    return " ".join(
        (user_text or "").casefold().replace("’", "'").replace("‘", "'").split()
    ).strip(".!?,;: ")


def _is_simple_no(user_text: str) -> bool:
    """Recognise a short negative without treating a clinical narrative as one."""
    text = _normalised_short_reply(user_text)
    return text in {"no", "nope", "nah"}


def _is_no_further_details(user_text: str) -> bool:
    """Recognise an unambiguous end to the invitation to add information."""
    text = _normalised_short_reply(user_text)
    return text in {
        "nothing else", "there's nothing else", "there is nothing else",
        "nothing more", "that's all", "that is all", "no, nothing else",
    }


def _is_simple_yes(user_text: str) -> bool:
    text = _normalised_short_reply(user_text)
    return text in {"yes", "yeah", "yep", "yup", "sure", "okay", "ok"}


def _defer_amber_until_summary_is_complete(
    booking_context: dict | None,
    user_text: str,
) -> bool:
    """Let a patient confirm their first-story summary before an AMBER offer.

    RED safety escalation is never deferred. AMBER results can be based on
    incomplete initial information, so the patient gets one chance to confirm
    the summary and add anything material before Joy presents that route.
    """
    flow_state = (booking_context or {}).get(_TRIAGE_FLOW_KEY)
    if flow_state is None:
        return True
    if flow_state in {
        _AWAITING_SUMMARY_CONFIRMATION,
        _AWAITING_SUMMARY_CORRECTION,
        _AWAITING_ADDITIONAL_DETAILS,
        _COLLECTING_ADDITIONAL_DETAILS,
    }:
        # The patient must complete the summary and reach the deterministic
        # safety screen before a non-emergency review route is selected.
        return True
    return False


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


def _record_fact_sources(extracted: ExtractedTriage, source_message_id: str | None) -> ExtractedTriage:
    """Keep a trace to the WhatsApp message for clinically important facts."""
    if not source_message_id:
        return extracted
    sourceable = (
        "main_complaint", "body_region", "body_location", "onset", "duration", "mechanism",
        "symptoms", "radiation", "aggravating", "relieving", "functional_limitations",
        "main_concern", "seen_clinician", "previous_treatment", "relevant_medical_history",
        "comorbidities", "goals",
    )
    sources = dict(extracted.fact_sources)
    for field in sourceable:
        value = getattr(extracted, field)
        if value and field not in sources:
            sources[field] = source_message_id
    return extracted.model_copy(update={"fact_sources": sources})


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


def _is_specialist_review(session: Session, state: ConversationState) -> bool:
    if state.triage_session_id is None:
        return False
    triage = session.get(TriageSession, state.triage_session_id)
    return triage is not None and triage.status == "specialist_review"


_SPECIALIST_YES_ACK = (
    "Got you — I'll arrange that short specialist triage review. "
    "A clinician will pick this up shortly. Payment links for paid reviews "
    "will come once Paystack is live; for now I've flagged your case for review."
)


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
    if _is_specialist_review(session, state):
        conversation = session.get(Conversation, state.conversation_id)
        context = dict(conversation.booking_context or {}) if conversation else {}
        if _YES_RE.search(user_text or "") and not context.get("amber_review_requested"):
            context["amber_review_requested"] = True
            if conversation is not None:
                conversation.booking_context = context
            reply = _present_policy(session, state)
        elif (
            context.get("amber_review_requested")
            and context.get(_POLICY_PRESENTED_KEY)
            and not _policy_accepted(state)
            and _is_explicit_policy_acceptance(user_text)
        ):
            _mark_policy_accepted(session, state, actor_phone=identity.phone_e164, person_id=identity.person_id, message_id=wa_message_id)
            context = dict(conversation.booking_context or {}) if conversation else {}
            context["amber_review_awaiting_email"] = True
            if conversation is not None:
                conversation.booking_context = context
            reply = "Your specialist safety review for a couple of minutes is ₦6,000. Please reply with the email address you want to use for your secure payment receipt."
        elif context.get("amber_review_awaiting_email"):
            email = user_text.strip().casefold()
            if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or email.endswith(".invalid"):
                reply = "Please reply with a valid email address for your secure payment receipt."
            else:
                reply = _start_paid_amber_review(session, identity, state, email=email)
        elif context.get("amber_review_id"):
            reply = "Your ₦6,000 specialist review payment is being verified. RH will assign an eligible reviewer and I’ll update you here."
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
    escalation_stage = (
        ConversationStage.EMERGENCY_ESCALATION
        if safety.risk_level == "RED"
        else ConversationStage.MEDICAL_ESCALATION
    )
    save_turn(session, state, user_text, reply, extracted, phase, language, wa_message_id, stage=escalation_stage)
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=phase,
        extracted=extracted,
        safety=safety,
        blocked_by_safety=True,
    )


def _start_paid_amber_review(session: Session, identity: Identity, state: ConversationState, *, email: str) -> str:
    """Create only the fixed-price RH review service; never a routine booking."""
    patient = session.get(Patient, identity.person_id)
    conversation = session.get(Conversation, state.conversation_id)
    triage = session.get(TriageSession, state.triage_session_id) if state.triage_session_id else None
    if patient is None or conversation is None or triage is None:
        return "I can’t prepare the specialist review securely right now. Please try again shortly."
    mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.persona == Persona.PATIENT.value, RHIdentityMapping.joy_person_id == patient.id))
    try:
        client = configured_rh_client()
        if mapping is None:
            resolved = client.resolve_patient(patient.phone_e164, str(patient.id), RHActor(persona="patient", sender_phone=patient.phone_e164), name=patient.name)
            if not resolved.patient_id:
                return "I can’t prepare the specialist review securely right now. Please try again shortly."
            mapping = RHIdentityMapping(persona=Persona.PATIENT.value, joy_person_id=patient.id, rh_record_id=resolved.patient_id)
            session.add(mapping)
            session.flush()
        policy = (conversation.booking_context or {}).get(_POLICY_CONTEXT_KEY) or {}
        eligibility_reference: str | None = None
        if client.uses_direct_convex_gateway:
            eligibility = issue_eligibility_reference(
                session=session,
                settings=get_settings(),
                payload=EligibilityRequest(
                    rh_patient_id=str(mapping.rh_record_id),
                    assessment_id=str(triage.id),
                    assessment_revision=1,
                    service_type="specialist_review",
                    policy_version=str(policy["version"]),
                ),
                conversation=conversation,
            )
            if not eligibility.get("allowed") or not isinstance(eligibility.get("eligibility_reference"), str):
                logger.warning(
                    "joy_specialist_review_eligibility_rejected reason=%s",
                    str(eligibility.get("reason") or "unknown"),
                )
                return "I can’t prepare the specialist review securely right now. Please try again shortly."
            eligibility_reference = eligibility["eligibility_reference"]
        review = client.create_specialist_review(
            patient_id=mapping.rh_record_id, assessment_id=str(triage.id), assessment_revision=1,
            protocol_version=state.extracted.safety_protocol_version or "1.0.0",
            policy_version=str(policy["version"]), policy_acceptance_reference=str(policy.get("acceptance_message_id") or policy["version"]),
            conversation_id=str(conversation.id), actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=mapping.rh_record_id),
            idempotency_key=f"joy-amber-review-{conversation.id}",
            eligibility_reference=eligibility_reference,
        )
        review_id = str(review["review_id"])
        payment_idempotency_key = f"joy-amber-review-payment-{review_id}"
        if client.uses_direct_convex_gateway:
            prepared = client.prepare_specialist_review_payment(
                review_id,
                patient_id=mapping.rh_record_id,
                idempotency_key=payment_idempotency_key,
            )
            settings = get_settings()
            callback_url = (settings.paystack_callback_url or "").strip()
            if not callback_url and settings.rh_api_base_url:
                callback_url = f"{settings.rh_api_base_url.rstrip('/')}/payment/callback"
            if not callback_url:
                raise RHIntegrationError("PAYSTACK_CALLBACK_NOT_CONFIGURED", "RH payment callback URL is not configured")
            try:
                paystack_payment = initialize_transaction(
                    email,
                    int(prepared["amount_kobo"]),
                    str(prepared["reference"]),
                    callback_url,
                    metadata={
                        "joy_specialist_review_id": review_id,
                        "source_system": "joy_ai",
                        "source_channel": "whatsapp",
                        "correlation_id": str(conversation.id),
                    },
                )
                authorization_url = paystack_payment["authorization_url"]
            except Exception:
                # Store the failed initialization on the RH payment attempt so
                # it is visible for safe retry/reconciliation.  This does not
                # affect payment status and cannot mark a review as paid.
                client.record_specialist_review_payment_initialization(
                    str(prepared["attempt_id"]), authorization_url=None
                )
                raise
            client.record_specialist_review_payment_initialization(
                str(prepared["attempt_id"]), authorization_url=authorization_url
            )
            payment = RHPaymentInitialization(
                booking_id=review_id,
                reference=str(prepared["reference"]),
                authorization_url=authorization_url,
                payment_status="pending",
            )
        else:
            payment = client.initialize_specialist_review_payment(
                review_id, patient_id=mapping.rh_record_id, email=email,
                actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=mapping.rh_record_id),
                idempotency_key=payment_idempotency_key,
            )
    except (RHIntegrationError, KeyError, RuntimeError, httpx.HTTPError) as error:
        logger.warning(
            "joy_specialist_review_checkout_failed",
            extra={
                "code": error.code if isinstance(error, RHIntegrationError) else type(error).__name__,
                "retryable": error.retryable if isinstance(error, RHIntegrationError) else False,
            },
        )
        return "I can’t create the secure ₦6,000 review payment right now. Please try again shortly."
    context = dict(conversation.booking_context or {})
    context.update({"amber_review_id": review_id, "amber_review_payment_url": payment.authorization_url, "amber_review_email": email})
    context.pop("amber_review_awaiting_email", None)
    conversation.booking_context = context
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id, payload={"decision": "amber_review_payment_created", "review_id": review_id, "amount_kobo": 600_000})
    return f"Your specialist review for a couple of minutes is ₦6,000. Pay securely here: {payment.authorization_url}\n\nAfter payment is verified, RH will assign an eligible reviewer and I’ll update you here."


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
    if safety.action == "specialist_review" or (safety.risk_level or "").upper() == "AMBER":
        return _amber_specialist_reply(
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


def _policy_accepted(state: ConversationState) -> bool:
    ctx = state.booking_context or {}
    if ctx.get(_POLICY_CONTEXT_KEY) is True or isinstance(ctx.get(_POLICY_CONTEXT_KEY), dict):
        return True
    facts = state.known_facts or {}
    return facts.get(_POLICY_CONTEXT_KEY) is True


def _mark_policy_accepted(session: Session, state: ConversationState, *, actor_phone: str, person_id, message_id: str | None) -> None:
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return
    ctx = dict(conversation.booking_context or {})
    presentation = dict(ctx.get(_POLICY_PRESENTED_KEY) or {})
    if not presentation:
        raise ValueError("policy must be presented before it can be accepted")
    ctx[_POLICY_CONTEXT_KEY] = {
        "accepted_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "acceptance_message_id": message_id,
        "actor_phone": actor_phone,
        **presentation,
    }
    conversation.booking_context = ctx
    state.booking_context = ctx
    append(
        session, kind=AuditKind.POLICY, actor_phone=actor_phone, person_id=person_id,
        payload={"event": "accepted", **ctx[_POLICY_CONTEXT_KEY]},
    )
    session.flush()


def _present_policy(session: Session, state: ConversationState) -> str:
    """Present only a current, RH-approved canonical policy; otherwise fail closed."""
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return "I need to refresh the Consultation & Booking Policy before we continue."
    ctx = dict(conversation.booking_context or {})
    try:
        document = configured_rh_client().current_policy(language=state.last_known_language or "en")
    except RHIntegrationError:
        return (
            "I can’t retrieve the current Consultation & Booking Policy right now, so I can’t continue "
            "with your initial consultation yet. Please try again shortly."
        )
    if not document.is_approved:
        return (
            "Our Consultation & Booking Policy is not yet available for acceptance, so I can’t continue "
            "with your initial consultation yet."
        )
    policy = {
        "policy_id": document.policy_id,
        "version": document.version,
        "url": document.url,
        "content_sha256": document.content_sha256,
        "effective_at": document.effective_at,
        "acceptance_text": document.acceptance_text,
        "language": document.language,
    }
    policy["presented_at"] = __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat()
    ctx[_POLICY_PRESENTED_KEY] = policy
    _set_substate(conversation, AWAITING_POLICY_ACCEPTANCE, ctx)
    state.booking_context = ctx
    state.booking_substate = AWAITING_POLICY_ACCEPTANCE
    session.flush()
    if ctx.get(_INITIAL_CONSULTATION_PATH_KEY):
        return booking_policy_acceptance_prompt(ctx)
    choice = str(ctx.get("treatment_option") or "")
    next_step = (
        "Before I create your short specialist safety review"
        if ctx.get("amber_review_requested")
        else "Before I create your consultation booking"
        if choice in {"quick_initial", "full_virtual"}
        else "Before I look for a home-visit specialist"
    )
    return (
        f"{next_step}, please review our Consultation & Booking Policy: {policy['url']}\n\n"
        "Reply with ‘I accept’ when you are ready to continue."
    )


def _amber_specialist_reply(
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
    _set_triage_status(session, state, "specialist_review")
    route_safety(session, safety, {"patient_id": str(identity.person_id)})
    _audit_turn(
        session, identity, extracted, safety, phase, notify_family=notified
    )
    save_turn(
        session, state, user_text, reply, extracted, phase, language, wa_message_id,
        stage=ConversationStage.SPECIALIST_REVIEW,
    )
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=phase,
        extracted=extracted,
        safety=safety,
        blocked_by_safety=True,
    )


def _thin_first_contact(extracted: ExtractedTriage) -> bool:
    """Body-part-only mentions still get the open ask; a timed story gets the batch."""
    return not extracted.onset and extracted.severity is None


def _mid_followup_reply(candidate_reply: str, followup: str, incoming_phase: PatientPhase) -> str:
    """Keep a mined story to one concise, grouped follow-up question."""
    care = (candidate_reply or "").strip()
    if incoming_phase == PatientPhase.FIRST_CONTACT and care and "?" not in care:
        return f"{care} {followup}"
    return f"{_MID_ACK} {followup}"


def _safety_group(question: ScheduledQuestion) -> str:
    """Map approved protocol questions into concise patient-facing themes.

    The underlying protocol remains the source of truth. Grouping only avoids
    asking the same safety concept twice (for example, an injury question in
    both a general and a lower-back rule) and lets a clear "No" answer be
    recorded against every covered protocol question.
    """
    text = question.text.casefold()
    if any(term in text for term in ("bladder", "bowel", "genitals", "anus", "buttocks", "bicycle seat")):
        return "bladder_bowel_or_saddle"
    if any(term in text for term in ("weakness", "numbness", "tingling", "both legs", "limb")):
        return "new_nerve_symptoms"
    if any(term in text for term in ("accident", "major fall", "significant injury")):
        return "major_injury"
    return "general_warning_signs"


_SAFETY_SCREEN_ITEMS = (
    ("New or worsening weakness in your arms or legs", ("weakness",)),
    ("New loss of feeling or significant numbness", ("numbness", "tingling", "loss of feeling")),
    ("New problems controlling your bladder or bowel", ("bladder", "bowel")),
    ("New numbness around your groin, genitals or anus", ("groin", "genital", "anus", "saddle", "bottom")),
    ("A serious accident, fall or significant injury related to this problem", ("accident", "fall", "injury", "trauma")),
    ("Fever, feeling very unwell, or another significant illness alongside the problem", ("fever", "unwell", "chills", "night sweats", "infection")),
    ("Symptoms getting significantly worse very quickly", ("rapid", "worsen", "deteriorat")),
    ("Something else about your symptoms that feels unusual or concerning", ("unusual", "severe", "rest", "night", "weight", "cancer", "general health")),
)


def _safety_screen(extracted: ExtractedTriage) -> list[tuple[str, tuple[ScheduledQuestion, ...]]]:
    """Return at most four themed groups for the next deterministic screen."""
    groups: dict[str, list[ScheduledQuestion]] = {}
    # Use the complete outstanding protocol set here. A response to a grouped
    # item is intentionally applied to every equivalent underlying question,
    # which prevents duplicate screens from general and body-region rules.
    for question in schedule_questions(extracted, limit=100):
        groups.setdefault(_safety_group(question), []).append(question)
    order = ("bladder_bowel_or_saddle", "new_nerve_symptoms", "major_injury", "general_warning_signs")
    return [(name, tuple(groups[name])) for name in order if groups.get(name)]


_NEGATED_SAFETY_SCOPE_RE = re.compile(
    r"\b(?:no|without|den(?:y|ies)|haven['’]t(?:\s+had)?|have\s+not\s+had|not\s+had)\b\s+([^.!?]{0,180})",
    re.I,
)


def _narrative_no_answers(
    user_text: str, screen: list[tuple[str, tuple[ScheduledQuestion, ...]]]
) -> dict[str, str]:
    """Map only explicit, patient-stated negatives to matching safety items.

    This deliberately does not use the model and does not infer a broad "no"
    from an ambiguous story.  It lets a patient avoid repeating a plainly
    stated "no injury" or "no bladder change" while retaining any question
    whose specific warning sign was not actually addressed.
    """
    narrative = (user_text or "").casefold()
    scopes = [match.group(1).casefold().split(" but ", 1)[0] for match in _NEGATED_SAFETY_SCOPE_RE.finditer(user_text or "")]
    if not scopes and not clearly_non_major_sport_mechanism(narrative):
        return {}

    # This is a narrow, clinically corroborated semantic negative—not a
    # general inference from the word "minor." It covers the common patient
    # wording: a minor incident, assessed by a clinician, with no fracture.
    # A bare accident remains unanswered and is always screened.
    minor_assessed_incident = bool(
        re.search(r"\bminor\s+(?:car\s+)?(?:accident|collision|fall|injury)\b", narrative)
        and re.search(r"\b(?:hospital|doctor|clinic|x-?ray)\b", narrative)
        and any(phrase in narrative for phrase in ("no fracture", "nothing was broken", "nothing broken", "no broken bone"))
    )
    low_energy_sport_mechanism = clearly_non_major_sport_mechanism(narrative)

    def denied(*terms: str) -> bool:
        return any(any(term in scope for term in terms) for scope in scopes)

    answers: dict[str, str] = {}
    for _, questions in screen:
        for question in questions:
            text = question.text.casefold()
            if ("accident" in text or "injury" in text or "fall" in text) and (
                denied("accident", "injury", "fall", "collision")
                or minor_assessed_incident
                or low_energy_sport_mechanism
            ):
                answers[question.id] = NO
            elif "bladder" in text or "bowel" in text:
                if denied("bladder", "bowel"):
                    answers[question.id] = NO
            elif "numbness" in text and denied("numbness"):
                answers[question.id] = NO
            elif "tingling" in text and denied("tingling"):
                answers[question.id] = NO
            elif "weakness" in text and denied("weakness"):
                answers[question.id] = NO
            elif "fever" in text and denied("fever"):
                # A grouped general-warning question is cleared only when the
                # patient also explicitly denies other emergency symptoms.
                if any("other emergency symptom" in scope for scope in scopes):
                    answers[question.id] = NO
    return answers


def _narrative_yes_answers(
    user_text: str, screen: list[tuple[str, tuple[ScheduledQuestion, ...]]]
) -> dict[str, str]:
    """Safely recognise an affirmative answer expressed in natural language.

    A patient should not need to format a serious answer as ``1 Yes``.  This
    only ever records a positive answer for the already-presented warning
    group; it never clears a question or makes a clinical inference.  A
    positive therefore routes to the conservative safety outcome.
    """
    text = (user_text or "").casefold()
    affirmative = r"(?:\byes\b|\byep\b|\byeah\b|\bi\s+(?:do|have|feel|am)\b|\bit(?:'s|\s+is)\b)"
    warning_terms = {
        "general_warning_signs": r"fever|very\s+unwell|rapidly\s+worsen(?:ing|ed)|unusual\s+at\s+(?:rest|night)|night\s+pain|weight\s+loss|previous\s+cancer",
        "bladder_bowel_or_saddle": r"bladder|bowel|groin|saddle|bottom",
        "new_nerve_symptoms": r"weakness|numbness|tingling",
        "major_injury": r"serious\s+accident|major\s+fall|significant\s+injury",
    }
    answers: dict[str, str] = {}
    negation = r"(?:\bno\b|\bnot\b|\bwithout\b|\bhaven['’]t\b|\bhave\s+not\b|\bden(?:y|ies)\b)"
    for group, questions in screen:
        terms = warning_terms[group]
        affirmative_match = re.search(
            rf"{affirmative}[^.!?]{{0,100}}(?:{terms})", text
        )
        # A narrative can begin with an affirmative about ordinary pain and
        # later explicitly deny warning signs in the same sentence. Never
        # allow that earlier affirmative to turn a nearby "no/not/without"
        # warning-sign phrase into a YES safety answer.
        negated_warning = affirmative_match and re.search(
            rf"{negation}[^.!?]{{0,100}}(?:{terms})", affirmative_match.group(0)
        )
        if affirmative_match and not negated_warning:
            answers.update({question.id: YES for question in questions})
    return answers


def _safety_prompt(extracted: ExtractedTriage, *, include_thanks: bool = True) -> str:
    rendered = "\n".join(
        f"{index}. {copy}"
        for index, (copy, _) in enumerate(_SAFETY_SCREEN_ITEMS, start=1)
    )
    prefix = "Thanks. " if include_thanks else ""
    return (
        f"{prefix}Before I help you book, I just need to check a few important safety questions.\n\n"
        "Do you currently have any of the following?\n\n"
        f"{rendered}"
        "\n\nYou can reply ‘No to all’ or tell me the number(s) that apply."
    )


def _apply_numbered_safety_answers(
    answers: dict[str, str],
    screen: list[tuple[str, tuple[ScheduledQuestion, ...]]],
    user_text: str,
    *,
    allow_number_only: bool = False,
) -> dict[str, str]:
    """Map the eight patient-facing items back to their protocol groups.

    The patient may simply say ``1 and 7``. That is a positive safety answer,
    not a request for Joy to infer a diagnosis. Mapping it to the underlying
    group preserves the versioned protocol's more detailed rules.
    """
    questions = [question for _, group in screen for question in group]
    explicit = {
        int(index): normalize_answer(answer)
        for index, answer in re.findall(
            r"(?:^|[\s,;/|])#?(\d{1,2})\s*[).:=-]?\s*(yes|no|unsure)\b",
            user_text,
            re.I,
        )
    }
    if not explicit and allow_number_only:
        selected = {
            int(index)
            for index in re.findall(r"(?<!\d)\b([1-8])\b(?!\d)", user_text)
        }
        # Do not mistake a severity statement for a safety item.
        if re.search(r"\b(?:out\s+of|/)\s*10\b", user_text, re.I):
            selected.clear()
        explicit = {index: YES for index in selected}
    for index, answer in explicit.items():
        if 1 <= index <= len(_SAFETY_SCREEN_ITEMS) and answer in {YES, NO, UNCLEAR}:
            keywords = _SAFETY_SCREEN_ITEMS[index - 1][1]
            for question in questions:
                if any(keyword in question.text.casefold() for keyword in keywords):
                    answers[question.id] = answer
    return answers


def _can_skip_model_for_safety_reply(
    extracted: ExtractedTriage,
    user_text: str,
    *,
    safety_screen_active: bool = False,
) -> bool:
    """Recognise a compact reply to the already displayed safety screen."""
    # ``Yes`` and ``No`` are also used to confirm/correct the intake summary.
    # They are safety answers only after Joy has actually shown the safety
    # screen. Without this state guard, a summary-confirmation "Yes" could be
    # interpreted as bladder/bowel/saddle symptoms and incorrectly trigger a
    # RED route.
    if not safety_screen_active:
        return False
    normalised = " ".join((user_text or "").casefold().split()).strip(".!?,;: ")
    return bool(_safety_screen(extracted)) and (
        normalised in {"no to all", "none", "none apply"}
        or normalize_answer(user_text) in {
        YES,
        NO,
        UNCLEAR,
        }
    )


def _triage_summary_prompt(extracted: ExtractedTriage) -> str:
    return (
        "Thanks. Just to make sure I’ve understood you correctly:\n\n"
        f"{confirmation_summary(extracted)}\n\n"
        "Is that correct? Reply Yes or No."
    )


def _additional_details_acknowledgement() -> str:
    """Acknowledge a new detail before the deterministic safety screen."""
    return "Thanks, I’ve added that to your information."


def _additional_details_prompt() -> str:
    return (
        "Is there anything else about your problem that you’d like me to know before I continue?\n\n"
        "Reply Yes or No. If there is nothing else, you can also reply ‘there’s nothing else’."
    )


def _offer_initial_consultation(
    session: Session,
    state: ConversationState,
    extracted: ExtractedTriage,
) -> str:
    """Start the existing routine-consultation flow after a GREEN decision."""
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return "I need to refresh your consultation details before we continue. Please try again shortly."
    context = dict(conversation.booking_context or {})
    context[_TRIAGE_FLOW_KEY] = "initial_consultation_offered"
    # GREEN patients must review policy before seeing or committing to a
    # consultation. The legacy three-option menu remains available to its
    # existing routes, but is not the approved GREEN-path next step.
    context[_INITIAL_CONSULTATION_PATH_KEY] = True
    context["treatment_option"] = "quick_initial"
    # A new GREEN route requires a fresh, explicit policy acceptance. Never
    # reuse consent captured by an abandoned or earlier booking attempt.
    context.pop(_POLICY_CONTEXT_KEY, None)
    context.pop(_POLICY_PRESENTED_KEY, None)
    _set_substate(conversation, None, context)
    state.booking_context = context
    state.booking_substate = None
    _set_triage_status(session, state, "summarised")
    return (
        "Thanks. Based on what you’ve told me so far, I can help you arrange your initial consultation with a clinician.\n\n"
        f"{_present_policy(session, state)}"
    )


def _offer_specialist_triage_review(session: Session, state: ConversationState) -> str:
    """Route the completed initial account to the fixed-price clinician review."""
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return "I need to refresh your consultation details before we continue. Please try again shortly."
    context = dict(conversation.booking_context or {})
    context[_TRIAGE_FLOW_KEY] = "specialist_review_offered"
    conversation.booking_context = context
    state.booking_context = context
    _set_triage_status(session, state, "specialist_review")
    return specialist_review_offer()


def _stage_for_booking_substate(substate: str | None) -> ConversationStage | None:
    """Keep the stage machine aligned with the deterministic booking state."""
    if substate in {AWAITING_RH_SLOT, AWAITING_SLOT_MODE}:
        return ConversationStage.SLOT_SELECTION
    if substate == AWAITING_POLICY_ACCEPTANCE:
        return ConversationStage.POLICY_REVIEW
    if substate == AWAITING_INITIAL_CONSULTATION_CONFIRMATION:
        return ConversationStage.POLICY_ACCEPTANCE
    if substate in {AWAITING_RH_PAYMENT_EMAIL, AWAITING_RH_PAYMENT, AWAITING_PAYMENT}:
        return ConversationStage.AWAITING_PAYMENT
    if substate in {
        AWAITING_RH_SERVICE_MODE,
        AWAITING_RH_LOCATION,
        AWAITING_RH_PROVIDER,
        OFFERING_MATCHES,
    }:
        return ConversationStage.SPECIALIST_MATCHING
    return None


def _reply_after_extract(
    session: Session,
    state: ConversationState,
    user_text: str,
    candidate_reply: str,
    extracted: ExtractedTriage,
    incoming_phase: PatientPhase,
    identity: Identity,
    paystack=None,
    wa_message_id: str | None = None,
) -> tuple[str, PatientPhase]:
    if not has_narrative(extracted):
        return candidate_reply, PatientPhase.FIRST_CONTACT

    patient = session.get(Patient, identity.person_id)
    conversation = session.get(Conversation, state.conversation_id)
    if patient is None or conversation is None:
        return "I need to refresh your consultation details before we continue. Please try again shortly.", PatientPhase.MID_TRIAGE

    # The patient-facing protocol is deliberately deterministic after the
    # opening story: confirm summary -> correction if needed -> one open
    # question -> grouped safety screen -> safety-directed booking route.
    # Gemini extracts facts; it never chooses the route.
    context = dict(conversation.booking_context or {})
    flow_state = context.get(_TRIAGE_FLOW_KEY)
    if flow_state is None:
        summary = _triage_summary_prompt(extracted)
        _store_summary(session, state, summary)
        context[_TRIAGE_FLOW_KEY] = _AWAITING_SUMMARY_CONFIRMATION
        conversation.booking_context = context
        state.booking_context = context
        session.flush()
        return summary, PatientPhase.POST_TRIAGE

    if flow_state == _AWAITING_SUMMARY_CONFIRMATION:
        if _is_simple_no(user_text):
            context[_TRIAGE_FLOW_KEY] = _AWAITING_SUMMARY_CORRECTION
            conversation.booking_context = context
            state.booking_context = context
            session.flush()
            return "No problem. What would you like me to correct or add?", PatientPhase.POST_TRIAGE
        if _is_summary_confirm(user_text):
            context[_TRIAGE_FLOW_KEY] = _AWAITING_ADDITIONAL_DETAILS
            conversation.booking_context = context
            state.booking_context = context
            session.flush()
            return _additional_details_prompt(), PatientPhase.POST_TRIAGE
        return "Please reply Yes if the summary is correct, or No if you’d like to correct or add something.", PatientPhase.POST_TRIAGE

    if flow_state == _AWAITING_SUMMARY_CORRECTION:
        summary = _triage_summary_prompt(extracted)
        _store_summary(session, state, summary)
        context[_TRIAGE_FLOW_KEY] = _AWAITING_SUMMARY_CONFIRMATION
        conversation.booking_context = context
        state.booking_context = context
        session.flush()
        return summary, PatientPhase.POST_TRIAGE

    if flow_state == _AWAITING_ADDITIONAL_DETAILS:
        if _is_simple_yes(user_text):
            context[_TRIAGE_FLOW_KEY] = _COLLECTING_ADDITIONAL_DETAILS
            conversation.booking_context = context
            state.booking_context = context
            session.flush()
            return "Please tell me anything else you think is important.", PatientPhase.POST_TRIAGE
        if not (_is_simple_no(user_text) or _is_no_further_details(user_text)):
            context[_TRIAGE_FLOW_KEY] = _AWAITING_SAFETY_SCREEN
            conversation.booking_context = context
            state.booking_context = context
            session.flush()
            return f"{_additional_details_acknowledgement()}\n\n{_safety_prompt(extracted, include_thanks=False)}", PatientPhase.MID_TRIAGE
        acknowledgement = "Thanks — I’ve got everything you wanted to share."
        context[_TRIAGE_FLOW_KEY] = _AWAITING_SAFETY_SCREEN
        conversation.booking_context = context
        state.booking_context = context
        session.flush()
        return f"{acknowledgement}\n\n{_safety_prompt(extracted, include_thanks=False)}", PatientPhase.MID_TRIAGE

    if flow_state == _COLLECTING_ADDITIONAL_DETAILS:
        context[_TRIAGE_FLOW_KEY] = _AWAITING_SAFETY_SCREEN
        conversation.booking_context = context
        state.booking_context = context
        session.flush()
        return f"{_additional_details_acknowledgement()}\n\n{_safety_prompt(extracted, include_thanks=False)}", PatientPhase.MID_TRIAGE

    if flow_state == _AWAITING_SAFETY_SCREEN:
        if schedule_questions(extracted):
            return _safety_prompt(extracted), PatientPhase.MID_TRIAGE
        safety = evaluate(extracted)
        if safety.action == "specialist_review" or (safety.risk_level or "").upper() == "AMBER":
            return _amber_specialist_reply(
                session, identity, state, user_text, extracted, safety, incoming_phase, "en", wa_message_id
            ), PatientPhase.POST_TRIAGE
        return _offer_initial_consultation(session, state, extracted), PatientPhase.POST_TRIAGE

    # Existing in-flight legacy conversations still complete safely. New
    # conversations never enter this branch because V1 sets the state above.
    booking_reply = handle_booking_turn(
        session, state, patient, extracted, user_text, paystack=paystack,
    )
    if booking_reply is not None:
        return booking_reply, PatientPhase.POST_TRIAGE
    return _offer_specialist_triage_review(session, state), PatientPhase.POST_TRIAGE


def provider_unavailable_reply(
    session: Session, phone: str, user_text: str, wa_message_id: str | None = None
) -> TurnResult:
    """Continue a known patient flow safely when text generation is unavailable.

    This deliberately uses only deterministic state and parsers.  It never
    guesses clinical facts, confirms a booking, or bypasses the safety engine.
    """
    identity = resolve(session, phone)
    if identity is None or identity.persona != Persona.PATIENT:
        return TurnResult(reply_text="Sorry, I had a brief hiccup. Please send that again in a moment.", language="en", phase=PatientPhase.FIRST_CONTACT)
    state = load(session, identity)
    language = mirror_language(user_text, state.last_known_language)

    # Referral tokens are transport metadata, not clinical narrative. Capture
    # verified attribution first, then let the normal welcome/story flow see
    # only the patient's human-facing message.
    _capture_partner_attribution(session, identity, state, user_text)
    user_text = _PARTNER_LINK_CODE_RE.sub("", user_text or "").strip()
    extracted = _apply_inferred_area(enrich_from_user_text(state.extracted, user_text))
    # Preserve the same deterministic immediate red-flag handling used during
    # human takeover; a provider outage must never downgrade a clear urgent
    # phrase into an ordinary follow-up question.
    flags = flags_from_triage_text(user_text)
    if flags:
        extracted = merge_extraction(extracted, {"flags": flags})
    screen = _safety_screen(extracted)
    if screen:
        answers = dict(extracted.safety_answers)
        answers.update(_narrative_yes_answers(user_text, screen))
        if answers != dict(extracted.safety_answers):
            extracted = extracted.model_copy(update={
                "safety_answers": answers,
                "safety_question_order": [
                    question.id for _, questions in screen for question in questions
                    if question.id in answers
                ],
                "safety_protocol_version": "1.0.0",
            })
    safety = evaluate(extracted)
    if safety.fired:
        return _safety_fire_reply(
            session, identity, state, user_text, extracted, safety, state.phase, language, wa_message_id
        )
    conversation = session.get(Conversation, state.conversation_id)
    booking_context = conversation.booking_context if conversation is not None else None
    if _TRIAGE_QUESTIONNAIRE_ENABLED and (
        safety.action == "specialist_review" or (safety.risk_level or "").upper() == "AMBER"
    ) and not _defer_amber_until_summary_is_complete(booking_context, user_text):
        return _amber_specialist_reply(
            session, identity, state, user_text, extracted, safety, state.phase, language, wa_message_id
        )
    reply, phase = _reply_after_extract(
        session, state, user_text, "", extracted, state.phase, identity, wa_message_id=wa_message_id,
    )
    append(
        session,
        kind=AuditKind.TRIAGE,
        actor_phone=identity.phone_e164,
        person_id=identity.person_id,
        payload={"event": "provider_unavailable_stateful_recovery", "phase": phase.value},
    )
    save_turn(session, state, user_text, reply, extracted, phase, language, wa_message_id)
    return TurnResult(reply_text=reply, language=language, phase=phase, extracted=extracted, safety=safety)


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
    rh_mapping = session.scalar(
        select(RHIdentityMapping).where(
            RHIdentityMapping.persona == Persona.PHYSIO.value,
            RHIdentityMapping.joy_person_id == identity.person_id,
        )
    )
    # A Phase 4 RH-mapped physio is a conversation identity only. Provider,
    # booking and appointment state stays in RH; do not fall back to Joy's
    # legacy local physio tables for their operational commands.
    from app.config import get_settings
    if rh_mapping is not None and rh_mapping.rh_user_id and get_settings().rh_physio_operations_enabled:
        state = load(session, identity)
        try:
            reply = apply_rh_physio_operation(
                configured_rh_client(), profile_id=rh_mapping.rh_record_id,
                actor=RHActor(persona="physiotherapist", sender_phone=identity.phone_e164, rh_user_id=rh_mapping.rh_user_id),
                text=user_text,
            )
        except RHIntegrationError:
            reply = "I can’t reach Rehabify’s live operations service right now. Please try again shortly."
        if reply is None:
            reply = rh_physio_help()
        save_turn(session, state, user_text, reply, ExtractedTriage(), PatientPhase.FIRST_CONTACT, language, wa_message_id)
        return TurnResult(reply_text=reply, language=language, phase=PatientPhase.FIRST_CONTACT)
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
        # Phase 5 family identities are granted and resolved by RH.  No local
        # family record, triage session, or raw clinician note is required to
        # disclose a progress update.
        mapping = session.scalar(select(RHIdentityMapping).where(
            RHIdentityMapping.persona == Persona.FAMILY.value,
            RHIdentityMapping.joy_person_id == identity.person_id,
        ))
        from app.config import get_settings
        if mapping is not None and mapping.rh_user_id and get_settings().rh_family_operations_enabled:
            try:
                data = configured_rh_client().operational_query(
                    "family_care_summary",
                    actor=RHActor(persona="family", sender_phone=identity.phone_e164, rh_user_id=mapping.rh_user_id),
                    data={"grant_id": mapping.rh_record_id},
                )
            except RHIntegrationError:
                data = None
            if data is not None:
                appointments = data.get("appointments") or []
                if not appointments:
                    reply = "There are no shareable care updates available yet."
                else:
                    latest = appointments[0]
                    reply = (
                        f"Latest care update: {latest.get('service_type', 'Physiotherapy session')} is "
                        f"{latest.get('status', 'recorded')}."
                    )
                    if latest.get("notes_for_patient"):
                        reply += f"\n\n{latest['notes_for_patient']}"
                state = load(session, identity)
                save_turn(session, state, user_text, reply, ExtractedTriage(), PatientPhase.FIRST_CONTACT, language, wa_message_id)
                return TurnResult(reply_text=reply, language=language, phase=PatientPhase.FIRST_CONTACT)
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
    # `PT` is discovery, never local physiotherapist provisioning. RH's exact
    # verified phone lookup is the only way an unknown sender enters this flow.
    if identity is None and user_text.strip().upper() == "PT":
        try:
            resolved = configured_rh_client().resolve_physiotherapist(
                phone, RHActor(persona="physiotherapist", sender_phone=phone)
            )
        except RHIntegrationError:
            return TurnResult(reply_text="I can’t verify physiotherapist access right now. Please try again shortly.", language="en", phase=PatientPhase.FIRST_CONTACT)
        if resolved.resolution != "MATCH" or not resolved.physiotherapist_id or not resolved.rh_user_id:
            return TurnResult(reply_text="This WhatsApp number is not linked to an active, verified Rehabify physiotherapist account.", language="en", phase=PatientPhase.FIRST_CONTACT)
        person_id = uuid5(NAMESPACE_URL, f"rehabify:physio:{resolved.physiotherapist_id}")
        mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.persona == Persona.PHYSIO.value, RHIdentityMapping.joy_person_id == person_id))
        if mapping is None:
            session.add(RHIdentityMapping(persona=Persona.PHYSIO.value, joy_person_id=person_id, rh_record_id=resolved.physiotherapist_id, rh_user_id=resolved.rh_user_id))
            session.flush()
        identity = Identity(persona=Persona.PHYSIO, person_id=person_id, phone_e164=phone)
    if identity is None:
        try:
            resolved = configured_rh_client().operational_query(
                "family_resolve", actor=RHActor(persona="family", sender_phone=phone), data={"family_phone": phone}
            )
        except RHIntegrationError:
            resolved = {"resolution": "UNAVAILABLE"}
        if resolved.get("resolution") == "MATCH":
            grants = resolved.get("grants") or []
            grant = grants[0] if grants else None
            if isinstance(grant, dict) and grant.get("grant_id") and grant.get("patient_id"):
                person_id = uuid5(NAMESPACE_URL, f"rehabify:family:{grant['grant_id']}")
                mapping = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.persona == Persona.FAMILY.value, RHIdentityMapping.joy_person_id == person_id))
                if mapping is None:
                    session.add(RHIdentityMapping(persona=Persona.FAMILY.value, joy_person_id=person_id, rh_record_id=str(grant["grant_id"]), rh_user_id=str(resolved["family_user_id"])))
                    session.flush()
                identity = Identity(persona=Persona.FAMILY, person_id=person_id, phone_e164=phone)
        elif resolved.get("resolution") == "MULTIPLE":
            return TurnResult(reply_text="You have access to more than one patient. Please tell me which patient you want an update about.", language="en", phase=PatientPhase.FIRST_CONTACT)
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
    language = mirror_language(user_text, state.last_known_language)

    # A greeting contains no clinical narrative. Handle it locally so Gemini
    # cannot turn “hey Joy” into a misleading acknowledgement that implies the
    # person has already described a problem.
    if (
        identity.persona == Persona.PATIENT
        and state.phase == PatientPhase.FIRST_CONTACT
        and not has_narrative(state.extracted)
        and _is_greeting_only(user_text)
    ):
        save_turn(
            session,
            state,
            user_text,
            _FIRST_CONTACT_WELCOME,
            state.extracted,
            PatientPhase.FIRST_CONTACT,
            language,
            wa_message_id,
            stage=ConversationStage.STORY_CAPTURE,
        )
        return TurnResult(
            reply_text=_FIRST_CONTACT_WELCOME,
            language=language,
            phase=PatientPhase.FIRST_CONTACT,
            extracted=state.extracted,
        )

    if identity.persona == Persona.PATIENT and _is_thanks_only(user_text):
        conversation = session.get(Conversation, state.conversation_id)
        context = dict(conversation.booking_context or {}) if conversation else {}
        booking_id = context.get("rh_booking_id")
        if context.get("rh_booking_status") == "confirmed" and isinstance(booking_id, str):
            reply = (
                "You’re welcome. Your appointment is confirmed. "
                f"Your booking code is {booking_id}. Let me know if you need anything before the session."
            )
        else:
            reply = "You’re welcome. I’m here if you need anything else."
        save_turn(
            session, state, user_text, reply, state.extracted, state.phase,
            language, wa_message_id, stage=state.stage,
        )
        return TurnResult(
            reply_text=reply, language=language, phase=state.phase, extracted=state.extracted,
        )

    referral_turn = _verified_referral_turn(
        session, identity, state, user_text, language, wa_message_id
    )
    if referral_turn is not None:
        return referral_turn
    if identity.persona == Persona.PATIENT:
        apply_inbound_code(session, identity.person_id, user_text)
        _maybe_route_off_platform(session, user_text, patient_id=identity.person_id)
    phase = decide_phase(state)
    if _is_escalated(session, state) or _is_specialist_review(session, state):
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

    # An active booking flow is code-owned. Do this before Gemini extraction:
    # compact replies such as ``online``, ``3``, and a receipt email are not
    # new clinical narratives and must never be reinterpreted as triage.
    # This also keeps payment and slot transitions available if the model is
    # slow or unavailable.
    if identity.persona == Persona.PATIENT and decide_booking_substate(state):
        patient = session.get(Patient, identity.person_id)
        if patient is not None:
            active_conversation = session.get(Conversation, state.conversation_id)
            if (
                active_conversation is not None
                and (active_conversation.booking_context or {}).get(_POLICY_PRESENTED_KEY)
                and not _policy_accepted(state)
                and _is_explicit_policy_acceptance(user_text)
            ):
                _mark_policy_accepted(
                    session,
                    state,
                    actor_phone=identity.phone_e164,
                    person_id=identity.person_id,
                    message_id=wa_message_id,
                )
                context = dict(active_conversation.booking_context or {})
                if context.get(_INITIAL_CONSULTATION_PATH_KEY):
                    _set_substate(
                        active_conversation,
                        AWAITING_INITIAL_CONSULTATION_CONFIRMATION,
                        context,
                    )
                    state.booking_context = context
                    state.booking_substate = AWAITING_INITIAL_CONSULTATION_CONFIRMATION
                    booking_reply = initial_consultation_offer()
                else:
                    booking_reply = begin_selected_treatment(
                        session, active_conversation, patient, state.extracted
                    )
            else:
                booking_reply = handle_booking_turn(
                    session,
                    state,
                    patient,
                    state.extracted,
                    user_text,
                    paystack=paystack,
                )
            if booking_reply == "__JOY_TREATMENT_OPTION_SELECTED__":
                booking_reply = _present_policy(session, state)
            if booking_reply == "__JOY_INITIAL_CONSULTATION_CONFIRMED__":
                current = session.get(Conversation, state.conversation_id)
                if current is None:
                    booking_reply = "I need to refresh your consultation details before we continue. Please try again shortly."
                else:
                    booking_reply = begin_selected_treatment(
                        session, current, patient, state.extracted
                    )
            if booking_reply is not None:
                current = session.get(Conversation, state.conversation_id)
                booking_stage = _stage_for_booking_substate(
                    current.booking_substate if current is not None else None
                )
                stage = assert_transition(
                    state.stage,
                    booking_stage or ConversationStage.SPECIALIST_MATCHING,
                )
                save_turn(
                    session,
                    state,
                    user_text,
                    booking_reply,
                    state.extracted,
                    PatientPhase.POST_TRIAGE,
                    language,
                    wa_message_id,
                    stage=stage,
                )
                return TurnResult(
                    reply_text=booking_reply,
                    language=language,
                    phase=PatientPhase.POST_TRIAGE,
                    extracted=state.extracted,
                    blocked_by_safety=False,
                )

    # A bare 0–10 answer after the completed deterministic safety screen is
    # entirely code-owned. Calling Gemini for it adds latency and makes this
    # critical triage transition depend on provider availability.
    reported_severity = parse_severity_from_text(user_text)
    can_skip_model_for_severity = (
        reported_severity is not None
        and has_narrative(state.extracted)
        and not schedule_questions(state.extracted)
    )
    safety_screen_active = (
        (state.booking_context or {}).get(_TRIAGE_FLOW_KEY)
        == _AWAITING_SAFETY_SCREEN
    )
    can_skip_model_for_safety_reply = _can_skip_model_for_safety_reply(
        state.extracted,
        user_text,
        safety_screen_active=safety_screen_active,
    )
    if can_skip_model_for_severity:
        model_extraction = {"severity": reported_severity}
        candidate_reply = ""
    elif can_skip_model_for_safety_reply:
        model_extraction = {}
        candidate_reply = ""
    else:
        extra_context = ""
        if state.known_facts:
            extra_context = f"KNOWN_FACTS:\n{json.dumps(state.known_facts, ensure_ascii=False)}"
        extract_prompt = build(
            identity, state.stage, state.extracted, language, _user_history(state), "", extra_context
        )
        model_started = perf_counter()
        response = llm.complete(extract_prompt, user_text)
        log_event("triage.model_completed", latency_ms=elapsed_ms(model_started))
        language = response.language or language
        model_extraction = response.extraction_json
        candidate_reply = response.reply_text
        decision_payload = response.triage_decision_json

    if can_skip_model_for_severity or can_skip_model_for_safety_reply:
        decision_payload = {}

    # Gemini may omit a plainly stated region or category. Mine conservative
    # facts from the current patient message before deciding which clinical
    # pathway is missing; otherwise an obvious shoulder/ankle/knee narrative
    # can be needlessly asked to choose between MSK and unrelated specialties.
    extracted = enrich_from_user_text(
        merge_extraction(
            state.extracted,
            constrain_model_extraction(model_extraction, user_text),
        ),
        user_text,
    )
    extracted = _apply_inferred_area(extracted)
    reduction = reduce_triage_turn(
        extracted,
        user_text=user_text,
        decision=TriageTurnDecision.from_untrusted(decision_payload),
    )
    extracted = reduction.extracted
    append(
        session,
        kind=AuditKind.TRIAGE,
        actor_phone=identity.phone_e164,
        person_id=identity.person_id,
        payload={
            "event": "triage_turn_decision",
            "disposition": reduction.decision.disposition.value,
            "confidence": reduction.decision.confidence,
            "suggested_missing_fields": reduction.decision.missing_relevant_fields[:8],
        },
    )
    if reduction.corrections_applied:
        append(
            session,
            kind=AuditKind.TRIAGE,
            actor_phone=identity.phone_e164,
            person_id=identity.person_id,
            payload={
                "event": "triage_correction_applied",
                "fields": list(reduction.corrections_applied),
                "disposition": reduction.decision.disposition.value,
            },
        )
    candidate_reply = grounded_triage_ack(candidate_reply, extracted)
    extracted = _record_fact_sources(extracted, wa_message_id)
    # A bare affirmative/negative is mapped only to the first outstanding,
    # backend-scheduled question. Complex language is never guessed as NO.
    # A single WhatsApp safety message can contain the entire approved grouped
    # screen. Map numbered replies deterministically so a patient is not forced
    # into one message per red-flag question.
    safety_screen = _safety_screen(extracted)
    if safety_screen:
        answers = dict(extracted.safety_answers)
        answers.update(_narrative_no_answers(user_text, safety_screen))
        answers.update(_narrative_yes_answers(user_text, safety_screen))
        semantic_answers = validated_semantic_safety_answers(
            model_extraction.get("safety_semantic_answers") if isinstance(model_extraction, dict) else None,
            user_text,
            [question for _, questions in safety_screen for question in questions],
        )
        answers.update(semantic_answers)
        before_numbered = dict(answers)
        answers = _apply_numbered_safety_answers(
            answers,
            safety_screen,
            user_text,
            allow_number_only=safety_screen_active,
        )
        if safety_screen_active and answers == before_numbered:
            compact = " ".join((user_text or "").casefold().split()).strip(".!?,;: ")
            if compact in {"no to all", "none", "none apply"}:
                for _, questions in safety_screen:
                    for question in questions:
                        answers[question.id] = NO
            else:
                normalized = normalize_answer(user_text)
                if normalized in {YES, NO}:
                    # A bare answer is ambiguous after a grouped screen, so apply
                    # it only to the first group rather than silently clearing all
                    # safety checks.
                    for question in safety_screen[0][1]:
                        answers[question.id] = normalized
        if answers != dict(extracted.safety_answers):
            order = list(extracted.safety_question_order)
            for _, questions in safety_screen:
                for question in questions:
                    if question.id in answers and question.id not in order:
                        order.append(question.id)
            extracted = extracted.model_copy(update={
                "safety_answers": answers,
                "safety_question_order": order,
                "safety_protocol_version": "1.0.0",
            })
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

    if _TRIAGE_QUESTIONNAIRE_ENABLED and (
        safety.action == "specialist_review" or (safety.risk_level or "").upper() == "AMBER"
    ):
        conversation = session.get(Conversation, state.conversation_id)
        booking_context = conversation.booking_context if conversation is not None else None
        if not _defer_amber_until_summary_is_complete(booking_context, user_text):
            return _amber_specialist_reply(
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

    # Jev is deliberately after deterministic safety and before downstream
    # conversational work. Shadow mode is audit-only: Gemini and backend state
    # machines still own the live route and every patient-facing response.
    _shadow_jev_decision(session, identity, user_text, state.stage)

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

    # One Gemini request per text turn. The former second request merely rewrote
    # the first answer with RAG context, doubling latency and turning a single
    # timeout into a silent WhatsApp turn. RAG remains available for approved
    # patient education at explicit education/service moments, never for safety.
    candidate_reply = candidate_reply or (
        "Thanks — I received that. I’ll use the details you shared and ask only what is still needed."
    )

    reply, outgoing = _reply_after_extract(
        session,
        state,
        user_text,
        candidate_reply,
        extracted,
        phase,
        identity,
        paystack=paystack,
        wa_message_id=wa_message_id,
    )
    _audit_turn(session, identity, extracted, safety, outgoing)
    conversation = session.get(Conversation, state.conversation_id)
    booking_stage = _stage_for_booking_substate(
        conversation.booking_substate if conversation is not None else None
    )
    target_stage = booking_stage or (
        ConversationStage.STORY_CAPTURE if outgoing == PatientPhase.FIRST_CONTACT else
        ConversationStage.SAFETY_SCREEN if outgoing == PatientPhase.MID_TRIAGE else
        ConversationStage.POLICY_REVIEW if _POLICY_PRESENTED_KEY in (state.booking_context or {}) and not _policy_accepted(state) else
        ConversationStage.POLICY_ACCEPTANCE if _policy_accepted(state) and state.stage == ConversationStage.POLICY_REVIEW else
        ConversationStage.SPECIALIST_MATCHING if _policy_accepted(state) else
        ConversationStage.TRIAGE_SUMMARY
    )
    stage = assert_transition(state.stage, target_stage)
    save_turn(session, state, user_text, reply, extracted, outgoing, language, wa_message_id, stage=stage)
    return TurnResult(
        reply_text=reply,
        language=language,
        phase=outgoing,
        extracted=extracted,
        safety=safety,
        blocked_by_safety=False,
    )
