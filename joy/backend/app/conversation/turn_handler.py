import json
import logging
import re
import hashlib
from datetime import datetime, timedelta, timezone
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
from app.flows.signup import WELCOME_WITH_FORM, WELCOME_WITHOUT_FORM, is_signup_request, signup_interactive, signup_offer
from app.identity.greetings import is_greeting_only
from app.exercises.programme import asks_for_programme, done_command, reminder_command, show_programme
from app.booking.booking_flow import (
    wants_to_type_email,
    wants_whatsapp_receipt,
    whatsapp_receipt_address,
    AWAITING_RH_CONFIRM,
    AWAITING_RH_NAMED_PROVIDER,
    AWAITING_RH_OTHER_TIME,
    offer_named_physios,
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
    location_pin_turn,
    initial_consultation_offer,
    offer_matches,
    _set_substate,
)
from app.conversation.language import mirror_language
from app.conversation.orchestrator import decide_booking_substate, decide_phase, has_narrative
from app.conversation.stage_machine import assert_transition
from app.conversation.state_manager import (
    ConversationState,
    add_joy_message,
    last_joy_text,
    load,
    put_before_last_joy_message,
    save_turn,
)
from app.conversation.pricing import is_price_question, price_answer
from app.family.access import apply_family_turn
from app.family.relay import apply_pending_physio_answer, ask_physio, is_relay_ask
from app.partner.referral import apply_inbound_code, apply_partner_turn, maybe_provision_from_referral
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.identity.role_switch import (
    PHYSIO_ESCAPE_HINT,
    PHYSIO_LOCKED_REPLY,
    PHYSIO_START_PREFIX,
    PHYSIO_SIGNUP_REPLY,
    PHYSIO_SIGNUP_URL,
    ROLE_CHECK_KEY,
    ROLE_QUESTION,
    ROLE_QUESTION_RED_FLAG,
    STAY_PHYSIO_PREFIX,
    SWITCHED_PREFIX,
    SWITCHED_WELCOME,
    carries_patient_story,
    is_onboarding_content,
    is_patient_statement,
    is_restart_request,
    is_switchable_physio,
    patient_says_physio,
    role_choice,
    writes_like_patient,
)
from app.identity.unknown_sender import (
    PHYSIO_SIGN_UP_REPLY,
    PHYSIO_USE_DASHBOARD_REPLY,
    looks_like_symptom,
    resolve_unknown_sender,
)
from app.llm.gemini_client import LLMClient
from app.observability import elapsed_ms, log_event
from app.llm.prompt_builder import build
from app.integrations.rh_client import RHPaymentInitialization, RHActor, RHIntegrationError, configured_rh_client
from app.integrations.typesafe_client import TypeSafeClient, TypeSafeError
from app.config import get_settings
from app.booking.paystack_client import initialize_transaction
from app.booking.step_help import booking_step_help
from app.conversation.check_in import check_in_turn
from app.conversation.companion import companion_turn, connect_turn, in_care, repoint_patient_mapping
from app.exercises.questions import exercise_question_turn
from app.conversation.human_request import BOT_REPLY, human_request_reply, is_bot_question, is_human_request
from app.conversation.interactive import interactive_for, reply_buttons
from app.triage import self_referral as sr
from app.triage.non_msk import infer_non_msk_area
from app.api.internal.rh_safety_eligibility import EligibilityRequest, issue_eligibility_reference
from app.models.admin import Admin
from app.models.booking import Booking
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.triage_session import TriageSession
from app.models.rh_identity_mapping import RHIdentityMapping
from app.models.types import (
    AuditKind,
    ConditionArea,
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
from app.safety.volunteered_red_flags import detect_volunteered_red_flags
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
_FIRST_CONTACT_WELCOME = WELCOME_WITHOUT_FORM
_TRIAGE_FLOW_KEY = "triage_flow_state"
_AWAITING_SUMMARY_CONFIRMATION = "awaiting_summary_confirmation"
_AWAITING_SUMMARY_CORRECTION = "awaiting_summary_correction"
_AWAITING_ADDITIONAL_DETAILS = "awaiting_additional_details"
_COLLECTING_ADDITIONAL_DETAILS = "collecting_additional_details"
_AWAITING_SAFETY_SCREEN = "awaiting_safety_screen"
# Intake is conversational until the patient confirms their account. Safety is
# then assessed by the deterministic, grouped protocol below—not by Gemini.
_TRIAGE_QUESTIONNAIRE_ENABLED = True


_DASHBOARD_LINK_RE = re.compile(
    r"\b(?:dashboard|log\s*in\s+link|login\s+link|sign\s*in\s+link|my\s+(?:rehabify\s+)?account\s+link|"
    r"(?:open|access)\s+my\s+(?:rehabify\s+)?account)\b",
    re.IGNORECASE,
)


def _dashboard_link_reply(session: Session, identity: Identity) -> str:
    from app.api.internal.rh_events import dashboard_link_text
    from app.booking.booking_flow import _rh_patient_id

    patient = session.get(Patient, identity.person_id)
    rh_patient_id = _rh_patient_id(session, patient) if patient is not None else None
    if not rh_patient_id:
        return "I can't reach your Rehabify record right now. Please try again in a few minutes."
    try:
        result = configured_rh_client().dashboard_link(patient_id=rh_patient_id, sender_phone=identity.phone_e164)
    except RHIntegrationError:
        return "I can't make a dashboard link right now. Please try again in a few minutes."
    url = str(result.get("dashboard_url") or "") if isinstance(result, dict) and result.get("ok") else ""
    if not url.startswith("https://"):
        return (
            "I couldn't make a dashboard link for this number. You can sign in at "
            "https://physioaroundme.com/sign-in, or email hello@myrehabifyhealth.com and we'll help."
        )
    append(session, kind=AuditKind.IDENTITY, actor_phone=identity.phone_e164, person_id=identity.person_id,
           payload={"decision": "dashboard_link_issued_on_request"})
    return dashboard_link_text(url)


_PARTNER_PHONE_RE = re.compile(r"\+?\d[\d\s-]{9,}\d")
_PHYSIO_BOOKING_REPLY_RE = re.compile(r"^\s*(?:ACCEPT|REJECT)\s+[A-Za-z0-9_-]{6,64}\s*$", re.IGNORECASE)
# A legacy Joy-booked physio answering its alert without an ID ("accept", "declined")
_LEGACY_PHYSIO_ANSWER_RE = re.compile(r"(?i)\b(?:accept(?:ed)?|declin(?:e|ed))\b")


def _is_greeting_only(user_text: str) -> bool:
    """Keep a greeting out of the clinical-triage and model paths (all five languages)."""
    return is_greeting_only(user_text)


_LINK_REQUEST_RE = re.compile(
    r"^\s*(?:link|link\s+(?:my\s+)?(?:rehabify\s+)?account|connect\s+(?:my\s+)?(?:rehabify\s+)?account)\s*[.!]?\s*$",
    re.IGNORECASE,
)
_LINK_CODE_RE = re.compile(r"^\s*(\d{3})\s?(\d{3})\s*$")
_LINK_PENDING_KEY = "account_link_pending_until"
_LINK_WINDOW_SECONDS = 15 * 60
_LINK_REQUEST_FAILURES = {
    "no_account": "I couldn't find another Rehabify account for this WhatsApp number, so there's nothing to link. You're all set.",
    "no_email": (
        "Your Rehabify account doesn't have an email I can send a code to. Please email "
        "hello@myrehabifyhealth.com and our team will link it for you."
    ),
    "ambiguous": (
        "More than one Rehabify account uses this number, so I can't tell which to link. Please email "
        "hello@myrehabifyhealth.com and our team will link the right one."
    ),
    "rate_limited": "I've already sent a few codes in the last hour. Please use the latest email, or try again later.",
}


def _account_link_turn(session: Session, identity: Identity, state: ConversationState, user_text: str) -> str | None:
    """LINK, then the 6-digit code emailed to the website account: links it to this WhatsApp number.

    Joy never attaches a WhatsApp chat to a website account on a phone match alone; the owner
    proves control of both the number and the account's mailbox. Code-owned, never the model.
    """
    import time

    from app.booking.booking_flow import _rh_actor, _rh_patient_id

    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return None
    context = dict(conversation.booking_context or {})
    pending_until = context.get(_LINK_PENDING_KEY)
    code_match = _LINK_CODE_RE.match(user_text or "")
    awaiting_code = isinstance(pending_until, (int, float)) and pending_until > time.time()
    if not (_LINK_REQUEST_RE.match(user_text or "") or (code_match and awaiting_code)):
        return None
    patient = session.get(Patient, identity.person_id)
    rh_patient_id = _rh_patient_id(session, patient) if patient is not None else None
    if patient is None or not rh_patient_id:
        return "I can't reach Rehabify's records right now. Please try again shortly."
    actor = _rh_actor(patient, rh_patient_id)
    try:
        if code_match and awaiting_code:
            result = configured_rh_client().confirm_account_link(
                patient_id=rh_patient_id, code=code_match.group(1) + code_match.group(2), actor=actor,
            )
        else:
            result = configured_rh_client().request_account_link(patient_id=rh_patient_id, actor=actor)
    except RHIntegrationError:
        return "I can't reach Rehabify's records right now. Please try again shortly."

    if code_match and awaiting_code:
        if result.get("linked") is True and isinstance(result.get("patient_id"), str):
            # Events for bookings on the old WhatsApp-only record still reach them (alias mapping)
            repoint_patient_mapping(session, patient, result["patient_id"])
            context.pop(_LINK_PENDING_KEY, None)
            context.pop("care_summary", None)
            conversation.booking_context = context
            append(session, kind=AuditKind.IDENTITY, actor_phone=patient.phone_e164, person_id=patient.id,
                   payload={"decision": "rh_account_linked"})
            return "Done. Your WhatsApp is now linked to your Rehabify account, so your bookings and care are in one place."
        reason = result.get("reason")
        if reason == "wrong_code" and int(result.get("attempts_left") or 0) > 0:
            return "That code doesn't match. Please check the latest email from Rehabify and send the 6 digits again."
        context.pop(_LINK_PENDING_KEY, None)
        conversation.booking_context = context
        return "That code has expired or was tried too many times. Reply LINK and I'll email you a new one."

    if result.get("sent") is True:
        context[_LINK_PENDING_KEY] = time.time() + _LINK_WINDOW_SECONDS
        conversation.booking_context = context
        hint = result.get("email_hint")
        where = f" to {hint}" if isinstance(hint, str) and hint else ""
        return (
            f"I've emailed a 6-digit code{where}. Reply here with the code to link your Rehabify account. "
            "It expires in 15 minutes."
        )
    return _LINK_REQUEST_FAILURES.get(str(result.get("reason")), _LINK_REQUEST_FAILURES["no_account"])


# Wording pending clinical-lead review.
_BOOKED_GUIDANCE = (
    "If your symptoms get much worse before then, please seek medical care and let your "
    "physiotherapist know. To change the appointment, reply *reschedule* or *cancel*."
)
_BOOKING_CHANGE_RE = re.compile(
    r"\b(?:cancel\w*|reschedul\w*|postpone|move\s+(?:my|the)\s+(?:appointment|session|booking)|"
    r"change\s+(?:my|the)\s+(?:appointment|session|booking|time|date))\b",
    re.IGNORECASE,
)


def _booked_patient_reply(state: ConversationState) -> str:
    """Code-owned reply for a patient whose RH booking is already confirmed."""
    from app.api.internal.rh_events import _appointment_details
    from app.booking.appointment_reminders import format_lagos_appointment_time

    context = state.booking_context or {}
    booking_id = str(context.get("rh_booking_id") or "")
    rh_patient_id = str(context.get("rh_patient_id") or "")
    details = _appointment_details(booking_id, rh_patient_id) if booking_id and rh_patient_id else None
    if details is None:
        lines = ["Your appointment is confirmed. I’ll send your reminders here before the session."]
    else:
        lines = [
            f"Your appointment with {details['provider_name']} is confirmed for "
            f"{format_lagos_appointment_time(details['session_start'])}."
        ]
        if details.get("booking_code"):
            lines.append(f"Your booking code is {details['booking_code']}.")
        if details.get("meeting_url"):
            label = "Join here when it’s time:" if details.get("service_mode") == "online" else "Your booking details:"
            lines.append(f"{label} {details['meeting_url']}")
    lines.append(_BOOKED_GUIDANCE)
    return "\n\n".join(lines)


_WELCOME_BACK_AFTER = timedelta(hours=6)
_TRIAGE_STEPS_WAITING = {"awaiting_summary_confirmation", "awaiting_summary_correction", "awaiting_additional_details", "collecting_additional_details"}


def _returning_greeting(session: Session, identity: Identity, state: ConversationState) -> tuple[str, dict | None] | None:
    """Hello from someone Joy already knows: pick up where they are, in code (no model).

    None when there's nothing to come back to (Joy then answers as for a first hello).
    """
    from app.conversation.interactive import reply_buttons
    from app.flows.signup import _last_joy_question

    patient = session.get(Patient, identity.person_id)
    first = ((patient.name or "").split(" ")[0] if patient is not None else "").strip()
    first = "" if first.casefold() in {"", "patient"} else first
    last_at = max((m.created_at for m in state.recent_messages if m.created_at is not None), default=None)
    now = datetime.now(timezone.utc)
    away = last_at is not None and now - (last_at if last_at.tzinfo else last_at.replace(tzinfo=timezone.utc)) >= _WELCOME_BACK_AFTER
    hello = (f"Welcome back, {first} 👋" if first else "Welcome back 👋") if away else (f"Hi {first} 👋" if first else "Hi 👋")
    conversation = session.get(Conversation, state.conversation_id)
    context = dict(conversation.booking_context or {}) if conversation is not None else {}

    if state.stage == ConversationStage.BOOKING_CONFIRMED and not decide_booking_substate(state):
        return f"{hello}\n\n{_booked_patient_reply(state)}", None
    mid_flow = bool(conversation is not None and conversation.booking_substate) or context.get(_TRIAGE_FLOW_KEY) in _TRIAGE_STEPS_WAITING
    if mid_flow:
        question = _last_joy_question(session, conversation)
        if question:
            return f"{hello}. Let's carry on from where we stopped:\n\n{question}", None
        return f"{hello}. Let's carry on from where we stopped. Tell me if anything has changed.", None
    if not has_narrative(state.extracted) and state.phase == PatientPhase.FIRST_CONTACT:
        return None
    return (
        f"{hello}. How can I help today?\n\n"
        "You can tell me about a new problem or how you're getting on, ask for *my exercises*, "
        "or ask for your *dashboard link*.",
        reply_buttons(("my exercises", "My exercises"), ("send me my dashboard link", "My dashboard")),
    )


def _is_thanks_only(user_text: str) -> bool:
    """Acknowledge gratitude without treating it as a clinical update."""
    return bool(_THANKS_ONLY_RE.fullmatch(user_text or ""))


_REFERRAL_NAME_KEY = "referral_name_check"
# Two to five words of letters (accents, apostrophes and hyphens allowed): a name, not a story
_REFERRAL_NAME_RE = re.compile(r"^[^\W\d_][^\W\d_'’.-]*(?:[\s'’.-]+[^\W\d_][^\W\d_'’.-]*){1,4}$")


def _looks_like_name(text: str) -> bool:
    """A name in any of Joy's languages: tone marks (Adébáyọ̀) are dropped before matching."""
    import unicodedata

    plain = "".join(ch for ch in unicodedata.normalize("NFKD", text or "") if not unicodedata.combining(ch))
    return bool(_REFERRAL_NAME_RE.fullmatch(plain.strip()))


def _set_referral_name_check(conversation: Conversation, code: str, attempts: int) -> None:
    context = dict(conversation.booking_context or {})
    context[_REFERRAL_NAME_KEY] = {"code": code, "attempts": attempts}
    conversation.booking_context = context


def _clear_referral_name_check(conversation: Conversation | None) -> None:
    if conversation is None or _REFERRAL_NAME_KEY not in (conversation.booking_context or {}):
        return
    context = dict(conversation.booking_context or {})
    context.pop(_REFERRAL_NAME_KEY, None)
    conversation.booking_context = context


def _verified_referral_turn(
    session: Session,
    identity: Identity,
    state: ConversationState,
    user_text: str,
    language: str,
    wa_message_id: str | None,
) -> TurnResult | None:
    """Apply a referral only after RH verifies code ownership for this sender.

    From a different WhatsApp number than the one on the referral (a family phone, a second
    SIM), Joy asks for the patient's full name as the referrer wrote it; RH links the referral
    only if the code and the name both match. Two tries, then the patient is pointed to support.
    """
    if identity.persona != Persona.PATIENT:
        return None
    match = _REFERRAL_CODE_RE.search(user_text or "")
    conversation = session.get(Conversation, state.conversation_id)
    pending = (conversation.booking_context or {}).get(_REFERRAL_NAME_KEY) if conversation is not None else None
    confirm_name: str | None = None
    if match is None:
        if not isinstance(pending, dict):
            return None
        if not _looks_like_name(user_text):
            _clear_referral_name_check(conversation)  # they moved on: carry on normally
            return None
        tracking_code = str(pending.get("code") or "")
        confirm_name = " ".join((user_text or "").split())
    else:
        tracking_code = f"RHB-{match.group(1)}"
    patient = session.get(Patient, identity.person_id)
    if patient is None or conversation is None or not tracking_code:
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
            confirm_name=confirm_name,
        )
    except RHIntegrationError:
        # A dependency problem must not be represented as an invalid referral.
        return TurnResult(
            reply_text="I can’t verify your Rehabify referral right now. Please try again shortly.",
            language=language, phase=state.phase, extracted=state.extracted, safety=evaluate(state.extracted),
        )

    if referral_result.resolution != "MATCH" or not referral_result.referral:
        attempts = int(pending.get("attempts") or 0) + 1 if isinstance(pending, dict) and confirm_name else 0
        if confirm_name is None:
            # Maybe sent from another number: ask for the name once rather than giving up
            _set_referral_name_check(conversation, tracking_code, 0)
            reply = (
                "That referral code was set up for a different WhatsApp number. To use it from this "
                "number, reply with the patient's full name exactly as the doctor or partner wrote it "
                "(first name and surname)."
            )
        elif attempts < 2:
            _set_referral_name_check(conversation, tracking_code, attempts)
            reply = "That name doesn't match the referral. Please check the spelling and send the full name once more."
        else:
            _clear_referral_name_check(conversation)
            reply = (
                "I couldn't match that name to the referral. Please ask the person who referred you to "
                "check the WhatsApp number they used, or email hello@myrehabifyhealth.com and we'll help. "
                "You can still tell me what's going on and I'll help you here."
            )
        save_turn(
            session, state, user_text, reply, state.extracted, state.phase, language, wa_message_id, stage=state.stage,
        )
        return TurnResult(
            reply_text=reply, language=language, phase=state.phase, extracted=state.extracted, safety=evaluate(state.extracted),
        )
    if isinstance(pending, dict):
        _clear_referral_name_check(conversation)

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


_BARE_SEVERITY_RE = re.compile(
    r"\s*(?:it'?s\s+|about\s+|around\s+)?\d{1,2}(?:\s*(?:/|out\s+of)\s*10)?\s*[.!]?\s*",
    re.IGNORECASE,
)

_ESCALATION_STAGES = {
    ConversationStage.EMERGENCY_ESCALATION,
    ConversationStage.MEDICAL_ESCALATION,
}


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
    sr_conversation = session.get(Conversation, state.conversation_id)
    sr_flags = ((sr_conversation.booking_context or {}).get(sr.SR_KEY) or {}).get("red_flags") if sr_conversation else None
    if sr_flags and _is_escalated(session, state):
        # Stopped on the red-flag screen (app/triage/self_referral.py): never a booking from here
        sr_reply, sr_buttons = sr.resend_after_stop(user_text)
        sr_stage = state.stage if state.stage in _ESCALATION_STAGES else ConversationStage.MEDICAL_ESCALATION
        save_turn(
            session, state, user_text, sr_reply, state.extracted, phase, language, wa_message_id,
            stage=assert_transition(state.stage, sr_stage),
        )
        return TurnResult(
            reply_text=sr_reply, language=language, phase=phase, extracted=state.extracted,
            blocked_by_safety=True, interactive=sr_buttons,
        )
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
                _set_substate(conversation, AWAITING_RH_PAYMENT_EMAIL, context)
            state.booking_context = context
            state.booking_substate = AWAITING_RH_PAYMENT_EMAIL
            reply = (
                "Your specialist safety review for a couple of minutes is ₦6,000. Where should I send your payment receipt? "
                "Tap WhatsApp is fine to get it here, or reply with your email address."
            )
        elif context.get("amber_review_awaiting_email"):
            email = user_text.strip().casefold()
            if wants_to_type_email(email):
                reply = "Sure. Type the email address you'd like your receipt sent to."
            elif wants_whatsapp_receipt(email):
                reply = _start_paid_amber_review(session, identity, state, email=None)  # receipt here on WhatsApp
            elif not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email) or email.endswith(".invalid"):
                reply = "Please reply with your email address, or tap WhatsApp is fine to get your receipt here."
            else:
                reply = _start_paid_amber_review(session, identity, state, email=email)
        elif context.get("amber_review_id"):
            reply = "Your ₦6,000 specialist review payment is being verified. RH will assign an eligible reviewer and I’ll update you here."
    _audit_turn(session, identity, state.extracted, safety, phase)
    conversation = session.get(Conversation, state.conversation_id)
    target_stage = _stage_for_booking_substate(
        conversation.booking_substate if conversation is not None else None
    ) or ConversationStage.SPECIALIST_REVIEW
    if _is_escalated(session, state) and not _is_specialist_review(session, state):
        # An escalated patient stays in escalation. Replying "ok" after RED or
        # ORANGE guidance used to request SPECIALIST_REVIEW, which the stage
        # machine rejects, so the worker crashed and the patient got nothing.
        target_stage = (
            state.stage
            if state.stage in _ESCALATION_STAGES
            else ConversationStage.EMERGENCY_ESCALATION
            if (safety.risk_level or "").upper() == "RED"
            else ConversationStage.MEDICAL_ESCALATION
        )
    # Conversations created before the booking-state/stage split can retain
    # STORY_CAPTURE even though their persisted booking substate proves they
    # are already in policy or payment. Reconcile only that stale metadata;
    # never manufacture a booking state from a stage value.
    current_stage = state.stage
    if current_stage == ConversationStage.STORY_CAPTURE and conversation is not None and conversation.booking_substate:
        logger.warning(
            "reconciling_legacy_booking_stage conversation_id=%s substate=%s",
            conversation.id,
            conversation.booking_substate,
        )
        conversation.stage = target_stage.value
        current_stage = target_stage
        state.stage = target_stage
    stage = assert_transition(current_stage, target_stage)
    save_turn(
        session, state, user_text, reply, state.extracted, phase, language, wa_message_id,
        stage=stage,
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


def _start_paid_amber_review(session: Session, identity: Identity, state: ConversationState, *, email: str | None) -> str:
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
                    email or whatsapp_receipt_address(mapping.rh_record_id),
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
                review_id, patient_id=mapping.rh_record_id, email=email or whatsapp_receipt_address(mapping.rh_record_id),
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
    _set_substate(conversation, AWAITING_RH_PAYMENT, context)
    state.booking_context = context
    state.booking_substate = AWAITING_RH_PAYMENT
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
    # Every protocol question must match at least one item, or a patient who
    # answers by number is asked the same screen again indefinitely
    # (tests/test_safety_screen_coverage.py). Phrase additions below await
    # clinical-lead review.
    ("New or worsening weakness in your arms or legs", (
        "weakness", "strength", "unable to use", "unable to take", "normal use",
        "lift the arm", "walking, balance", "using your hands",
    )),
    ("New loss of feeling or significant numbness", ("numbness", "tingling", "loss of feeling", "sensation")),
    ("New problems controlling your bladder or bowel", ("bladder", "bowel")),
    ("New numbness around your groin, genitals or anus", ("groin", "genital", "anus", "saddle", "bottom")),
    ("A serious accident, fall or significant injury related to this problem", ("accident", "fall", "injury", "trauma")),
    ("Fever, feeling very unwell, or another significant illness alongside the problem", ("fever", "unwell", "chills", "night sweats", "infection")),
    ("Symptoms getting significantly worse very quickly", (
        "rapid", "worsen", "deteriorat", "worse very quickly", "worse over a short period",
    )),
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


# One short line per warning-sign group. Only the groups the protocol still needs for this
# problem are shown (a knee isn't asked about bladder control), as one question.
_SAFETY_GROUP_COPY = {
    "new_nerve_symptoms": "new weakness, numbness or tingling in your arms or legs",
    "bladder_bowel_or_saddle": "new bladder or bowel problems, or numbness around your groin or bottom",
    "major_injury": "a serious accident or fall that caused this",
    "general_warning_signs": "fever, feeling very unwell, or symptoms getting much worse quickly",
}


def _safety_prompt(extracted: ExtractedTriage, *, include_thanks: bool = True) -> str:
    groups = [name for name, _ in _safety_screen(extracted)] or list(_SAFETY_GROUP_COPY)
    lines = "\n".join(f"• {_SAFETY_GROUP_COPY[group]}" for group in groups)
    prefix = "Thanks. " if include_thanks else ""
    return (
        f"{prefix}One quick safety check before I book. Do you have any of these?\n\n"
        f"{lines}\n\n"
        "Reply No if none, or tell me which."
    )


def _looks_like_numbered_reply(user_text: str) -> bool:
    """Only digits (and separators) are read as item numbers, e.g. an old numbered screen's "1 and 7"."""
    return bool(re.fullmatch(r"[\d\s,;/&.+-]+|(?:\d+\s*(?:,|and|&)\s*)+\d+", (user_text or "").strip().casefold()))


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


_SUMMARY_PREFIX = "Here's what I understood:"
_SUMMARY_ROUNDS_KEY = "summary_rounds"
# A corrected summary is shown again at most this many times; after that Joy carries on, so a
# patient who keeps adding detail (or a model that keeps rewording it) never loops.
_MAX_SUMMARY_REPEATS = 2


def _triage_summary_prompt(extracted: ExtractedTriage, *, updated: bool = False) -> str:
    """One message that both confirms the story and invites anything to change or add.

    It replaces "Is that correct? Reply Yes or No" followed by "Is there anything else…? Reply Yes
    or No": a Yes goes straight to the safety check, anything else is read as a correction.
    """
    summary = confirmation_summary(extracted)
    if summary.startswith(_SUMMARY_PREFIX):
        summary = summary[len(_SUMMARY_PREFIX):].strip()
    opening = "Thanks, I’ve updated that. Here’s what I have now:" if updated else "Thanks. Here’s what I understood:"
    return (
        f"{opening}\n\n"
        f"{summary}\n\n"
        "Reply *Yes* if that’s right, or tell me anything to change or add."
    )


def _additional_details_acknowledgement() -> str:
    """Acknowledge a new detail before the deterministic safety screen."""
    return "Thanks, I’ve added that."


# The summary lines that say what the problem is and when it started. If what the patient saw there
# is no longer true ("left knee" became "right knee", "4 days" became "2 weeks"), that's a correction
# worth showing back. Anything else, including more words added to those lines, is extra detail.
_SUMMARY_MATERIAL_LINES = ("You have", "Started")


def _summary_lines(extracted: ExtractedTriage) -> dict[str, str]:
    lines: dict[str, str] = {}
    for line in confirmation_summary(extracted).splitlines():
        label, colon, value = line.partition(":")
        if colon:
            lines[label.strip()] = " ".join(value.casefold().split())
    return lines


def _summary_change(before: ExtractedTriage, after: ExtractedTriage) -> str:
    """"material" when a shown fact was corrected, "detail" when the summary would only read
    differently in some other way (something added), and "none" when it would read the same."""
    shown, now = _summary_lines(before), _summary_lines(after)
    if any(label in shown and shown[label] not in now.get(label, "") for label in _SUMMARY_MATERIAL_LINES):
        return "material"
    return "detail" if shown != now else "none"


def _summary_reply_words(user_text: str) -> str:
    return " ".join(_normalised_short_reply(user_text).replace(",", " ").split())


_SUMMARY_EXTRA_RE = re.compile(r"\b(?:but|except|however|actually|although|though|also|and|plus|only)\b", re.IGNORECASE)
_SUMMARY_OK_REPLIES = {
    "correct", "right", "exactly", "perfect", "spot on", "all correct", "all good", "fine", "it's fine",
    "nothing", "nothing to change", "nothing to add", "no changes", "no change", "nothing to correct",
}
_SUMMARY_CHANGE_REPLIES = {
    "change something", "change", "change it", "edit", "wrong", "it's wrong", "that's wrong", "incorrect",
    "not right", "that's not right", "it's not right", "not correct", "that's not correct", "it's not correct",
    "not quite", "no change something", "no it's not", "no it isn't", "something's wrong",
    "i want to change something",
}


def _is_bare_summary_confirmation(user_text: str) -> bool:
    """A plain "Yes" (or "that's right", "nothing to change"), with no new detail in it."""
    words = _summary_reply_words(user_text)
    if not words:
        return False
    if words in _SUMMARY_OK_REPLIES or _is_no_further_details(user_text):
        return True
    return _is_summary_confirm(words) and len(words.split()) <= 5 and not _SUMMARY_EXTRA_RE.search(words)


def _is_bare_summary_rejection(user_text: str) -> bool:
    """A plain "No" / "Change something" that doesn't yet say what to change."""
    return _is_simple_no(user_text) or _summary_reply_words(user_text) in _SUMMARY_CHANGE_REPLIES


_QUESTION_START_RE = re.compile(
    r"^\s*(?:how|what|when|where|why|who|which|can|could|do|does|will|would|should|is\s+it|are\s+you)\b",
    re.IGNORECASE,
)


def _is_question(user_text: str) -> bool:
    text = (user_text or "").strip()
    return text.endswith("?") or bool(_QUESTION_START_RE.match(text))


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
        "Thanks. From what you’ve told me so far, the next step is an initial consultation with a clinician.\n\n"
        f"{_present_policy(session, state)}"
    )


def _undo_mistaken_specialist_offer(session: Session, identity: Identity, state: ConversationState) -> bool:
    """Put a patient with no warning signs back on their booking after the old fallback.

    Until Nov 2026 any message a booking step didn't expect offered the paid specialist review
    and marked the triage "specialist_review", so every later reply ("Yes") repeated the offer.
    Only that fallback set "specialist_review_offered"; real AMBER results never do, and a review
    the patient has started (requested or paid) is left alone.
    """
    if not _is_specialist_review(session, state):
        return False
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return False
    context = dict(conversation.booking_context or {})
    if context.get(_TRIAGE_FLOW_KEY) != "specialist_review_offered":
        return False
    if context.get("amber_review_requested") or context.get("amber_review_id"):
        return False
    safety = evaluate(state.extracted)
    if safety.fired or safety.action == "specialist_review" or (safety.risk_level or "").upper() in {"AMBER", "ORANGE", "RED"}:
        return False
    context[_TRIAGE_FLOW_KEY] = "initial_consultation_offered"
    conversation.booking_context = context
    state.booking_context = context
    _set_triage_status(session, state, "summarised")
    append(
        session,
        kind=AuditKind.TRIAGE,
        actor_phone=identity.phone_e164,
        person_id=identity.person_id,
        payload={"event": "mistaken_specialist_offer_undone", "conversation_id": str(conversation.id)},
    )
    return True


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
    if substate == "rh_awaiting_reschedule":
        return ConversationStage.BOOKING_CONFIRMED
    if substate == AWAITING_RH_NAMED_PROVIDER:
        return ConversationStage.SPECIALIST_MATCHING
    if substate in {AWAITING_RH_CONFIRM, AWAITING_RH_OTHER_TIME}:
        return ConversationStage.SLOT_SELECTION
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
    llm=None,
) -> tuple[str | TurnResult, PatientPhase]:
    """The next deterministic step after the story. A TurnResult means the turn was already
    completed and saved (an AMBER result routed to the specialist review), so callers return it."""
    sr_conversation = session.get(Conversation, state.conversation_id)
    sr_context = dict(sr_conversation.booking_context or {}) if sr_conversation is not None else {}
    if sr_conversation is not None and sr.active(sr_context):
        sr_flow = sr_context.get(_TRIAGE_FLOW_KEY)
        if sr_flow in (sr.BOOKING, sr.CARE_TEAM) or sr_conversation.booking_substate:
            # A question part-way through booking: answered from the booking facts
            return booking_step_help(sr_conversation.booking_substate, sr_context, user_text, llm=llm), PatientPhase.POST_TRIAGE
        if sr_flow in (None, sr.REASON):
            if not has_narrative(extracted) and not (extracted.main_complaint or "").strip():
                return candidate_reply, PatientPhase.FIRST_CONTACT
            sr_patient = session.get(Patient, identity.person_id)
            has_area = bool((extracted.body_location or "").strip() or (extracted.body_region or "").strip()) or (
                extracted.condition_area not in (None, ConditionArea.MSK)
            ) or infer_non_msk_area(extracted) is not None
            step = sr.after_story(session, sr_patient, sr_conversation, extracted, has_area=has_area)
            return step.reply, PatientPhase.MID_TRIAGE
    if not has_narrative(extracted):
        return candidate_reply, PatientPhase.FIRST_CONTACT

    patient = session.get(Patient, identity.person_id)
    conversation = session.get(Conversation, state.conversation_id)
    if patient is None or conversation is None:
        return "I need to refresh your consultation details before we continue. Please try again shortly.", PatientPhase.MID_TRIAGE

    # The patient-facing protocol is deliberately deterministic after the
    # opening story: summary (confirm, correct or add, in one message) ->
    # grouped safety screen -> safety-directed booking route.
    # Gemini extracts facts; it never chooses the route.
    context = dict(conversation.booking_context or {})
    flow_state = context.get(_TRIAGE_FLOW_KEY)

    def _after_safety_screen() -> tuple[str, PatientPhase]:
        safety = evaluate(extracted)
        if safety.action == "specialist_review" or (safety.risk_level or "").upper() == "AMBER":
            return _amber_specialist_reply(
                session, identity, state, user_text, extracted, safety, incoming_phase, "en", wa_message_id
            ), PatientPhase.POST_TRIAGE
        return _offer_initial_consultation(session, state, extracted), PatientPhase.POST_TRIAGE

    def _safety_step(acknowledgement: str) -> tuple[str, PatientPhase]:
        """Ask the short safety check, or go straight on when nothing is left to check."""
        context[_TRIAGE_FLOW_KEY] = _AWAITING_SAFETY_SCREEN
        conversation.booking_context = context
        state.booking_context = context
        session.flush()
        if schedule_questions(extracted):
            return f"{acknowledgement}\n\n{_safety_prompt(extracted, include_thanks=False)}", PatientPhase.MID_TRIAGE
        return _after_safety_screen()

    def _show_summary(*, updated: bool) -> tuple[str, PatientPhase]:
        summary = _triage_summary_prompt(extracted, updated=updated)
        _store_summary(session, state, summary)
        context[_TRIAGE_FLOW_KEY] = _AWAITING_SUMMARY_CONFIRMATION
        context[_SUMMARY_ROUNDS_KEY] = int(context.get(_SUMMARY_ROUNDS_KEY) or 0) + 1 if updated else 0
        conversation.booking_context = context
        state.booking_context = context
        session.flush()
        return summary, PatientPhase.POST_TRIAGE

    def _after_summary_text(*, asked_to_change: bool) -> tuple[str, PatientPhase]:
        """Free text after the summary: a correction, extra detail, or a question."""
        change = _summary_change(state.extracted, extracted)
        # After an explicit "No", anything new is worth showing back; otherwise only a corrected fact is.
        worth_showing = change == "material" or (asked_to_change and change == "detail")
        if worth_showing and int(context.get(_SUMMARY_ROUNDS_KEY) or 0) < _MAX_SUMMARY_REPEATS:
            return _show_summary(updated=True)
        if change == "none" and not asked_to_change and _is_question(user_text):
            return (
                "Happy to help with that. First, is my summary above right? "
                "Reply *Yes*, or tell me what to change."
            ), PatientPhase.POST_TRIAGE
        return _safety_step(_additional_details_acknowledgement())

    if flow_state is None:
        return _show_summary(updated=False)

    # One step: "Yes" goes straight to the safety check, "No" asks what to change, and anything else
    # is read as a correction or extra detail. Conversations that saw the old "Is that correct? Reply
    # Yes or No" wording land here too, and their Yes/No still mean the same.
    if flow_state == _AWAITING_SUMMARY_CONFIRMATION:
        if _is_bare_summary_rejection(user_text):
            context[_TRIAGE_FLOW_KEY] = _AWAITING_SUMMARY_CORRECTION
            conversation.booking_context = context
            state.booking_context = context
            session.flush()
            return "No problem. What should I change or add?", PatientPhase.POST_TRIAGE
        if _is_bare_summary_confirmation(user_text):
            return _safety_step("Great, thanks.")
        return _after_summary_text(asked_to_change=False)

    if flow_state == _AWAITING_SUMMARY_CORRECTION:
        # "Nothing" / "it's fine" here means the summary was right after all.
        if _is_bare_summary_confirmation(user_text) or _is_simple_no(user_text):
            return _safety_step("Thanks.")
        return _after_summary_text(asked_to_change=True)

    # The two states below come from the older two-question flow. New conversations never enter
    # them, but a patient who was mid-way when it changed still finishes the same way.
    if flow_state == _AWAITING_ADDITIONAL_DETAILS:
        if _is_simple_yes(user_text):
            context[_TRIAGE_FLOW_KEY] = _COLLECTING_ADDITIONAL_DETAILS
            conversation.booking_context = context
            state.booking_context = context
            session.flush()
            return "Please tell me anything else you think is important.", PatientPhase.POST_TRIAGE
        if not (_is_simple_no(user_text) or _is_no_further_details(user_text)):
            return _safety_step(_additional_details_acknowledgement())
        return _safety_step("Thanks — I’ve got everything you wanted to share.")

    if flow_state == _COLLECTING_ADDITIONAL_DETAILS:
        return _safety_step(_additional_details_acknowledgement())

    if flow_state == _AWAITING_SAFETY_SCREEN:
        if schedule_questions(extracted):
            return _safety_prompt(extracted), PatientPhase.MID_TRIAGE
        return _after_safety_screen()

    # Existing in-flight legacy conversations still complete safely. New
    # conversations never enter this branch because V1 sets the state above.
    booking_reply = handle_booking_turn(
        session, state, patient, extracted, user_text, paystack=paystack,
    )
    if booking_reply is not None:
        return booking_reply, PatientPhase.POST_TRIAGE
    safety = evaluate(extracted)
    if safety.action == "specialist_review" or (safety.risk_level or "").upper() == "AMBER":
        return _offer_specialist_triage_review(session, state), PatientPhase.POST_TRIAGE
    # A question the current step wasn't waiting for ("What if I need a home visit?" while a
    # payment link is open). This used to offer the paid specialist review to everyone.
    conversation = session.get(Conversation, state.conversation_id)
    return booking_step_help(
        conversation.booking_substate if conversation is not None else None,
        dict(conversation.booking_context or {}) if conversation is not None else {},
        user_text,
        llm=llm,
    ), PatientPhase.POST_TRIAGE


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
    # A request for a person must still reach the care team when the normal turn failed.
    if is_human_request(user_text) and not flags_from_triage_text(user_text):
        reply = human_request_reply(session, identity, session.get(Conversation, state.conversation_id), user_text)
        save_turn(
            session, state, user_text, reply, state.extracted, state.phase, language, wa_message_id, stage=state.stage,
        )
        return TurnResult(reply_text=reply, language=language, phase=state.phase, extracted=state.extracted)
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
    if isinstance(reply, TurnResult):
        return reply
    if not reply.strip():
        # With no story yet there is nothing deterministic to continue, and the
        # model's wording is unavailable. Never send an empty WhatsApp message.
        reply = "Sorry, I had a brief hiccup. Please send that again in a moment."
    append(
        session,
        kind=AuditKind.TRIAGE,
        actor_phone=identity.phone_e164,
        person_id=identity.person_id,
        payload={"event": "provider_unavailable_stateful_recovery", "phase": phase.value},
    )
    save_turn(session, state, user_text, reply, extracted, phase, language, wa_message_id)
    return TurnResult(reply_text=reply, language=language, phase=phase, extracted=extracted, safety=safety)


def _physio_patient_only_turn(
    session: Session,
    identity: Identity,
    user_text: str,
    wa_message_id: str | None,
    language: str,
    *,
    rh_mapping: RHIdentityMapping | None,
    physio: Physiotherapist | None,
    media: list[str] | None = None,
    llm: LLMClient | None = None,
    paystack=None,
) -> TurnResult:
    """Joy is for patients (owner, 2026-11-07): a physio can only answer a booking request here.

    "ACCEPT <booking ID>" / "REJECT <booking ID>" still reach RH, so the 2-hour accept window
    works from WhatsApp. An old WhatsApp physio sign-up that is really a patient can still switch
    (app/identity/role_switch.py), and "call me" still reaches the team. Anything else (sign-up,
    availability, notes, payouts, visits) points to the dashboard.
    """
    from app.config import get_settings

    state = load(session, identity)
    reply: str | None = None
    text = user_text or ""
    if _PHYSIO_BOOKING_REPLY_RE.fullmatch(text) and rh_mapping is not None and rh_mapping.rh_user_id:
        if get_settings().rh_physio_operations_enabled:
            try:
                reply = apply_rh_physio_operation(
                    configured_rh_client(), profile_id=rh_mapping.rh_record_id,
                    actor=RHActor(persona="physiotherapist", sender_phone=identity.phone_e164, rh_user_id=rh_mapping.rh_user_id),
                    text=text.strip(),
                )
            except RHIntegrationError:
                reply = (
                    "I can’t reach Rehabify right now. Please try again shortly, or answer the "
                    "booking from your dashboard."
                )
    elif rh_mapping is None and physio is not None and _LEGACY_PHYSIO_ANSWER_RE.search(text):
        reply = apply_physio_reply(session, physio.id, text, session.get(Conversation, state.conversation_id))
    if reply is None and physio is not None and llm is not None:
        switched = _physio_role_switch_turn(
            session, identity, physio, state, session.get(Conversation, state.conversation_id), user_text,
            media, language, wa_message_id, llm, paystack,
        )
        if switched is not None:
            return switched
    if reply is None and is_human_request(text):
        reply = human_request_reply(session, identity, session.get(Conversation, state.conversation_id), text)
    reply = reply or PHYSIO_USE_DASHBOARD_REPLY
    save_turn(
        session, state, user_text, reply, ExtractedTriage(), PatientPhase.FIRST_CONTACT, language, wa_message_id,
    )
    return TurnResult(reply_text=reply, language=language, phase=PatientPhase.FIRST_CONTACT)


def _persona_reply(
    session: Session,
    state: ConversationState,
    user_text: str,
    reply: str,
    language: str,
    wa_message_id: str | None,
    *,
    interactive: dict | None = None,
) -> TurnResult:
    """Save and return a code-owned reply for a persona with no triage (physio, family, partner)."""
    save_turn(session, state, user_text, reply, ExtractedTriage(), PatientPhase.FIRST_CONTACT, language, wa_message_id)
    return TurnResult(reply_text=reply, language=language, phase=PatientPhase.FIRST_CONTACT, interactive=interactive)


def _switch_physio_to_patient(
    session: Session,
    identity: Identity,
    physio: Physiotherapist,
    user_text: str,
    carry_on_text: str,
    language: str,
    wa_message_id: str | None,
    llm: LLMClient,
    paystack=None,
) -> TurnResult:
    """Remove an unverified physio sign-up and carry on as a patient on the same number.

    Only the physio identity and its own chat go (app/ops/reset_phone.remove_physio_identity); a
    patient record already on this number is reused as it is. A message that already said what's
    wrong is handled as the patient's first message, so safety runs on it straight away.
    """
    from app.ops.reset_phone import remove_physio_identity

    phone = identity.phone_e164
    remove_physio_identity(session, physio)
    append(session, kind=AuditKind.IDENTITY, actor_phone=phone, person_id=None,
           payload={"decision": "role_switched", "from": Persona.PHYSIO.value, "to": Persona.PATIENT.value})
    patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone))
    if patient is None:
        patient = Patient(phone_e164=phone)
        session.add(patient)
        session.flush()
    if carry_on_text.strip():
        result = handle_turn(session, phone, carry_on_text, llm, wa_message_id, paystack=paystack)
        if result.blocked_by_safety:
            return result  # urgent advice leads, with nothing in front of it
        return result.model_copy(update={"reply_text": f"{SWITCHED_PREFIX}\n\n{result.reply_text}"})
    patient_identity = Identity(persona=Persona.PATIENT, person_id=patient.id, phone_e164=phone)
    state = load(session, patient_identity)
    reply = SWITCHED_WELCOME if not has_narrative(state.extracted) else f"{SWITCHED_PREFIX} How can I help today?"
    save_turn(
        session, state, user_text, reply, state.extracted, state.phase, language, wa_message_id, stage=state.stage,
    )
    return TurnResult(reply_text=reply, language=language, phase=state.phase, extracted=state.extracted)


def _fresh_patient(session: Session, patient: Patient, state: ConversationState) -> bool:
    """Nothing to lose by starting physio sign-up on this number: no story, booking or Rehabify account."""
    context = state.booking_context or {}
    if has_narrative(state.extracted) or state.booking_substate or context.get("rh_booking_id"):
        return False
    if patient.signup_completed_at is not None:
        return False
    if session.scalar(select(Booking.id).where(Booking.patient_id == patient.id).limit(1)) is not None:
        return False
    return session.scalar(select(RHIdentityMapping.id).where(
        RHIdentityMapping.persona == Persona.PATIENT.value, RHIdentityMapping.joy_person_id == patient.id,
    ).limit(1)) is None


def _patient_says_physio_reply(
    session: Session, identity: Identity, state: ConversationState, user_text: str, media: list[str] | None,
) -> str:
    """A patient saying they're a physiotherapist.

    A number that only said hello so far starts WhatsApp physio sign-up, as a new number saying "I'm a
    physio" does; its empty patient record is kept, not deleted, and "I'm a patient" switches back.
    Anyone with a story, a booking or a Rehabify account (or a PT that RH couldn't verify, which never
    creates a local physio) gets the website sign-up link, and their patient record is left alone.
    """
    if get_settings().joy_patient_only:
        # Joy is for patients: point to the website, and the patient record stays as it is
        return PHYSIO_SIGN_UP_REPLY
    patient = session.get(Patient, identity.person_id)
    if (user_text or "").strip().upper() == "PT" or patient is None or not _fresh_patient(session, patient, state):
        return PHYSIO_SIGNUP_REPLY
    physio = Physiotherapist(phone_e164=patient.phone_e164)
    session.add(physio)
    session.flush()
    append(session, kind=AuditKind.IDENTITY, actor_phone=patient.phone_e164, person_id=physio.id,
           payload={"decision": "role_switched", "from": Persona.PATIENT.value, "to": Persona.PHYSIO.value})
    onboarding = apply_onboarding_turn(session, physio, user_text, media)
    return f"{PHYSIO_START_PREFIX} {onboarding}\n\n{PHYSIO_ESCAPE_HINT}"


def _physio_role_switch_turn(
    session: Session,
    identity: Identity,
    physio: Physiotherapist,
    state: ConversationState,
    conversation: Conversation | None,
    user_text: str,
    media: list[str] | None,
    language: str,
    wa_message_id: str | None,
    llm: LLMClient,
    paystack=None,
) -> TurnResult | None:
    """Someone in physio sign-up who is really a patient (app/identity/role_switch.py).

    None means carry on as a physio. A verified physio, one in review or one with bookings or
    payouts is never switched: an "I'm a patient" from them gets a pointer to the team instead.
    """
    if conversation is None:
        return None
    text = user_text or ""
    if not is_switchable_physio(session, physio):
        if is_patient_statement(text):
            return _persona_reply(session, state, user_text, PHYSIO_LOCKED_REPLY, language, wa_message_id)
        return None
    context = dict(conversation.booking_context or {})
    pending = context.get(ROLE_CHECK_KEY) if isinstance(context.get(ROLE_CHECK_KEY), dict) else None
    choice = role_choice(text) if pending is not None else None
    if choice == "patient":
        return _switch_physio_to_patient(
            session, identity, physio, user_text, str(pending.get("text") or ""), language, wa_message_id, llm, paystack,
        )
    if choice == "physio":
        context.pop(ROLE_CHECK_KEY, None)
        conversation.booking_context = context
        if get_settings().joy_patient_only:
            # No physio sign-up on WhatsApp any more: the website
            return _persona_reply(session, state, user_text, PHYSIO_SIGN_UP_REPLY, language, wa_message_id)
        reply = f"{STAY_PHYSIO_PREFIX} {apply_onboarding_turn(session, physio, '', media)}"
        return _persona_reply(session, state, user_text, reply, language, wa_message_id)
    if is_patient_statement(text):
        carry_on = text if carries_patient_story(text) else ""
        return _switch_physio_to_patient(
            session, identity, physio, user_text, carry_on, language, wa_message_id, llm, paystack,
        )
    if is_onboarding_content(text, media):
        if pending is not None:
            context.pop(ROLE_CHECK_KEY, None)
            conversation.booking_context = context
        return None
    red_flags = bool(flags_from_triage_text(text))
    if is_human_request(text) and not red_flags:
        return None  # the physio path alerts the team
    patient_like = red_flags or writes_like_patient(text)
    if not (patient_like or is_restart_request(text) or pending is not None):
        return None
    # Keep the message that sounded like a patient, so "Patient" can carry on with it
    context[ROLE_CHECK_KEY] = {"text": (text if patient_like else str((pending or {}).get("text") or ""))[:1000]}
    conversation.booking_context = context
    return _persona_reply(
        session, state, user_text, ROLE_QUESTION_RED_FLAG if red_flags else ROLE_QUESTION, language, wa_message_id,
        interactive=reply_buttons(("patient", "I'm a patient"), ("physio", "I'm a physio")),
    )


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
    if get_settings().joy_patient_only:
        return _physio_patient_only_turn(
            session, identity, user_text, wa_message_id, language, rh_mapping=rh_mapping, physio=physio,
            media=media, llm=llm, paystack=paystack,
        )
    if rh_mapping is not None and rh_mapping.rh_user_id and get_settings().rh_physio_operations_enabled:
        state = load(session, identity)
        if is_human_request(user_text):
            reply = human_request_reply(session, identity, session.get(Conversation, state.conversation_id), user_text)
        else:
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
    switched = _physio_role_switch_turn(
        session, identity, physio, state, conversation, user_text, media, language, wa_message_id, llm, paystack,
    )
    if switched is not None:
        return switched
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
    # "Call me" reaches the team from a physio too. After the commands above, so a session note or
    # an answer for a family ("ask her to call me back") is never taken as a request.
    if reply is None and is_human_request(user_text):
        reply = human_request_reply(session, identity, conversation, user_text)
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
    # "Call me" from a family member reaches the care team (the reply carries the 112 line), even
    # when it mentions warning signs: family turns have no triage, so a person is the right next step.
    # "Ask the physio to call me" is a question for the physio, which the relay below sends on.
    if is_human_request(user_text) and not is_relay_ask(user_text):
        family_state = load(session, identity)
        conversation = session.get(Conversation, family_state.conversation_id)
        return _persona_reply(
            session, family_state, user_text, human_request_reply(session, identity, conversation, user_text),
            mirror_language(user_text, family_state.last_known_language), wa_message_id,
        )
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
    # A message carrying a phone number is a referral ("please call 0803…"), which the partner flow owns
    if is_human_request(user_text) and not _PARTNER_PHONE_RE.search(user_text or ""):
        conversation = session.get(Conversation, state.conversation_id)
        return _persona_reply(
            session, state, user_text, human_request_reply(session, identity, conversation, user_text),
            language, wa_message_id,
        )
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


_SR_STAGES = {
    "safety_screen": ConversationStage.SAFETY_SCREEN,
    "matching": ConversationStage.SPECIALIST_MATCHING,
    "summary": ConversationStage.TRIAGE_SUMMARY,
}


def _alert_care_team(patient: Patient, reason: str, text: str) -> None:
    """A bell and push for Rehabify's admins (RH patient_request_callback). Never raises."""
    try:
        from sqlalchemy.orm import object_session

        session = object_session(patient)
        rh_patient_id = _booking_rh_patient_id(session, patient) if session is not None else None
        if not rh_patient_id:
            return
        configured_rh_client().operational_mutation(
            "patient_request_callback",
            actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id),
            data={"patient_id": rh_patient_id, "reason": reason, "text": text[:200]},
            idempotency_key=f"joy-{reason}-{patient.id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H')}",
        )
    except Exception:
        logger.warning("joy_care_team_alert_failed reason=%s", reason, exc_info=True)


def _booking_rh_patient_id(session: Session, patient: Patient) -> str | None:
    from app.booking.booking_flow import _rh_patient_id

    return _rh_patient_id(session, patient)


def _self_referral_turn(
    session: Session,
    identity: Identity,
    state: ConversationState,
    user_text: str,
    phase: PatientPhase,
    language: str,
    wa_message_id: str | None,
    *,
    location: tuple[float, float] | None = None,
) -> TurnResult | str | None:
    """Run one self-referral step. A TurnResult is the reply; a string is the story to read now."""
    patient = session.get(Patient, identity.person_id)
    conversation = session.get(Conversation, state.conversation_id)
    if patient is None or conversation is None or conversation.human_takeover:
        return None
    context = conversation.booking_context or {}
    step = context.get(_TRIAGE_FLOW_KEY)
    if sr.SR_KEY not in context:
        fresh = (
            step is None
            and not conversation.booking_substate
            and not has_narrative(state.extracted)
            and state.stage == ConversationStage.STORY_CAPTURE
        )
        if not fresh:
            return None  # a conversation started before the switch keeps the older flow
        result = sr.start(session, patient, conversation, user_text, is_greeting=_is_greeting_only(user_text))
    elif step in sr.FRONT_STEPS:
        result = sr.front_turn(
            session, patient, conversation, user_text,
            detected_language=mirror_language(user_text, None), location=location,
        )
    elif step in (sr.AREA, sr.RED_FLAGS, sr.QUESTIONS, sr.TIMING, sr.CARE_TEAM):
        result = sr.triage_turn(session, patient, conversation, state.extracted, user_text)
    elif step == sr.BOOKING and not conversation.booking_substate:
        # Matching couldn't run last time (Rehabify unreachable): try again
        result = sr.Step(
            "outcome", extracted=state.extracted,
            urgent=(context.get(sr.SR_KEY) or {}).get("outcome") == "urgent", stage="matching",
            window=(context.get(sr.SR_KEY) or {}).get("window"),
        )
    else:
        return None
    if result is None:
        return None
    if result.kind == "story":
        return result.story
    language = result.language or patient.preferred_language or language
    extracted = result.extracted or state.extracted

    if result.kind == "safety":
        return _safety_fire_reply(
            session, identity, state, user_text, extracted, result.safety, phase, language, wa_message_id,
        )
    if result.kind == "red_flag":
        safety = result.safety
        notified = notify_family_on_safety(session, identity.person_id, safety)
        _set_triage_status(session, state, "escalated")
        route_safety(session, safety, {"patient_id": str(identity.person_id)})
        _alert_care_team(patient, "red_flag", safety.reason_plain_language)
        _audit_turn(session, identity, extracted, safety, PatientPhase.MID_TRIAGE, notify_family=notified)
        stage = (
            ConversationStage.EMERGENCY_ESCALATION
            if (safety.risk_level or "").upper() == "RED"
            else ConversationStage.MEDICAL_ESCALATION
        )
        save_turn(
            session, state, user_text, result.reply, extracted, PatientPhase.MID_TRIAGE, language,
            wa_message_id, stage=assert_transition(state.stage, stage),
        )
        return TurnResult(
            reply_text=result.reply, language=language, phase=PatientPhase.MID_TRIAGE, extracted=extracted,
            safety=safety, blocked_by_safety=True, interactive=result.interactive,
        )
    if result.kind == "outcome":
        _set_triage_status(session, state, "summarised")
        # A routine outcome was already said with "When are you free?"; urgent goes straight to times
        intro = "" if (result.window and not result.urgent) else sr.outcome_text(result.urgent)
        reply, before = offer_named_physios(
            session, conversation, patient, extracted, urgent=result.urgent,
            language=patient.preferred_language or language, intro=intro, window=result.window,
            physio_sex=((conversation.booking_context or {}).get(sr.SR_KEY) or {}).get("physio_pref"),
        )
        current = session.get(Conversation, state.conversation_id)
        flow = (current.booking_context or {}).get(_TRIAGE_FLOW_KEY) if current is not None else None
        target = _stage_for_booking_substate(current.booking_substate if current is not None else None) or (
            ConversationStage.TRIAGE_SUMMARY if flow == sr.CARE_TEAM else state.stage
        )
        texts = [item["text"] for item in before if item.get("text")]
        save_turn(
            session, state, user_text, "\n\n".join([*texts, reply]), extracted, PatientPhase.POST_TRIAGE,
            language, wa_message_id, stage=assert_transition(state.stage, target),
        )
        return TurnResult(
            reply_text=reply, language=language, phase=PatientPhase.POST_TRIAGE, extracted=extracted,
            before=before or None,
        )
    # A plain reply for this step
    in_front = sr.current_step(session.get(Conversation, state.conversation_id)) in (*sr.FRONT_STEPS, sr.REASON)
    target = _SR_STAGES.get(result.stage or "") or state.stage
    out_phase = (
        PatientPhase.FIRST_CONTACT if in_front
        else PatientPhase.POST_TRIAGE if target == ConversationStage.TRIAGE_SUMMARY
        else PatientPhase.MID_TRIAGE
    )
    save_turn(
        session, state, user_text, result.reply, extracted, out_phase, language, wa_message_id,
        stage=assert_transition(state.stage, target),
    )
    return TurnResult(
        reply_text=result.reply, language=language, phase=out_phase, extracted=extracted,
        interactive=result.interactive, before=result.before or None,
    )


def _price_question_turn(
    session: Session,
    identity: Identity,
    state: ConversationState,
    user_text: str,
    language: str,
    wa_message_id: str | None,
    llm: LLMClient,
    *,
    paystack=None,
    media: list[str] | None = None,
    location: tuple[float, float] | None = None,
) -> TurnResult:
    """Answer what care costs (app/conversation/pricing.py), then carry on with the step they're on.

    The answer is its own message, sent first. A first message (the landing page's "Ask Joy about
    pricing") then starts the chat the way "Hi" does, a message that also says what's wrong goes
    on through the normal turn, and otherwise the question they were last asked is asked again.
    """
    answer, topic = price_answer(user_text)
    if topic == "hmo":
        try:
            route_escalation(session, "insurance", {
                "phone": identity.phone_e164, "patient_id": str(identity.person_id), "text": (user_text or "")[:200],
            })
        except Exception:
            logger.warning("joy_insurance_admin_alert_failed", exc_info=True)
    append(session, kind=AuditKind.TRIAGE, actor_phone=identity.phone_e164, person_id=identity.person_id,
           payload={"decision": "price_question_answered", "topic": topic})
    return _answer_then_continue(
        session, identity, state, user_text, answer, language, wa_message_id, llm,
        paystack=paystack, media=media, location=location,
    )


CAPABILITIES_REPLY = (
    "Here's what I can help with:\n\n"
    "• Find a licensed physiotherapist who fits your problem, and book an online consultation\n"
    "• Answer questions about prices and how booking works\n"
    "• Remind you about your appointments\n"
    "• Once your physiotherapist sets your plan: daily exercise reminders, check-ins, and answers about your plan\n"
    "• Pass you to a person on our care team: just say *talk to someone*\n\n"
    "I don't give a diagnosis or emergency care. In an emergency, call 112."
)
_CAPABILITIES_RE = re.compile(
    r"\bwhat\s+(?:else\s+)?(?:can|do)\s+you\s+(?:do|help\s+(?:me\s+)?with|offer)\b"
    r"|\bwhat\s+(?:else\s+)?(?:are\s+you\s+able\s+to|can\s+joy)\s+do\b"
    r"|\bhow\s+(?:else\s+)?can\s+you\s+help\b|\bwhat\s+(?:services|else)\s+do\s+you\s+(?:have|offer|do)\b"
    r"|\bwhat\s+(?:is|are)\s+your\s+(?:services|features)\b|^\s*(?:help|menu|options)\s*[.?!]*\s*$",
    re.IGNORECASE,
)


def is_capabilities_question(text: str | None) -> bool:
    return len(text or "") <= 160 and bool(_CAPABILITIES_RE.search(text or ""))


def _answer_then_continue(
    session: Session,
    identity: Identity,
    state: ConversationState,
    user_text: str,
    answer: str,
    language: str,
    wa_message_id: str | None,
    llm: LLMClient,
    *,
    paystack=None,
    media: list[str] | None = None,
    location: tuple[float, float] | None = None,
) -> TurnResult:
    """Answer the question first, then the step they're on (spec, technical notes: "answer the
    question the patient asked, then repeat the current step's question")."""
    carries_story = looks_like_symptom(user_text)
    if carries_story or not state.recent_messages:
        result = handle_turn(
            session, identity.phone_e164, user_text if carries_story else "Hi", llm, wa_message_id,
            paystack=paystack, media=media, location=location, price_answered=True,
        )
        if result.blocked_by_safety or (result.safety is not None and result.safety.fired):
            return result  # urgent advice leads, with nothing in front of it
        put_before_last_joy_message(
            session, state.conversation_id, answer, user_text=None if carries_story else user_text,
        )
        return result.model_copy(update={"before": [{"text": answer}, *(result.before or [])]})
    question = last_joy_text(session, state.conversation_id)
    save_turn(
        session, state, user_text, answer, state.extracted, state.phase, language, wa_message_id, stage=state.stage,
    )
    if not question:
        return TurnResult(reply_text=answer, language=language, phase=state.phase, extracted=state.extracted)
    add_joy_message(session, state.conversation_id, question)
    conversation = session.get(Conversation, state.conversation_id)
    return TurnResult(
        reply_text=question, language=language, phase=state.phase, extracted=state.extracted,
        before=[{"text": answer}],
        interactive=interactive_for(conversation) or sr.step_interactive(conversation),
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
    price_answered: bool = False,
) -> TurnResult:
    identity = resolve(session, phone)
    # `PT` is discovery, never local physiotherapist provisioning. RH's exact
    # verified phone lookup is the only way an unknown sender enters this flow.
    # A physio answering Joy's booking request ("ACCEPT <booking ID>") may never have written to
    # Joy before, or may also be a patient here: RH verifies the number before anything is applied.
    physio_reply = bool(_PHYSIO_BOOKING_REPLY_RE.fullmatch(user_text or ""))
    pt_discovery = (user_text or "").strip().upper() == "PT"
    if pt_discovery and get_settings().joy_patient_only and (identity is None or identity.persona == Persona.PATIENT):
        # Joy is for patients: no physio discovery here, and a patient record stays as it is
        return TurnResult(reply_text=PHYSIO_SIGN_UP_REPLY, language="en", phase=PatientPhase.FIRST_CONTACT)
    # A physio who knows the old "reply PT" may already be a patient here (a "Hi" first), so PT from
    # a patient is checked with RH too (unverified, it gets the sign-up link below).
    if (pt_discovery or physio_reply) and (identity is None or identity.persona == Persona.PATIENT):
        fallback_identity = identity
        try:
            resolved = configured_rh_client().resolve_physiotherapist(
                phone, RHActor(persona="physiotherapist", sender_phone=phone)
            )
        except RHIntegrationError:
            resolved = None
            if fallback_identity is None:
                return TurnResult(reply_text="I can’t verify physiotherapist access right now. Please try again shortly.", language="en", phase=PatientPhase.FIRST_CONTACT)
        if resolved is None or resolved.resolution != "MATCH" or not resolved.physiotherapist_id or not resolved.rh_user_id:
            if fallback_identity is None:
                return TurnResult(
                    reply_text=(
                        "This WhatsApp number isn't linked to a verified Rehabify physiotherapist account yet. "
                        f"To join, sign up here: {PHYSIO_SIGNUP_URL}\n\nIf you need care yourself, just tell me what's going on."
                    ),
                    language="en", phase=PatientPhase.FIRST_CONTACT,
                )
        else:
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
    sr_patient = session.get(Patient, identity.person_id) if identity.persona == Persona.PATIENT else None
    if sr_patient is not None and sr.enabled() and sr_patient.preferred_language:
        language = sr_patient.preferred_language

    # "Hi Joy, connect me: CODE": the link their physio or clinic sent (app/conversation/companion.py)
    care_now: dict | None = None
    if sr_patient is not None:
        care_conversation = session.get(Conversation, state.conversation_id)
        connected = connect_turn(session, sr_patient, care_conversation, user_text)
        if connected is not None:
            connect_text, connect_buttons = connected
            save_turn(
                session, state, user_text, connect_text, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=connect_text, language=language, phase=state.phase,
                extracted=state.extracted, interactive=connect_buttons,
            )
        # Already in care with a physio: Joy is their companion, not a new-patient intake
        care_now = in_care(session, sr_patient, care_conversation)

    # A shared WhatsApp location pin (often from the "Send location" button)
    if identity.persona == Persona.PATIENT and location is not None:
        pin_patient = session.get(Patient, identity.person_id)
        if pin_patient is not None and not (
            sr.enabled() and sr.front_pending(pin_patient, session.get(Conversation, state.conversation_id))
        ):
            pin_text, pin_reply = location_pin_turn(
                session, session.get(Conversation, state.conversation_id), pin_patient,
                location[0], location[1], has_story=has_narrative(state.extracted),
            )
            if pin_reply is not None:
                save_turn(
                    session, state, "[Shared location]", pin_reply, state.extracted, state.phase,
                    language, wa_message_id, stage=state.stage,
                )
                return TurnResult(reply_text=pin_reply, language=language, phase=state.phase, extracted=state.extracted)
            user_text = pin_text or user_text

    # Pain and progress check-ins for the physio ("check in"; app/conversation/check_in.py).
    # Before the reminder commands so "stop" ends a check-in rather than the reminders.
    if identity.persona == Persona.PATIENT:
        check_in = check_in_turn(session, identity, session.get(Conversation, state.conversation_id), user_text)
        if check_in is not None:
            check_in_text, check_in_buttons = check_in
            save_turn(
                session, state, user_text, check_in_text, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=check_in_text, language=language, phase=state.phase,
                extracted=state.extracted, interactive=check_in_buttons,
            )

    # Exercise reminder settings work in any state: STOP / PAUSE / START / "remind me at 7am"
    if identity.persona == Persona.PATIENT and len(user_text or "") <= 60:
        reminder_patient = session.get(Patient, identity.person_id)
        reminder_reply = reminder_command(session, reminder_patient, user_text) if reminder_patient is not None else None
        if reminder_reply is not None:
            save_turn(
                session, state, user_text, reminder_reply, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(reply_text=reminder_reply, language=language, phase=state.phase, extracted=state.extracted)

    # A greeting contains no clinical narrative. Handle it locally so Gemini
    # cannot turn “hey Joy” into a misleading acknowledgement that implies the
    # person has already described a problem.
    if (
        identity.persona == Persona.PATIENT
        and state.phase == PatientPhase.FIRST_CONTACT
        and not has_narrative(state.extracted)
        and _is_greeting_only(user_text)
        and not sr.enabled()
        and care_now is None
    ):
        # With the sign-up form set up, the welcome carries a "Get started" button for it.
        # It never blocks typing: the patient can just describe the problem instead.
        welcome_patient = session.get(Patient, identity.person_id)
        form = (
            signup_interactive(state.conversation_id, identity.phone_e164)
            if welcome_patient is not None and welcome_patient.signup_completed_at is None
            else None
        )
        welcome = WELCOME_WITH_FORM if form else _FIRST_CONTACT_WELCOME
        save_turn(
            session,
            state,
            user_text,
            welcome,
            state.extracted,
            PatientPhase.FIRST_CONTACT,
            language,
            wa_message_id,
            stage=ConversationStage.STORY_CAPTURE,
        )
        return TurnResult(
            reply_text=welcome,
            language=language,
            phase=PatientPhase.FIRST_CONTACT,
            extracted=state.extracted,
            interactive=form,
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

    # "Call me" / "I want to talk to someone": alert the care team (app/conversation/human_request.py).
    # Before the safety resend, so an escalated patient's request still reaches a person; a message
    # that also describes warning signs goes to the safety engine instead.
    if (
        identity.persona == Persona.PATIENT
        and is_human_request(user_text)
        and not flags_from_triage_text(user_text)
    ):
        callback_reply = human_request_reply(
            session, identity, session.get(Conversation, state.conversation_id), user_text,
        )
        save_turn(
            session, state, user_text, callback_reply, state.extracted, state.phase,
            language, wa_message_id, stage=state.stage,
        )
        return TurnResult(reply_text=callback_reply, language=language, phase=state.phase, extracted=state.extracted)

    # "Are you a real person?" gets an honest answer and the way to reach one; "I'm a physio" (or PT
    # that RH couldn't verify above) gets the physio sign-up link. Neither changes the patient's
    # record or the step they're on, and a message with warning signs goes on to the safety engine.
    if identity.persona == Persona.PATIENT and not flags_from_triage_text(user_text):
        # A patient under safety escalation or review keeps getting that guidance instead
        safety_hold = _is_escalated(session, state) or _is_specialist_review(session, state)
        role_reply = (
            BOT_REPLY if is_bot_question(user_text)
            else _patient_says_physio_reply(session, identity, state, user_text, media)
            if patient_says_physio(user_text) and not safety_hold
            else None
        )
        if role_reply is not None:
            save_turn(
                session, state, user_text, role_reply, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(reply_text=role_reply, language=language, phase=state.phase, extracted=state.extracted)

    referral_turn = _verified_referral_turn(
        session, identity, state, user_text, language, wa_message_id
    )
    if referral_turn is not None:
        return referral_turn
    if identity.persona == Persona.PATIENT:
        apply_inbound_code(session, identity.person_id, user_text)
        _maybe_route_off_platform(session, user_text, patient_id=identity.person_id)
    phase = decide_phase(state)
    _undo_mistaken_specialist_offer(session, identity, state)
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

    # Emergency symptoms the patient volunteers are checked deterministically
    # on every patient message, before summary, safety-screen or booking
    # logic. Gemini's own flags are discarded by design, so without this an
    # opening "chest pain" would wait behind summary confirmation.
    if identity.persona == Persona.PATIENT:
        volunteered = detect_volunteered_red_flags(user_text)
        if volunteered:
            flagged = merge_extraction(state.extracted, {"flags": volunteered})
            flagged = _record_fact_sources(flagged, wa_message_id)
            volunteered_safety = evaluate(flagged)
            if volunteered_safety.fired:
                return _safety_fire_reply(
                    session, identity, state, user_text, flagged,
                    volunteered_safety, phase, language, wa_message_id,
                )

    # "What else can you do?" at any step, booking steps included: what Joy does, then the step again
    if identity.persona == Persona.PATIENT and not price_answered and is_capabilities_question(user_text):
        append(session, kind=AuditKind.TRIAGE, actor_phone=identity.phone_e164, person_id=identity.person_id,
               payload={"decision": "capabilities_answered"})
        return _answer_then_continue(
            session, identity, state, user_text, CAPABILITIES_REPLY, language, wa_message_id, llm,
            paystack=paystack, media=media, location=location,
        )

    # "How much will it cost?" at any step: answered in code from Rehabify's live prices, then the
    # step carries on (app/conversation/pricing.py). Booking steps answer it from the booking's own
    # price (app/booking/step_help.py). After the safety checks above, so warning signs lead.
    if (
        identity.persona == Persona.PATIENT
        and not price_answered
        and not state.booking_substate
        and is_price_question(user_text)
    ):
        return _price_question_turn(
            session, identity, state, user_text, language, wa_message_id, llm,
            paystack=paystack, media=media, location=location,
        )

    # A patient in care: the greeting menu, "message my physio", "book a visit" with their own physio
    # or clinic. Exercises, DONE, dashboard and LINK still go to their own handlers below.
    if identity.persona == Persona.PATIENT and care_now is not None:
        companion = companion_turn(
            session, sr_patient, session.get(Conversation, state.conversation_id), user_text,
            is_greeting=_is_greeting_only(user_text), offer_free_text=False,
        )
        if companion is not None:
            companion_text, companion_buttons = companion
            save_turn(
                session, state, user_text, companion_text, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=companion_text, language=language, phase=state.phase,
                extracted=state.extracted, interactive=companion_buttons,
            )

    # Self-referral: language, consent, profile, red flags, questions, named physios
    # (app/triage/self_referral.py; the owner's guide). The story itself goes to the model below.
    # Not for a patient in care (above), unless they asked for someone new.
    if identity.persona == Persona.PATIENT and sr.enabled() and care_now is None:
        sr_turn = _self_referral_turn(
            session, identity, state, user_text, phase, language, wa_message_id, location=location,
        )
        if isinstance(sr_turn, TurnResult):
            return sr_turn
        if isinstance(sr_turn, str):
            # They told Joy what's wrong before the intake: read it now
            user_text = sr_turn
            story_patient = session.get(Patient, identity.person_id)
            if story_patient is not None and story_patient.preferred_language:
                language = story_patient.preferred_language

    # A returning patient who just says hello: welcome them back where they left off
    if identity.persona == Persona.PATIENT and _is_greeting_only(user_text) and state.recent_messages:
        returning = _returning_greeting(session, identity, state)
        if returning is not None:
            returning_text, returning_buttons = returning
            save_turn(
                session, state, user_text, returning_text, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=returning_text, language=language, phase=state.phase,
                extracted=state.extracted, interactive=returning_buttons,
            )

    # The physio's exercise plan ("my exercises") and DONE replies that log today's session
    if identity.persona == Persona.PATIENT and len(user_text or "") <= 80:
        exercise_patient = session.get(Patient, identity.person_id)
        exercise_reply, exercise_buttons, exercise_after = None, None, None
        if exercise_patient is not None and asks_for_programme(user_text):
            exercise_reply, exercise_buttons, exercise_after = show_programme(session, exercise_patient)
        elif exercise_patient is not None:
            exercise_reply = done_command(session, exercise_patient, user_text)
        if exercise_reply is not None:
            save_turn(
                session, state, user_text, exercise_reply, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=exercise_reply, language=language, phase=state.phase,
                extracted=state.extracted, interactive=exercise_buttons, after=exercise_after or None,
            )

    # A question about one of the physio's exercises: answered from the plan, or sent to the physio
    # (app/exercises/questions.py). Escalated patients never get here (the safety resend runs first).
    if identity.persona == Persona.PATIENT:
        question_patient = session.get(Patient, identity.person_id)
        answered = exercise_question_turn(session, question_patient, user_text) if question_patient is not None else None
        if answered is not None:
            question_reply, question_after = answered
            save_turn(
                session, state, user_text, question_reply, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=question_reply, language=language, phase=state.phase,
                extracted=state.extracted, after=question_after or None,
            )

    # "send me my dashboard link": a fresh one-tap login link from Rehabify
    if identity.persona == Persona.PATIENT and _DASHBOARD_LINK_RE.search(user_text or "") and len(user_text) <= 120:
        dashboard_reply = _dashboard_link_reply(session, identity)
        save_turn(
            session, state, user_text, dashboard_reply, state.extracted, state.phase,
            language, wa_message_id, stage=state.stage,
        )
        return TurnResult(reply_text=dashboard_reply, language=language, phase=state.phase, extracted=state.extracted)

    # "sign up" / "update my details": the WhatsApp sign-up form (app/flows/signup.py)
    if identity.persona == Persona.PATIENT and is_signup_request(user_text):
        offer = signup_offer(session, identity)
        if offer is not None:
            offer_text, form = offer
            save_turn(
                session, state, user_text, offer_text, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=offer_text, language=language, phase=state.phase,
                extracted=state.extracted, interactive=form,
            )

    # Linking this WhatsApp number to a website account (LINK, then the emailed code)
    if identity.persona == Persona.PATIENT:
        link_reply = _account_link_turn(session, identity, state, user_text)
        if link_reply is not None:
            save_turn(
                session, state, user_text, link_reply, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=link_reply, language=language, phase=state.phase, extracted=state.extracted,
            )

    # A patient in care who wrote something else: offer to pass it to their physio, or book a visit,
    # rather than starting a new-patient intake (they can still choose "Someone new").
    if identity.persona == Persona.PATIENT and care_now is not None and not state.booking_substate:
        companion = companion_turn(
            session, sr_patient, session.get(Conversation, state.conversation_id), user_text,
            is_greeting=False, offer_free_text=True,
        )
        if companion is not None:
            companion_text, companion_buttons = companion
            save_turn(
                session, state, user_text, companion_text, state.extracted, state.phase,
                language, wa_message_id, stage=state.stage,
            )
            return TurnResult(
                reply_text=companion_text, language=language, phase=state.phase,
                extracted=state.extracted, interactive=companion_buttons,
            )

    # After RH confirms the booking, later messages get a code-owned reply with
    # the appointment details. Re-entering triage or matching from
    # BOOKING_CONFIRMED is (rightly) refused by the stage machine, which used to
    # crash the turn so the patient got no reply at all.
    if (
        identity.persona == Persona.PATIENT
        and state.stage == ConversationStage.BOOKING_CONFIRMED
        and not decide_booking_substate(state)
    ):
        booked_context = state.booking_context or {}
        change = _BOOKING_CHANGE_RE.search(user_text or "")
        booked_patient = session.get(Patient, identity.person_id)
        if change and booked_context.get("rh_patient_id") and booked_patient is not None:
            from app.booking.booking_flow import paid_booking_change_reply

            action = "cancel" if change.group(0).lower().startswith("cancel") else "reschedule"
            if action == "reschedule":
                from app.booking.booking_flow import start_paid_reschedule

                reply = start_paid_reschedule(session, session.get(Conversation, state.conversation_id), booked_patient)
            else:
                reply = paid_booking_change_reply(booked_patient, str(booked_context["rh_patient_id"]), action)
        else:
            reply = _booked_patient_reply(state)
        save_turn(
            session, state, user_text, reply, state.extracted, state.phase,
            language, wa_message_id, stage=state.stage,
        )
        return TurnResult(
            reply_text=reply, language=language, phase=state.phase, extracted=state.extracted,
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
                    wa_message_id=wa_message_id,
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
                before_items = None
                if current is not None and isinstance((current.booking_context or {}).get("_before"), list):
                    # More physios' photos ("See more"), sent just before the list
                    trimmed = dict(current.booking_context or {})
                    before_items = trimmed.pop("_before") or None
                    current.booking_context = trimmed
                booking_stage = _stage_for_booking_substate(
                    current.booking_substate if current is not None else None
                )
                stage = assert_transition(
                    state.stage,
                    booking_stage
                    # Done moving a confirmed booking: it is still confirmed
                    or (ConversationStage.BOOKING_CONFIRMED if state.stage == ConversationStage.BOOKING_CONFIRMED else ConversationStage.SPECIALIST_MATCHING),
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
                    before=before_items,
                )

    # A bare 0–10 answer after the completed deterministic safety screen is
    # entirely code-owned. Calling Gemini for it adds latency and makes this
    # critical triage transition depend on provider availability.
    reported_severity = parse_severity_from_text(user_text)
    # Only a bare score may skip the model. "8 / I want to run again" carries
    # other facts (a goal) that would otherwise be silently dropped.
    can_skip_model_for_severity = (
        reported_severity is not None
        and _BARE_SEVERITY_RE.fullmatch(user_text or "") is not None
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
            allow_number_only=safety_screen_active and _looks_like_numbered_reply(user_text),
        )
        if safety_screen_active and answers == before_numbered:
            compact = " ".join((user_text or "").casefold().split()).strip(".!?,;: ")
            if compact in {"no to all", "none", "none apply"}:
                for _, questions in safety_screen:
                    for question in questions:
                        answers[question.id] = NO
            else:
                normalized = normalize_answer(user_text)
                if normalized == NO:
                    # The screen is one question ("any of these?"), so a plain No
                    # answers every group it showed.
                    for _, questions in safety_screen:
                        for question in questions:
                            answers[question.id] = NO
                elif normalized == YES:
                    # A bare Yes doesn't say which sign: treat it conservatively as
                    # the first (most urgent) group, which routes to safety advice.
                    for question in safety_screen[0][1]:
                        answers[question.id] = YES
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

    sr_conversation = session.get(Conversation, state.conversation_id)
    sr_on = sr_conversation is not None and sr.active(sr_conversation.booking_context)
    if _TRIAGE_QUESTIONNAIRE_ENABLED and not sr_on and (
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
        llm=llm,
    )
    if isinstance(reply, TurnResult):
        # The summary was confirmed with nothing left to screen and the result is AMBER: the
        # specialist-review reply has already been saved with its own stage.
        return reply
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
