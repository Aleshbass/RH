import json
import re
from uuid import NAMESPACE_URL, uuid5

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
    AWAITING_RH_PAYMENT,
    AWAITING_RH_PROVIDER,
    AWAITING_RH_SERVICE_MODE,
    AWAITING_RH_SLOT,
    AWAITING_SLOT_MODE,
    OFFERING_MATCHES,
    handle_booking_turn,
    offer_matches,
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
from app.llm.prompt_builder import build
from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
from app.integrations.typesafe_client import TypeSafeClient, TypeSafeError
from app.config import get_settings
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
from app.safety.escalation import notify_family_on_safety, patient_message
from app.safety.evaluator import evaluate
from app.physio.availability import apply_availability_turn
from app.physio.booking_alerts import apply_physio_reply
from app.physio.home_visit_checkin import apply_checkin_turn
from app.physio.onboarding import apply_onboarding_turn
from app.physio.payouts import apply_payout_turn
from app.physio.session_notes import apply_note_turn
from app.physio.rh_operations import apply as apply_rh_physio_operation, help_text as rh_physio_help
from app.triage.extraction import enrich_from_user_text, infer_condition_area, merge_extraction
from app.triage.question_batching import grouped_followup, missing_fields
from app.triage.summary import plain_summary

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
_DASHBOARD_RE = re.compile(
    r"(?i)(?:\b(?:update|edit|change|set)\b.{0,40}\b"
    r"(?:bio|photo|pricing|price list|rates|credentials)\b"
    r"|\b(?:my bio|my pricing|my rates|profile photo|price list|my credentials)\b)"
)
_DASHBOARD_REPLY = (
    "That lives on the web dashboard, not WhatsApp. I can't edit bio, photo, pricing, or credentials here."
)


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
    text = " ".join((user_text or "").casefold().split())
    # The policy is presented immediately before this step, so a short,
    # unambiguous affirmative is easier to use on WhatsApp than requiring the
    # patient to repeat the policy title verbatim.
    if text in {"i accept", "i agree"}:
        return True
    return bool(re.search(r"\b(?:i\s+)?(?:accept|agree to)\b.{0,80}\b(?:policy|terms|consultation)\b", text))


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
        "main_concern", "relevant_medical_history", "comorbidities", "goals",
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
            reply = _start_paid_amber_review(session, identity, state)
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


def _start_paid_amber_review(session: Session, identity: Identity, state: ConversationState) -> str:
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
        review = client.create_specialist_review(
            patient_id=mapping.rh_record_id, assessment_id=str(triage.id), assessment_revision=1,
            protocol_version=state.extracted.safety_protocol_version or "1.0.0",
            policy_version=str(policy["version"]), policy_acceptance_reference=str(policy.get("acceptance_message_id") or policy["version"]),
            conversation_id=str(conversation.id), actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=mapping.rh_record_id),
            idempotency_key=f"joy-amber-review-{conversation.id}",
        )
        review_id = str(review["review_id"])
        payment = client.initialize_specialist_review_payment(
            review_id, patient_id=mapping.rh_record_id, email=f"{patient.phone_e164}@patients.rehabify.invalid",
            actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=mapping.rh_record_id),
            idempotency_key=f"joy-amber-review-payment-{review_id}",
        )
    except (RHIntegrationError, KeyError):
        return "I can’t create the secure ₦6,000 review payment right now. Please try again shortly."
    context = dict(conversation.booking_context or {})
    context.update({"amber_review_id": review_id, "amber_review_payment_url": payment.authorization_url})
    conversation.booking_context = context
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id, payload={"decision": "amber_review_payment_created", "review_id": review_id, "amount_kobo": 600_000})
    return f"Your five-minute specialist review is ₦6,000. Pay securely here: {payment.authorization_url}\n\nAfter payment is verified, RH will assign an eligible reviewer and I’ll update you here."


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
            "to specialist matching yet. Please try again shortly."
        )
    if not document.is_approved:
        return (
            "Our Consultation & Booking Policy is not yet available for acceptance, so I can’t continue "
            "to specialist matching yet."
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
    conversation.booking_context = ctx
    state.booking_context = ctx
    session.flush()
    return (
        "Your triage summary is confirmed. Before I look for a specialist, please review "
        f"our Consultation & Booking Policy: {policy['url']}\n\n"
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


_SAFETY_GROUP_COPY = {
    "bladder_bowel_or_saddle": "Any new bladder or bowel-control problem, or numbness around your groin or bottom?",
    "new_nerve_symptoms": "Any new or rapidly worsening weakness, numbness, or tingling in your limbs?",
    "major_injury": "Did this start after a serious accident, major fall, or significant injury?",
    "general_warning_signs": "Any fever or feeling very unwell, unexplained weight loss, previous cancer, pain that is rapidly worsening, or pain that is unusual at rest or at night?",
}


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


def _safety_prompt(extracted: ExtractedTriage) -> str:
    screen = _safety_screen(extracted)
    rendered = "\n".join(
        f"{index + 1}. {_SAFETY_GROUP_COPY[group]}"
        for index, (group, _) in enumerate(screen)
    )
    return (
        "Before we continue, please answer this short safety check. "
        "Reply Yes, No, or Unsure for each number (for example: 1 No, 2 No):\n"
        f"{rendered}"
    )


def _triage_summary_prompt(extracted: ExtractedTriage) -> str:
    summary = plain_summary(extracted)
    return f"{summary}\n\nDoes that summary look right? Reply Yes to continue to the Consultation & Booking Policy, or tell me what to correct."


def _stage_for_booking_substate(substate: str | None) -> ConversationStage | None:
    """Keep the stage machine aligned with the deterministic booking state."""
    if substate in {AWAITING_RH_SLOT, AWAITING_SLOT_MODE}:
        return ConversationStage.SLOT_SELECTION
    if substate in {AWAITING_RH_PAYMENT, AWAITING_PAYMENT}:
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

    # Story details never bypass safety. Gather only the minimum information
    # needed to choose a protocol, then let the deterministic scheduler own
    # every red-flag question.
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

    scheduled = schedule_questions(extracted)
    if scheduled and not booking_sub:
        return _safety_prompt(extracted), PatientPhase.MID_TRIAGE

    patient = session.get(Patient, identity.person_id)
    if patient is not None:
        summary_confirmed = (
            incoming_phase == PatientPhase.POST_TRIAGE and _is_summary_confirm(user_text)
        )
        if summary_confirmed and not _policy_accepted(state):
            return _present_policy(session, state), PatientPhase.POST_TRIAGE
        if (
            (state.booking_context or {}).get(_POLICY_PRESENTED_KEY)
            and not _policy_accepted(state)
            and _is_explicit_policy_acceptance(user_text)
        ):
            _mark_policy_accepted(
                session, state, actor_phone=identity.phone_e164,
                person_id=identity.person_id, message_id=wa_message_id,
            )
            return offer_matches(session, session.get(Conversation, state.conversation_id), patient, extracted), PatientPhase.POST_TRIAGE
        booking_reply = handle_booking_turn(
            session,
            state,
            patient,
            extracted,
            user_text,
            paystack=paystack,
            summary_confirmed=summary_confirmed,
        )
        if booking_reply is not None:
            return booking_reply, PatientPhase.POST_TRIAGE

    if booking_sub == AWAITING_PAYMENT:
        return candidate_reply, PatientPhase.POST_TRIAGE

    summary = _triage_summary_prompt(extracted)
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
    if identity.persona == Persona.PATIENT:
        apply_inbound_code(session, identity.person_id, user_text)
        _maybe_route_off_platform(session, user_text, patient_id=identity.person_id)
    phase = decide_phase(state)
    language = mirror_language(user_text, state.last_known_language)
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

    extra_context = ""
    if state.known_facts:
        extra_context = f"KNOWN_FACTS:\n{json.dumps(state.known_facts, ensure_ascii=False)}"
    extract_prompt = build(
        identity, state.stage, state.extracted, language, _user_history(state), "", extra_context
    )
    response = llm.complete(extract_prompt, user_text)
    language = response.language or language

    extracted = _apply_inferred_area(merge_extraction(state.extracted, response.extraction_json))
    extracted = enrich_from_user_text(extracted, user_text)
    extracted = _record_fact_sources(extracted, wa_message_id)
    # A bare affirmative/negative is mapped only to the first outstanding,
    # backend-scheduled question. Complex or multilingual answers remain
    # UNCLEAR for the constrained classifier path; they are never silently NO.
    # A single WhatsApp safety message can contain the entire approved grouped
    # screen. Map numbered replies deterministically so a patient is not forced
    # into one message per red-flag question.
    safety_screen = _safety_screen(extracted)
    if phase == PatientPhase.MID_TRIAGE and safety_screen:
        answers = dict(extracted.safety_answers)
        numbered = {
            int(index): normalize_answer(answer)
            for index, answer in re.findall(r"(?:^|[\s,;])(\d{1,2})\s*[).:-]?\s*(yes|no|unsure)\b", user_text, re.I)
        }
        if numbered:
            for index, normalized in numbered.items():
                if 1 <= index <= len(safety_screen) and normalized in {YES, NO, UNCLEAR}:
                    for question in safety_screen[index - 1][1]:
                        answers[question.id] = normalized
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
    candidate_reply = response.reply_text or (
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
