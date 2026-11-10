import logging
import re
from zoneinfo import ZoneInfo
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from app.audit.logger import append
from app.booking.paystack_client import initialize_transaction
from app.booking.state import cancel, create_draft, get_active_booking, mark_awaiting_payment
from app.booking.intake import journey, send_intake, send_triage_snapshot
from app.config import get_settings
from app.conversation.state_manager import ConversationState
from app.matching.ranking import rank
from app.matching.specialty_match import eligible_physios
from app.models.booking import Booking
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.rh_identity_mapping import RHIdentityMapping
from app.models.triage_session import TriageSession
from app.models.types import AuditKind, BookingStatus, ExtractedTriage
from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
from app.api.internal.rh_safety_eligibility import EligibilityRequest, issue_eligibility_reference
from app.queue.tasks import _redis, enqueue_booking_confirmed

logger = logging.getLogger(__name__)

_LAGOS = ZoneInfo("Africa/Lagos")
OFFERING_MATCHES = "offering_matches"
AWAITING_SLOT_MODE = "awaiting_slot_mode"
AWAITING_PAYMENT = "awaiting_payment"
AWAITING_RH_SERVICE_MODE = "rh_awaiting_service_mode"
AWAITING_RH_LOCATION = "rh_awaiting_location"
AWAITING_RH_PROVIDER = "rh_awaiting_provider"
AWAITING_RH_SLOT = "rh_awaiting_slot"
AWAITING_RH_PAYMENT_EMAIL = "rh_awaiting_payment_email"
AWAITING_RH_PAYMENT = "rh_awaiting_payment"
# A paid booking being moved in the chat: the physio's free times are on offer
AWAITING_RH_RESCHEDULE = "rh_awaiting_reschedule"
AWAITING_RH_REPLACEMENT = "rh_awaiting_replacement"
AWAITING_TREATMENT_OPTION = "awaiting_treatment_option"
AWAITING_POLICY_ACCEPTANCE = "awaiting_policy_acceptance"
AWAITING_INITIAL_CONSULTATION_CONFIRMATION = "awaiting_initial_consultation_confirmation"

SESSION_REMINDER_ZSET = "joy:session_reminders"
_PLACEHOLDER_CALLBACK = "https://localhost/paystack/callback"

_PATIENT_MUTABLE = frozenset({BookingStatus.CONFIRMED, BookingStatus.AWAITING_PAYMENT})

_CANCEL_RE = re.compile(r"\bcancel\b", re.I)
_RESCHEDULE_RE = re.compile(r"\breschedule\b", re.I)
_PAID_RE = re.compile(
    r"\b(have i paid|did i pay|is it paid|am i paid|payment (go|went)|paid\??)\b",
    re.I,
)
_SLOT_RE = re.compile(
    r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:[+-]\d{2}:\d{2}|Z)?)",
    re.I,
)
_INDEX_RE = re.compile(r"^\s*([1-9])\b")
_PAY_NUDGE_RE = re.compile(r"\b(pay|payment|processing)\b", re.I)
_PAYMENT_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

TREATMENT_OPTIONS = {
    "quick_initial": {"label": "Quick Initial Consultation (online)", "amount_kobo": 600_000, "duration_minutes": 20},
    "full_virtual": {"label": "Full Virtual Consultation", "amount_kobo": 2_000_000, "duration_minutes": 60},
    "home_visit": {"label": "Face-to-Face Home Session", "amount_kobo": None, "duration_minutes": 60},
}

NO_SPECIALIST_YET = (
    "There's no specialist yet for this kind of rehab. "
    "I will not match you to the nearest MSK generalist — I'll wait until a specialist is on the list."
)
_OFFER_FOOTER = "Reply with a number and teleconsult or home_visit."
_SLOT_PROMPT = "Would you like a teleconsult or a home_visit?"
_CANCELLED = "I've cancelled that booking."
_PROCESSING = "Your payment is processing."
_NEED_TIME = "Tell me the new time (for example 2026-09-01T10:00:00+00:00)."


def send_session_reminder(booking_id: UUID | str, *, run_at: datetime | None = None) -> None:
    when = run_at or (datetime.now(timezone.utc) + timedelta(hours=24))
    try:
        _redis().zadd(SESSION_REMINDER_ZSET, {str(booking_id): when.timestamp()})
    except Exception:
        return


def due_session_reminders(*, now: datetime) -> list[str]:
    try:
        ids = _redis().zrangebyscore(SESSION_REMINDER_ZSET, 0, now.timestamp())
    except Exception:
        return []
    return list(ids)


def handle_booking_turn(
    session: Session,
    state: ConversationState,
    patient: Patient,
    extracted: ExtractedTriage,
    user_text: str,
    *,
    paystack=None,
    summary_confirmed: bool = False,
    wa_message_id: str | None = None,
) -> str | None:
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return None

    if conversation.booking_substate == AWAITING_RH_RESCHEDULE:
        return _continue_rh_reschedule(session, conversation, patient, user_text)
    # Cancel, change physio, a named physio or another day: acted on at any named-booking step
    request = _named_route_request(session, conversation, patient, extracted, user_text)
    if request is not None:
        return request
    # The self-referral booking (named physios, then Confirm and pay) owns its own replies:
    # "Cancel" here means "not this one", not a paid-booking cancellation
    if conversation.booking_substate == AWAITING_RH_NAMED_PROVIDER:
        return _continue_named_provider(session, conversation, patient, user_text)
    if conversation.booking_substate == AWAITING_RH_CONFIRM:
        return _continue_confirm(session, conversation, patient, extracted, user_text, wa_message_id)
    if conversation.booking_substate == AWAITING_RH_OTHER_TIME:
        return _continue_other_time(session, conversation, patient, user_text)

    cancelled = _maybe_cancel(session, conversation, patient, user_text)
    if cancelled is not None:
        return cancelled

    rescheduled = _maybe_reschedule(session, patient, user_text, conversation)
    if rescheduled is not None:
        return rescheduled

    paid = _maybe_paid_status(session, conversation, patient, user_text)
    if paid is not None:
        return paid

    sub = conversation.booking_substate
    if sub == AWAITING_RH_REPLACEMENT:
        return _continue_rh_replacement(session, conversation, patient, user_text)
    if sub == AWAITING_TREATMENT_OPTION:
        option = _treatment_option(user_text)
        if option is None:
            return "Reply 1, 2, or 3, or say ‘help me choose’. You can also tell me what needs correcting in the summary."
        ctx = dict(conversation.booking_context or {})
        ctx["treatment_option"] = option
        _set_substate(conversation, None, ctx)
        return "__JOY_TREATMENT_OPTION_SELECTED__"
    if sub == AWAITING_INITIAL_CONSULTATION_CONFIRMATION:
        if _initial_consultation_confirmed(user_text):
            ctx = dict(conversation.booking_context or {})
            ctx["treatment_option"] = "quick_initial"
            _set_substate(conversation, None, ctx)
            return "__JOY_INITIAL_CONSULTATION_CONFIRMED__"
        if _initial_consultation_declined(user_text):
            return (
                "No problem. I won’t create an initial consultation booking. "
                "If you would like to continue later, reply ‘Book Initial Consultation’."
            )
        # A resumed worker must repeat the complete offer, not an unexplained
        # one-line prompt. This also makes a stale "I accept" harmless if it
        # arrives after policy was already recorded.
        return initial_consultation_offer()
    if sub == AWAITING_POLICY_ACCEPTANCE:
        return booking_policy_acceptance_prompt(dict(conversation.booking_context or {}))
    if sub == AWAITING_RH_SERVICE_MODE:
        return _continue_rh_service_mode(session, conversation, patient, extracted, user_text)
    if sub == AWAITING_RH_LOCATION:
        return _continue_rh_location(session, conversation, patient, extracted, user_text)
    if sub == AWAITING_RH_PROVIDER:
        return _continue_rh_provider(session, conversation, patient, user_text)
    if sub == AWAITING_RH_SLOT:
        return _continue_rh_slot(session, conversation, patient, user_text)
    if sub == AWAITING_RH_PAYMENT_EMAIL:
        return _continue_rh_payment_email(session, conversation, patient, user_text)
    if sub == AWAITING_RH_PAYMENT:
        # Conversations created before receipt-email collection was added may
        # already hold a slot in this state. Let a supplied address recover
        # that hold without making the patient start over.
        if _PAYMENT_EMAIL_RE.fullmatch(user_text.strip().casefold()) and not user_text.strip().casefold().endswith(".invalid"):
            return _continue_rh_payment_email(session, conversation, patient, user_text)
        # Anything else is a question: the caller answers it (app/booking/step_help.py)
        return None
    if sub == OFFERING_MATCHES:
        return _continue_offering(session, conversation, patient, user_text, paystack)
    if sub == AWAITING_SLOT_MODE:
        return _continue_slot_mode(session, conversation, patient, user_text, paystack)
    if sub == AWAITING_PAYMENT:
        booking = _payment_booking(session, conversation, patient)
        if booking is not None and booking.status == BookingStatus.AWAITING_PAYMENT:
            if _PAY_NUDGE_RE.search(user_text):
                return _processing_reply(conversation)
        else:
            _set_substate(conversation, None, {})

    if summary_confirmed:
        return offer_matches(session, conversation, patient, extracted)

    return None


def offer_matches(
    session: Session,
    conversation: Conversation,
    patient: Patient,
    extracted: ExtractedTriage,
) -> str:
    # RH is the operational source of truth. Do not use the legacy local matching
    # and payment lifecycle for new WhatsApp bookings.
    if extracted.condition_area is None:
        _set_substate(conversation, None, {})
        return NO_SPECIALIST_YET
    context = dict(conversation.booking_context or {})
    context["condition_area"] = extracted.condition_area.value
    _set_substate(conversation, AWAITING_RH_SERVICE_MODE, context)
    return "How would you like the session: home visit, clinic, or online?"


def treatment_options_prompt(summary: str) -> str:
    return (
        f"Here’s a quick summary of what you’ve told me:\n{summary}\n\n"
        "Based on your answers, I haven’t picked up anything that would stop you from continuing with the Rehabify MSK pathway.\n\n"
        "Here are your options for what happens next:\n\n"
        "1. Quick Initial Consultation — ₦6,000 (online only)\n"
        "A short video call with a clinician from your phone, for initial advice and the best next step. "
        "Nobody comes to your home for this one.\n\n"
        "2. Full Virtual Consultation — ₦20,000 (online only)\n"
        "A detailed video assessment with a clinician from your phone, including a personalised treatment and rehabilitation plan.\n\n"
        "3. Face-to-Face Home Session (in person)\n"
        "A clinician comes to your home for an in-person assessment and treatment. The price depends on your area.\n\n"
        "Reply 1, 2, or 3. You can also say ‘help me choose’ — I’ll start you with option 1."
    )


def initial_consultation_offer() -> str:
    """Explain the single GREEN-path consultation before creating its booking."""
    # Shortened Nov 2026; the facts are unchanged: price, online only, what the clinician does, not
    # a full physiotherapy consultation, home visits after, and why it comes first.
    return (
        "Thanks. Here’s your next step:\n\n"
        "*Initial Consultation with a Clinician — ₦6,000*\n\n"
        "📱 This is a short online video call, not a home visit. Nobody will come to your house: you join "
        "from your phone with a secure link I’ll send you here.\n\n"
        "The clinician will go through your problem, give initial advice, and recommend the right next step: "
        "an MSK physiotherapist if that’s appropriate, or another type of clinician if that would suit you better.\n\n"
        "This is not a full physiotherapy consultation. If you need hands-on care, the clinician will recommend "
        "it, and home visits can be arranged after this call. We start here so you don’t pay for a full "
        "consultation when you may need a different type of care.\n\n"
        "Reply Yes to continue."
    )


def booking_policy_acceptance_prompt(context: dict) -> str:
    """Repeat the exact policy step without relying on a previous chat bubble."""
    policy = context.get("policy_presented")
    url = policy.get("url") if isinstance(policy, dict) else None
    link = f"\n\n[Review & Accept Booking Policy] {url}" if isinstance(url, str) and url else ""
    if context.get("green_initial_consultation_path"):
        return (
            "Before we arrange your consultation, please review and accept our booking policy."
            f"{link}\n\n"
            "Reply ‘I accept’ when you’re ready, and I’ll show you the consultation details."
        )
    return (
        f"Please review the Consultation & Booking Policy{f': {url}' if url else ' above'}, then reply ‘I accept’ "
        "when you are ready to continue."
    )


def _initial_consultation_confirmed(user_text: str) -> bool:
    text = " ".join((user_text or "").casefold().split()).strip(".!?,;: ")
    return text in {"yes", "yes please", "book", "book now", "book initial consultation", "continue"}


def _initial_consultation_declined(user_text: str) -> bool:
    text = " ".join((user_text or "").casefold().split()).strip(".!?,;: ")
    return text in {"no", "no thanks", "not now", "later"}


def begin_selected_treatment(
    session: Session,
    conversation: Conversation,
    patient: Patient,
    extracted: ExtractedTriage,
) -> str:
    """Begin the post-policy operational path selected in the treatment menu."""
    ctx = dict(conversation.booking_context or {})
    option = str(ctx.get("treatment_option") or "")
    if option == "home_visit":
        rh_patient_id = _rh_patient_id(session, patient)
        tags = _required_specialties(extracted)
        if not rh_patient_id or not tags:
            return "I can’t access Rehabify’s live home-visit service right now. No booking has been made; please try again shortly."
        return _find_rh_matches(
            session, conversation, patient, extracted, mode="home_visit",
            rh_patient_id=rh_patient_id, tags=tags,
        )
    config = TREATMENT_OPTIONS.get(option)
    if config is None:
        return "Please choose an option before we continue."
    rh_patient_id = _rh_patient_id(session, patient)
    policy = ctx.get("policy_accepted") or {}
    if not rh_patient_id or not isinstance(policy, dict):
        return "I need to refresh your booking details before continuing. Please try again."
    try:
        booking = configured_rh_client().create_admin_scheduled_virtual_booking(
            patient_id=rh_patient_id,
            consultation_type=option,
            duration_minutes=int(config["duration_minutes"]),
            amount_kobo=int(config["amount_kobo"]),
            triage_summary_reference=str(_current_assessment(session, patient)),
            assessment_id=str(_current_assessment(session, patient)),
            assessment_revision=1,
            policy_version=str(policy["version"]),
            policy_acceptance_reference=str(policy.get("acceptance_message_id") or policy["accepted_at"] or policy["version"]),
            conversation_id=str(conversation.id),
            # A patient can complete another consultation later in the same
            # conversation.  Scope idempotency to this specific policy
            # acceptance, rather than the lifetime of the conversation, while
            # still making delivery retries safe.
            idempotency_key=(
                f"joy-{option}-{conversation.id}-"
                f"{policy.get('acceptance_message_id') or policy.get('accepted_at') or policy['version']}"
            ),
            partner_referral_code=(
                str(ctx["partner_attribution"]["public_code"])
                if isinstance(ctx.get("partner_attribution"), dict)
                and isinstance(ctx["partner_attribution"].get("public_code"), str)
                else None
            ),
        )
    except RHIntegrationError as error:
        # Do not expose RH internals to the patient, but retain a durable,
        # searchable reason so production support can distinguish a missing
        # gateway capability from a temporary upstream outage.
        logger.warning(
            "joy_virtual_consultation_create_failed code=%s retryable=%s",
            error.code,
            error.retryable,
        )
        append(
            session,
            kind=AuditKind.BOOKING,
            actor_phone=patient.phone_e164,
            person_id=patient.id,
            payload={
                "decision": "virtual_consultation_create_failed",
                "rh_error_code": error.code,
                "retryable": error.retryable,
            },
        )
        return "I can’t create your virtual consultation right now. No booking has been made; please try again shortly."
    send_intake(session, conversation, patient, rh_patient_id=str(rh_patient_id), booking_id=booking.booking_id, policy=policy)
    ctx.update({
        "rh_booking_id": booking.booking_id,
        "rh_patient_id": rh_patient_id,
        "booking_route": "admin_scheduled_virtual",
        "consultation_type": option,
        # RH prices from its catalogue; quote that amount, not the menu figure.
        "rh_amount_kobo": booking.amount_kobo,
    })
    if booking.payment_status == "completed":
        ctx["rh_payment_status"] = "succeeded"
        _set_substate(conversation, AWAITING_RH_PAYMENT, ctx)
        return (
            "Your payment has already been received. Our care team will assign your clinician, date, and time shortly. "
            "I’ll send your appointment details and joining link here once that is done."
        )
    known_email = _known_email(patient)
    if known_email:
        ctx["suggested_email"] = known_email
    _set_substate(conversation, AWAITING_RH_PAYMENT_EMAIL, ctx)
    if known_email:
        return (
            f"Your {config['label'].casefold()} booking is ready. Shall I send your secure payment "
            f"receipt to {known_email}? Reply YES, or send a different email address."
        )
    return (
        f"Your {config['label'].casefold()} booking is ready. "
        "Which email address should I send your secure payment receipt to?"
    )


def _treatment_option(user_text: str) -> str | None:
    text = (user_text or "").strip().casefold()
    if re.search(r"\bhelp\s+me\s+choose\b", text):
        return "quick_initial"
    if re.match(r"^\s*1\b", text) or "quick" in text:
        return "quick_initial"
    if re.match(r"^\s*2\b", text) or "full virtual" in text:
        return "full_virtual"
    if re.match(r"^\s*3\b", text) or "home" in text:
        return "home_visit"
    return None


def _rh_actor(patient: Patient, rh_patient_id: str | None = None) -> RHActor:
    return RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id)


def _rh_patient_id(session: Session, patient: Patient) -> str | None:
    mapping = session.scalar(select(RHIdentityMapping).where(
        RHIdentityMapping.persona == "patient", RHIdentityMapping.joy_person_id == patient.id,
    ))
    if mapping is not None:
        return mapping.rh_record_id
    try:
        resolved = configured_rh_client().resolve_patient(
            patient.phone_e164, str(patient.id), _rh_actor(patient), name=patient.name,
        )
    except RHIntegrationError as error:
        # Do not log personal identifiers or request bodies. The stable code is
        # enough to diagnose a failed identity resolution in production.
        logger.warning("joy_rh_patient_resolution_failed code=%s", error.code)
        return None
    if not resolved.patient_id:
        return None
    session.add(RHIdentityMapping(persona="patient", joy_person_id=patient.id, rh_record_id=resolved.patient_id))
    session.flush()
    if resolved.account_link_available:
        # A website account uses this number but its owner hasn't confirmed the link, so Joy
        # works on a WhatsApp-only record. Offer the link once; it is never done silently.
        enqueue_booking_confirmed(patient.phone_e164, "", account_link_offer_text(resolved.account_email_hint))
    return resolved.patient_id


def account_link_offer_text(email_hint: str | None) -> str:
    where = f" (email {email_hint})" if email_hint else ""
    return (
        f"I found a Rehabify account that uses this WhatsApp number{where}. "
        "To keep your bookings and care in one place, reply LINK and I'll email you a 6-digit code. "
        "You can carry on here without linking."
    )


def _required_specialties(extracted: ExtractedTriage) -> list[str]:
    area = extracted.condition_area
    return [area.value] if area is not None else []


def _rh_mode(user_text: str) -> str | None:
    text = user_text.lower()
    if "home" in text:
        return "home_visit"
    if "clinic" in text:
        return "clinic"
    if "online" in text or "tele" in text or "video" in text:
        return "online"
    return None


_LOCATION_LABELLED_RE = re.compile(
    r"(?:city\s*[:=-]?\s*(?P<city>[^,;]+)[,;\s]+)?(?:area|neighbourhood|neighborhood)\s*[:=-]?\s*(?P<area>[^,;]+)",
    re.I,
)


def _parse_city_area(user_text: str) -> tuple[str, str] | None:
    """Parse the deliberately small WhatsApp location format: ``Area, City``.

    We do not geocode or infer an address. Matching needs only the service city
    and local area, and an unclear answer must be requested again rather than
    silently widened to another city.
    """
    text = " ".join(user_text.strip().split())
    labelled = _LOCATION_LABELLED_RE.fullmatch(text)
    if labelled and labelled.group("city") and labelled.group("area"):
        return labelled.group("city").strip(" ."), labelled.group("area").strip(" .")
    parts = [part.strip(" .") for part in re.split(r"[,;]", text) if part.strip(" .")]
    if len(parts) == 2:
        area, city = parts
        if len(city) >= 2 and len(area) >= 2:
            return city, area
    return None


def pin_lookup_enabled() -> bool:
    """Rehabify can turn a shared location pin into an area (needs the direct RH gateway)."""
    settings = get_settings()
    return bool(settings.rh_convex_gateway_base_url and settings.rh_convex_gateway_hmac_secret)


def _location_prompt() -> str:
    if pin_lookup_enabled():
        return (
            "For a home visit, where are you? Tap *Send location* to share your pin, the quickest and "
            "most accurate way. Or type your area and city, for example Lekki, Lagos, or just your state "
            "or town if you're outside Lagos and Abuja."
        )
    return (
        "For a home visit, where are you? Tap Lagos or Abuja, or Other state for anywhere else in "
        "Nigeria. You can also reply Area, City — for example, Lekki, Lagos."
    )


def _pin_hint() -> str:
    return " You can also tap *Send location* to share your pin." if pin_lookup_enabled() else ""


def _same_place(a: str | None, b: str | None) -> bool:
    return bool(a and b) and _place_key(a) == _place_key(b)


def place_from_pin(session: Session, patient: Patient, ctx: dict, lat: float, lng: float) -> tuple[str, str] | None:
    """(city, area) in travel-zone terms for a shared pin. Also keeps the pin on the patient."""
    from app.integrations.geocode import place_for_pin

    patient.lat, patient.lng = float(lat), float(lng)
    place = place_for_pin(lat, lng)
    if place is None:
        return None
    cities = _service_areas(patient, ctx)
    in_state = [c for c in cities if _same_place(str(c.get("state") or ""), place.state)]
    for name in place.names():
        places, _ = _resolve_place(name, in_state or cities)
        found = {str(c.get("city") or "") for c in places}
        if len(found) == 1:
            return found.pop(), place.area or name
    if len(in_state) == 1:
        return str(in_state[0].get("city")), place.area or place.town or str(place.state)
    # A town outside the state's split city (e.g. Iseyin in Oyo): the rest-of-state zone
    rest = [c for c in in_state if str(c.get("city") or "").endswith(" State")]
    if rest and place.state:
        return str(rest[0].get("city")), place.area or place.town or str(place.state)
    return None


def location_pin_turn(session: Session, conversation: Conversation | None, patient: Patient, lat: float, lng: float, *, has_story: bool) -> tuple[str | None, str | None]:
    """A shared location pin: (text to carry on the booking with, or a direct reply)."""
    ctx = dict(conversation.booking_context or {}) if conversation is not None else {}
    found = place_from_pin(session, patient, ctx, lat, lng)
    at_location_step = conversation is not None and conversation.booking_substate == AWAITING_RH_LOCATION
    if at_location_step:
        if found is None:
            return None, (
                "Thanks for the pin. I couldn't work out the area from it, so please type your area and "
                "city, for example Lekki, Lagos."
            )
        city, area = found
        ctx["pin_place"] = f"{area}, {city}"
        conversation.booking_context = ctx
        session.flush()
        return f"{area}, {city}", None
    if found is None:
        reply = "Thanks, I've saved your location pin. I'll use it to find physiotherapists near you."
    else:
        city, area = found
        patient.city, patient.area, patient.location = city, area, f"{area}, {city}"
        reply = f"Thanks, I've saved your location as {area}, {city}. I'll use it to find physiotherapists near you for a home visit."
    session.flush()
    if not has_story:
        reply += "\n\nNow, tell me what's going on: what's bothering you, which part of your body, and how long you've had it."
    return None, reply


def _find_rh_matches(session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, *, mode: str, rh_patient_id: str, tags: list[str]) -> str:
    # Keep consent/policy evidence while replacing only the operational match
    # details.  The selected-slot transition requires the accepted policy, and
    # dropping it here made a valid patient selection look incomplete.
    context = dict(conversation.booking_context or {})
    if mode == "home_visit" and (not patient.city or not patient.area):
        context.update({
            "rh_patient_id": rh_patient_id, "service_mode": mode, "required_specialties": tags,
        })
        if patient.city:
            # The city is known (e.g. from the sign-up form): ask only for the town or area
            context["location_city"] = patient.city
            _set_substate(conversation, AWAITING_RH_LOCATION, context)
            return f"For the home visit, which town or area in {patient.city} are you in?{_pin_hint()}"
        _set_substate(conversation, AWAITING_RH_LOCATION, context)
        return _location_prompt()
    try:
        matches = configured_rh_client().match_physios(
            patient_id=rh_patient_id, assessment_id=str(_current_assessment(session, patient)), assessment_revision=1,
            required_specialties=tags, service_mode=mode, city=patient.city if mode == "home_visit" else None,
            area=patient.area if mode == "home_visit" else None, actor=_rh_actor(patient, rh_patient_id),
            latitude=patient.lat if mode != "online" else None, longitude=patient.lng if mode != "online" else None,
        )
    except RHIntegrationError:
        return "I can’t retrieve live specialist availability right now. Please try again shortly."
    if not matches:
        _set_substate(conversation, None, {})
        if mode == "home_visit":
            return "There are no verified specialists currently serving your area for this care. I can’t offer a home visit there right now. You can ask about clinic or online care instead."
        return NO_SPECIALIST_YET
    providers = [m.__dict__ for m in matches]
    pin_place = context.pop("pin_place", None)
    lines = [f"From your pin, you're in {pin_place}." if pin_place else None, "Here are the verified specialists available for your care:"]
    lines = [line for line in lines if line]
    for index, match in enumerate(matches, 1):
        near = f" · about {_km(match.distance_km)} away" if match.distance_km is not None else ""
        lines.append(f"{index}. {match.display_name or 'Physiotherapist'} — ₦{match.amount_kobo // 100:,}{near}")
    lines.append("Reply with the number of the specialist you prefer.")
    context.update({
        "rh_patient_id": rh_patient_id, "service_mode": mode, "required_specialties": tags,
        "providers": providers,
    })
    _set_substate(conversation, AWAITING_RH_PROVIDER, context)
    append(session, kind=AuditKind.MATCH, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_matches_presented", "service_mode": mode, "provider_ids": [m.physiotherapist_id for m in matches]})
    send_triage_snapshot(session, conversation, patient, rh_patient_id=str(rh_patient_id))
    journey(rh_patient_id, "matches_shown", f"matches-{conversation.id}-{mode}")
    return "\n".join(lines)


def _km(distance: float) -> str:
    return "1 km" if distance < 1.5 else f"{round(distance):,} km"


def _continue_rh_service_mode(session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, user_text: str) -> str:
    mode = _rh_mode(user_text)
    if mode is None:
        return "Please reply with home visit, clinic, or online."
    rh_patient_id = _rh_patient_id(session, patient)
    tags = _required_specialties(extracted)
    if not rh_patient_id or not tags:
        return (
            "I can’t access Rehabify’s live booking service right now, so I can’t show current "
            "specialist options. Your triage details are saved and no booking has been made. "
            "Please try again shortly."
        )
    return _find_rh_matches(session, conversation, patient, extracted, mode=mode, rh_patient_id=rh_patient_id, tags=tags)


_OTHER_PLACE = {"other state", "other city", "other", "another state", "another city", "somewhere else"}
_PLACE_ALIASES = {"fct": "abuja", "abuja fct": "abuja", "federal capital territory": "abuja", "lag": "lagos", "ph": "port harcourt"}


def _place_key(text: str) -> str:
    """Lower-case, no punctuation, no trailing "state": "Ondo State." → "ondo"."""
    key = " ".join("".join(ch if ch.isalnum() else " " for ch in (text or "").casefold()).split())
    key = key[:-6] if key.endswith(" state") else key
    return _PLACE_ALIASES.get(key, key)


def _service_areas(patient: Patient, ctx: dict) -> list[dict]:
    rh_patient_id = str(ctx.get("rh_patient_id") or "") or None
    try:
        result = configured_rh_client().service_areas(actor=_rh_actor(patient, rh_patient_id))
    except RHIntegrationError:
        return []
    return [c for c in result.get("cities") or [] if isinstance(c, dict) and c.get("zones")]


def _resolve_place(text: str, cities: list[dict]) -> tuple[list[dict], bool]:
    """The zone cities a typed city, state or town belongs to, and whether it was a town."""
    key = _place_key(text)
    if not key:
        return [], False
    # A state first, so "Oyo" offers Ibadan's zones and the rest of Oyo State together
    by_state = [c for c in cities if _place_key(str(c.get("state") or "")) == key]
    if by_state:
        return by_state, False
    by_city = [c for c in cities if _place_key(str(c.get("city") or "")) == key]
    if by_city:
        return by_city, False
    by_town = [
        c for c in cities
        if any(_place_key(area) == key for zone in c.get("zones") or [] for area in zone.get("areas") or [] if area != "*")
    ]
    return (by_town, True) if len({c.get("city") for c in by_town}) == 1 else ([], False)


def _zone_row(zone: dict, city: str) -> dict:
    """A list row whose id is "Area, City" for one area of the zone (RH matches it by zone)."""
    named = [a for a in zone.get("areas") or [] if a != "*"]
    first = named[0] if named else "Other areas"
    description = ", ".join(named[:4]) if named else "Anywhere else in " + city
    return {"id": f"{first}, {city}", "title": str(zone.get("name") or first), "description": description}


def _offer_place(conversation: Conversation, ctx: dict, places: list[dict], typed: str, *, was_town: bool) -> str | tuple[str, str]:
    """A list of zones, or a request for the area; a typed town with one zone goes straight on."""
    zones = [(zone, str(place.get("city") or "")) for place in places for zone in place.get("zones") or []]
    if len(zones) == 1:
        zone, city = zones[0]
        if was_town:
            return (city, typed)  # e.g. "Akure": the whole of Ondo State is one zone
        ctx["location_city"] = city
        ctx.pop("location_zones", None)
        _set_substate(conversation, AWAITING_RH_LOCATION, ctx)
        named = [a for a in zone.get("areas") or [] if a != "*"]
        example = f" (for example, {named[0]})" if named else ""
        return f"Which town or area in {city} are you in{example}?{_pin_hint()}"
    label = str(places[0].get("state") or places[0].get("city") or "") if len(places) > 1 else str(places[0].get("city") or "")
    ctx["location_city"] = str(places[0].get("city") or "")
    ctx["location_zones"] = [_zone_row(zone, city) for zone, city in zones[:10]]
    _set_substate(conversation, AWAITING_RH_LOCATION, ctx)
    example = ctx["location_zones"][0]["id"].split(",")[0]
    return f"Which part of {label} are you in? Tap to choose your area, or type it (for example, {example})."


def _continue_rh_location(session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, user_text: str) -> str:
    ctx = dict(conversation.booking_context or {})
    text = " ".join((user_text or "").strip().split())
    parsed = _parse_city_area(text)
    if parsed is None:
        key = _place_key(text)
        if key in _OTHER_PLACE:
            ctx["location_asked_state"] = True
            ctx.pop("location_zones", None)
            conversation.booking_context = ctx
            return "Which state or town are you in? For example: Oyo, Rivers or Akure."
        places, was_town = _resolve_place(text, _service_areas(patient, ctx)) if key else ([], False)
        if places and not (ctx.get("location_city") and not ctx.get("location_asked_state")):
            ctx.pop("location_asked_state", None)
            offered = _offer_place(conversation, ctx, places, text, was_town=was_town)
            if isinstance(offered, str):
                return offered
            parsed = offered
        elif ctx.get("location_city") and len(text) >= 2:
            # An area typed after choosing the place; a town that belongs to another offered
            # city (Ogbomoso after "Oyo") goes to that one.
            offered = {str(z.get("id", "")).split(", ", 1)[-1] for z in ctx.get("location_zones") or []}
            town_city = str(places[0].get("city") or "") if was_town and places else ""
            parsed = (town_city if town_city in offered else str(ctx["location_city"]), text)
        elif ctx.get("location_asked_state"):
            _set_substate(conversation, AWAITING_RH_SERVICE_MODE, ctx)
            return (
                "I couldn’t find that place in our home-visit areas yet. You can still see a physiotherapist "
                "online from anywhere: reply Online, or Clinic if you can travel to one."
            )
        else:
            return _location_prompt()
    city, area = parsed
    for key in ("location_city", "location_zones", "location_asked_state"):
        ctx.pop(key, None)
    rh_patient_id = str(ctx.get("rh_patient_id") or "")
    mode = str(ctx.get("service_mode") or "")
    tags = list(ctx.get("required_specialties") or [])
    if not rh_patient_id or mode != "home_visit" or not tags:
        _set_substate(conversation, None, {})
        return "I need to refresh the booking details before continuing. Please choose home visit, clinic, or online again."
    try:
        configured_rh_client().update_patient_location(rh_patient_id, city=city, area=area, actor=_rh_actor(patient, rh_patient_id))
    except RHIntegrationError:
        return "I can’t securely save your booking location right now. Please try again shortly."
    patient.city, patient.area, patient.location = city, area, f"{area}, {city}"
    conversation.booking_context = ctx  # drop the area list now that the area is chosen
    session.flush()
    append(session, kind=AuditKind.MATCH, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "patient_booking_location_saved", "city": city, "area": area})
    return _find_rh_matches(session, conversation, patient, extracted, mode=mode, rh_patient_id=rh_patient_id, tags=tags)


def _current_assessment(session: Session, patient: Patient) -> UUID:
    triage = session.scalar(select(TriageSession).where(TriageSession.patient_id == patient.id).order_by(TriageSession.created_at.desc()))
    if triage is None:
        raise ValueError("triage assessment is missing")
    return triage.id


def _slot_choices(client, provider_id: str, mode: str, *, duration_minutes: int = 60) -> list[dict]:
    now = datetime.now(timezone.utc)
    # RH requires two hours' notice. Add a short transport margin so a slot
    # cannot become ineligible between availability and the signed hold.
    window_start = now + timedelta(hours=2, minutes=5)
    result = client.availability(
        provider_id,
        start_ms=int(window_start.timestamp() * 1000),
        end_ms=int((window_start + timedelta(days=7)).timestamp() * 1000),
        duration_minutes=duration_minutes,
        service_mode=mode,
    )
    slots = result.get("slots") or []
    earliest_ms = int(window_start.timestamp() * 1000)
    return [
        slot for slot in slots
        if isinstance(slot, dict)
        and isinstance(slot.get("start"), (int, float))
        and int(slot["start"]) >= earliest_ms
    ][:8]


def _render_rh_slots(provider: dict, slots: list[dict], *, refreshed: bool = False) -> str:
    prefix = "I refreshed the specialist’s live availability.\n\n" if refreshed else ""
    # Joy currently books the standard consultation length. State it plainly
    # so patients do not infer that the numbered choices are arbitrary blocks.
    lines = [f"Available 60-minute times (Lagos time) with {provider.get('display_name') or 'this specialist'}:"]
    for index, slot in enumerate(slots, 1):
        # Lagos time, not the server's zone (Railway runs on UTC, an hour behind Lagos)
        when = datetime.fromtimestamp(slot["start"] / 1000, timezone.utc).astimezone(_LAGOS)
        lines.append(f"{index}. {when.strftime('%a %d %b, %I:%M %p')}")
    lines.append("Reply with the time number you prefer.")
    return prefix + "\n".join(lines)


def _refresh_rh_slots_after_hold_failure(conversation: Conversation, provider: dict, ctx: dict) -> str:
    """Never ask a patient to retry stale availability after a rejected hold."""
    failures = int(ctx.get("slot_hold_failures", 0)) + 1
    ctx["slot_hold_failures"] = failures
    if failures >= 2:
        ctx.pop("slots", None)
        _set_substate(conversation, AWAITING_RH_PROVIDER, ctx)
        return (
            "I can’t confirm a current live time with that specialist right now, so no booking has been made. "
            "Please choose another specialist, or try again shortly."
        )
    try:
        slots = _slot_choices(
            configured_rh_client(),
            str(provider["physiotherapist_id"]),
            str(ctx["service_mode"]),
        )
    except RHIntegrationError:
        return "I can’t refresh that specialist’s live availability right now. No booking has been made; please try again shortly."
    if not slots:
        ctx.pop("slots", None)
        _set_substate(conversation, AWAITING_RH_PROVIDER, ctx)
        return "That specialist has no currently bookable times. No booking has been made; please choose another specialist."
    ctx["slots"] = slots
    _set_substate(conversation, AWAITING_RH_SLOT, ctx)
    return _render_rh_slots(provider, slots, refreshed=True)


def _continue_rh_provider(session: Session, conversation: Conversation, patient: Patient, user_text: str) -> str:
    ctx = dict(conversation.booking_context or {})
    providers = list(ctx.get("providers") or [])
    selected = _parse_index(user_text, len(providers))
    if selected is None:
        return f"Reply with a number from 1 to {len(providers)}."
    provider = providers[selected - 1]
    try:
        slots = _slot_choices(configured_rh_client(), str(provider["physiotherapist_id"]), str(ctx["service_mode"]))
    except RHIntegrationError:
        return "I can’t retrieve that specialist’s live slots right now. Please try again shortly."
    if not slots:
        return "That specialist has no bookable slots in the next seven days. Please choose another specialist."
    ctx.update({"selected_provider": provider, "slots": slots})
    _set_substate(conversation, AWAITING_RH_SLOT, ctx)
    return _render_rh_slots(provider, slots)


def _continue_rh_slot(session: Session, conversation: Conversation, patient: Patient, user_text: str) -> str:
    ctx = dict(conversation.booking_context or {})
    slots = list(ctx.get("slots") or [])
    selected = _parse_index(user_text, len(slots))
    provider = ctx.get("selected_provider") or {}
    if selected is None or not provider:
        return f"Reply with a time number from 1 to {len(slots)}."
    policy = ctx.get("policy_accepted") or {}
    rh_patient_id = ctx.get("rh_patient_id")
    if not rh_patient_id or not policy:
        return "I need to refresh your booking details before continuing. Please try again."
    slot = slots[selected - 1]
    try:
        rh_client = configured_rh_client()
        eligibility_reference: str | None = None
        if rh_client.uses_direct_convex_gateway:
            eligibility = issue_eligibility_reference(
                session=session,
                settings=get_settings(),
                payload=EligibilityRequest(
                    rh_patient_id=str(rh_patient_id),
                    assessment_id=str(_current_assessment(session, patient)),
                    assessment_revision=1,
                    service_type="standard_consultation",
                    policy_version=str(policy["version"]),
                ),
            )
            eligibility_reference = eligibility.get("eligibility_reference") if eligibility.get("allowed") else None
        booking = rh_client.create_pending_booking(
            patient_id=str(rh_patient_id), physiotherapist_id=str(provider["physiotherapist_id"]),
            slot_start=int(slot["start"]), duration_minutes=60, service_mode=str(ctx["service_mode"]),
            session_type="physiotherapy", triage_summary_reference=str(_current_assessment(session, patient)),
            assessment_id=str(_current_assessment(session, patient)), assessment_revision=1,
            protocol_version="clinical_engine_v1", policy_version=str(policy["version"]),
            policy_acceptance_reference=str(policy.get("acceptance_message_id") or policy["version"]),
            conversation_id=str(conversation.id), actor=_rh_actor(patient, str(rh_patient_id)),
            idempotency_key=f"joy-booking-{conversation.id}-{slot['start']}",
            required_specialties=list(ctx.get("required_specialties") or []), patient_address=patient.location,
            eligibility_reference=eligibility_reference,
        )
    except RHIntegrationError as error:
        append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
               payload={"decision": "rh_slot_hold_failed", "error_code": error.code})
        # Only a rejected hold can make the displayed slot stale. Do not
        # disguise a safety decision or an integration outage as a refreshed
        # list of the same times, which leaves the patient in a retry loop.
        if error.code == "SAFETY_ELIGIBILITY_REQUIRED":
            return (
                "I can’t confirm the current booking eligibility for that time right now, so no booking has been made. "
                "Please try again shortly."
            )
        if error.code == "SLOT_NOTICE_REQUIRED":
            return _refresh_rh_slots_after_hold_failure(conversation, provider, ctx)
        if error.code in {"DEPENDENCY_UNAVAILABLE", "INTEGRATION_NOT_CONFIGURED", "RH_BOOKING_GATEWAY_UNAVAILABLE"}:
            return (
                "I can’t reach Rehabify’s live booking service right now, so no booking has been made. "
                "Please try again shortly."
            )
        return _refresh_rh_slots_after_hold_failure(conversation, provider, ctx)
    # Paystack needs a deliverable receipt address. Never synthesize one from
    # a phone number: the hold is valid, but payment must wait for the patient
    # to provide an address they control.
    ctx.update({"rh_booking_id": booking.booking_id, "rh_amount_kobo": booking.amount_kobo})
    send_intake(session, conversation, patient, rh_patient_id=str(rh_patient_id), booking_id=booking.booking_id, policy=policy)
    known_email = _known_email(patient)
    if known_email:
        ctx["suggested_email"] = known_email
    _set_substate(conversation, AWAITING_RH_PAYMENT_EMAIL, ctx)
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_booking_hold_created", "rh_booking_id": booking.booking_id})
    if known_email:
        return (
            f"Your time is held. Shall I send your secure payment receipt to {known_email}? "
            "Reply YES, or send a different email address."
        )
    return "Your time is held. Which email address should I send your secure payment receipt to?"


_USE_EMAIL = {"yes", "y", "yes please", "ok", "okay", "yes, use it", "use it", "use that", "use that email", "correct", "sure"}


def _known_email(patient: Patient) -> str | None:
    """The email the patient gave in the sign-up form, if it is a real address."""
    email = (getattr(patient, "email", None) or "").strip().casefold()
    return email if _PAYMENT_EMAIL_RE.fullmatch(email) and not email.endswith(".invalid") else None


def _continue_rh_payment_email(session: Session, conversation: Conversation, patient: Patient, user_text: str) -> str:
    email = user_text.strip().casefold()
    suggested = str((conversation.booking_context or {}).get("suggested_email") or "")
    if suggested and email.strip(" .!") in _USE_EMAIL:
        email = suggested
    if not _PAYMENT_EMAIL_RE.fullmatch(email) or email.endswith(".invalid"):
        if suggested:
            return f"Reply YES to use {suggested}, or send the email address you'd like for your payment receipt."
        return "Please reply with a valid email address for your secure payment receipt."
    if email != suggested and not _known_email(patient):
        patient.email = email  # remembered for next time (the sign-up form can change it)
    ctx = dict(conversation.booking_context or {})
    booking_id = ctx.get("rh_booking_id")
    rh_patient_id = ctx.get("rh_patient_id")
    if not booking_id or not rh_patient_id:
        return "I need to refresh your booking details before starting payment. Please try again."
    retry_count = int(ctx.get("payment_retry_count") or 0)
    try:
        payment = configured_rh_client().initialize_booking_payment(
            str(booking_id), patient_id=str(rh_patient_id), email=email,
            # A retry after a Paystack-declared failure must use a fresh RH
            # payment attempt/reference. Retries before a failure retain this
            # same key and remain idempotent.
            actor=_rh_actor(patient, str(rh_patient_id)), idempotency_key=f"joy-payment-{booking_id}-{retry_count}",
        )
    except RHIntegrationError as error:
        if error.code == "PAYMENT_ALREADY_COMPLETED":
            ctx["payment_email"] = email
            ctx["rh_payment_status"] = "succeeded"
            _set_substate(conversation, AWAITING_RH_PAYMENT, ctx)
            if ctx.get("booking_route") == NAMED_ROUTE:
                return named_payment_received_text(ctx)
            return (
                "Your payment has already been received. Our care team will assign your clinician, date, and time shortly. "
                "I’ll send your appointment details and joining link here once that is done."
            )
        # Keep the held booking state and the supplied address, but do not
        # expose payment-provider details in the WhatsApp reply.
        ctx["payment_email"] = email
        _set_substate(conversation, AWAITING_RH_PAYMENT_EMAIL, ctx)
        append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
               payload={"decision": "rh_payment_initialization_failed", "rh_booking_id": str(booking_id), "error_code": error.code})
        return "Your time is held, but I can’t start secure payment right now. Please try again shortly."
    ctx.update({"payment_email": email, "authorization_url": payment.authorization_url})
    _set_substate(conversation, AWAITING_RH_PAYMENT, ctx)
    journey(str(rh_patient_id), "payment_link_sent", f"payment-link-{booking_id}-{retry_count}", booking_id=str(booking_id))
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_pending_payment_created", "rh_booking_id": str(booking_id)})
    amount = _amount_text(ctx)
    if ctx.get("booking_route") == "admin_scheduled_virtual":
        return (
            f"Your virtual consultation booking is ready.{amount} Pay securely here: {payment.authorization_url}\n\n"
            "I’ll message you as soon as your payment comes through."
        )
    return f"Your time is held.{amount} Pay securely here: {payment.authorization_url}"


def _amount_text(ctx: dict) -> str:
    """The amount RH will charge, as stored from its booking response."""
    amount = ctx.get("rh_amount_kobo")
    return f" Amount: ₦{int(amount) // 100:,}." if isinstance(amount, int) and amount > 0 else ""


def _payment_received_reply(context: dict) -> str:
    if context.get("booking_route") == NAMED_ROUTE:
        return named_payment_received_text(context)
    if context.get("booking_route") == "admin_scheduled_virtual":
        return "Your payment has been received. Our care team will assign your clinician, date and time, and I’ll send them here shortly."
    return "Your payment has been received. I’ll confirm the appointment here after the specialist accepts it."


def _not_paid_yet_reply(context: dict) -> str:
    """Honest status for an unpaid booking: never say a payment is being verified when none has arrived."""
    text = "I haven’t received your payment yet. If you’ve just paid, it can take a minute to come through, and I’ll message you here as soon as it does."
    url = str(context.get("authorization_url") or "")
    if url.startswith("https://"):
        text += f"\n\nIf you haven’t paid yet, you can pay securely here: {url}"
    return text


def _continue_rh_replacement(session: Session, conversation: Conversation, patient: Patient, user_text: str) -> str:
    ctx = dict(conversation.booking_context or {})
    choices = list(ctx.get("replacement_choices") or [])
    choice = _parse_index(user_text, len(choices))
    if choice is None:
        return f"Reply with a replacement time number from 1 to {len(choices)}."
    selected = choices[choice - 1]
    try:
        configured_rh_client().reassign_booking(
            str(ctx["rh_booking_id"]), patient_id=str(ctx["rh_patient_id"]),
            physiotherapist_id=str(selected["physiotherapist_id"]), slot_start=int(selected["slot_start"]),
            actor=_rh_actor(patient, str(ctx["rh_patient_id"])),
            idempotency_key=f"joy-reassignment-{ctx['rh_booking_id']}-{selected['slot_start']}",
        )
    except RHIntegrationError:
        return "I couldn’t hold that replacement time. Please choose another option."
    _set_substate(conversation, AWAITING_RH_PAYMENT, ctx)
    return "I’ve sent your replacement booking request to the specialist. I’ll confirm it here once they accept."


def _set_substate(conversation: Conversation, substate: str | None, context: dict) -> None:
    conversation.booking_substate = substate
    conversation.booking_context = context
    db = object_session(conversation)
    if db is not None:
        db.flush()


def _mutable_booking(session: Session, patient_id: UUID) -> Booking | None:
    return session.scalar(
        select(Booking)
        .where(
            Booking.patient_id == patient_id,
            Booking.status.in_(list(_PATIENT_MUTABLE)),
        )
        .order_by(Booking.created_at.desc())
    )


def _payment_booking(
    session: Session, conversation: Conversation, patient: Patient
) -> Booking | None:
    raw = (conversation.booking_context or {}).get("booking_id")
    if raw:
        try:
            row = session.get(Booking, UUID(str(raw)))
        except (ValueError, TypeError):
            row = None
        if row is not None:
            return row
    return _mutable_booking(session, patient.id)


def cancel_notify(
    session: Session,
    booking: Booking,
    *,
    actor_phone: str,
    person_id,
) -> str:
    previous = str(booking.status)
    cancel(booking)
    append(
        session,
        kind=AuditKind.BOOKING,
        actor_phone=actor_phone,
        person_id=person_id,
        payload={
            "decision": "cancelled",
            "booking_id": str(booking.id),
            "previous_status": previous,
        },
    )
    return _CANCELLED


def parse_slot(user_text: str) -> datetime | None:
    match = _SLOT_RE.search(user_text)
    if not match:
        return None
    raw = match.group(1).replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def reschedule(booking: Booking, slot_start: datetime) -> None:
    booking.slot_start = slot_start
    db = object_session(booking)
    if db is not None:
        db.flush()


def _maybe_cancel(
    session: Session, conversation: Conversation, patient: Patient, user_text: str
) -> str | None:
    if not _CANCEL_RE.search(user_text):
        return None
    context = dict(conversation.booking_context or {})
    rh_booking_id = context.get("rh_booking_id")
    rh_patient_id = context.get("rh_patient_id")
    if rh_booking_id and rh_patient_id and _rh_booking_paid(context):
        return paid_booking_change_reply(patient, str(rh_patient_id), "cancel")
    if rh_booking_id and rh_patient_id:
        try:
            configured_rh_client().cancel_booking(
                str(rh_booking_id), patient_id=str(rh_patient_id), reason="patient_requested",
                actor=_rh_actor(patient, str(rh_patient_id)), idempotency_key=f"joy-cancel-{rh_booking_id}",
            )
        except RHIntegrationError:
            return "I can’t cancel this appointment right now. Please try again shortly."
        _set_substate(conversation, None, context)
        append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
               payload={"decision": "rh_booking_cancelled", "rh_booking_id": str(rh_booking_id)})
        return _CANCELLED
    booking = _mutable_booking(session, patient.id)
    if booking is None:
        return None
    reply = cancel_notify(
        session,
        booking,
        actor_phone=patient.phone_e164,
        person_id=patient.id,
    )
    _set_substate(conversation, None, {})
    return reply


def _rh_booking_paid(context: dict) -> bool:
    return context.get("rh_payment_status") == "succeeded" or context.get("rh_booking_status") == "confirmed"


def paid_booking_change_reply(patient: Patient, rh_patient_id: str, action: str) -> str:
    """Paid bookings are cancelled or moved in the dashboard, where the policy is applied."""
    verb = "cancel" if action == "cancel" else "move"
    text = (
        f"Your appointment is paid, so you {verb} it from your Rehabify dashboard. It shows exactly "
        "what happens under our cancellation policy before you confirm: 24 hours or more before the "
        "session you get a full refund, and from 2 to 24 hours before, half the session fee plus travel."
    )
    try:
        result = configured_rh_client().dashboard_link(patient_id=rh_patient_id, sender_phone=patient.phone_e164)
    except RHIntegrationError:
        result = {}
    url = str(result.get("dashboard_url") or "") if isinstance(result, dict) and result.get("ok") else ""
    if url.startswith("https://"):
        return f"{text}\n\nOpen your dashboard: {url}\n\nOr reply here and our care team will help."
    return f"{text}\n\nSign in at https://physioaroundme.com/sign-in, or reply here and our care team will help."


def _maybe_reschedule(session: Session, patient: Patient, user_text: str, conversation: Conversation | None = None) -> str | None:
    if not _RESCHEDULE_RE.search(user_text):
        return None
    context = dict(conversation.booking_context or {}) if conversation is not None else {}
    if context.get("rh_booking_id") and context.get("rh_patient_id") and _rh_booking_paid(context):
        return start_paid_reschedule(session, conversation, patient)
    booking = _mutable_booking(session, patient.id)
    if booking is None:
        return None
    slot = parse_slot(user_text)
    if slot is None:
        return _NEED_TIME
    reschedule(booking, slot)
    return f"I've moved the session to {slot.isoformat()}."


def _maybe_paid_status(
    session: Session,
    conversation: Conversation,
    patient: Patient,
    user_text: str,
) -> str | None:
    if not _PAID_RE.search(user_text):
        return None
    context = conversation.booking_context or {}
    rh_booking_id = context.get("rh_booking_id")
    rh_patient_id = context.get("rh_patient_id")
    if rh_booking_id and rh_patient_id:
        try:
            status = configured_rh_client().booking_status(str(rh_booking_id), patient_id=str(rh_patient_id))
        except RHIntegrationError:
            return "I can’t check the payment status right now. Please try again shortly."
        if status.get("booking_status") == "confirmed":
            _set_substate(conversation, None, dict(context))
            return "Your appointment is confirmed. I’ll send the details here."
        if status.get("payment_status") == "completed" or context.get("rh_payment_status") == "succeeded":
            return _payment_received_reply(context)
        return _not_paid_yet_reply(context)
    booking = _payment_booking(session, conversation, patient)
    if booking is not None and booking.status == BookingStatus.CONFIRMED:
        _set_substate(conversation, None, {})
        return None
    if booking is not None and booking.status == BookingStatus.AWAITING_PAYMENT:
        return _processing_reply(conversation)
    if booking is None and conversation.booking_substate == AWAITING_PAYMENT:
        return _processing_reply(conversation)
    return None


def _processing_reply(conversation: Conversation) -> str:
    url = (conversation.booking_context or {}).get("authorization_url")
    if url:
        return f"{_PROCESSING} Pay here: {url}"
    return _PROCESSING


_KEEP_RE = re.compile(r"\s*(keep|keep it|no|nope|cancel|stop|never ?mind|leave it|don'?t move it)\s*[.!]*\s*", re.I)


def _lagos_label(start_ms: int | float) -> str:
    return datetime.fromtimestamp(start_ms / 1000, timezone.utc).astimezone(_LAGOS).strftime("%a %d %b, %I:%M %p")


def start_paid_reschedule(session: Session, conversation: Conversation, patient: Patient) -> str:
    """Moving a paid booking: the physio's free times to choose from (RH's rules apply on the move).

    Falls back to the dashboard when the times can't be listed here (no physio assigned yet, or
    Rehabify can't be reached).
    """
    ctx = dict(conversation.booking_context or {})
    booking_id, rh_patient_id = ctx.get("rh_booking_id"), ctx.get("rh_patient_id")
    if not booking_id or not rh_patient_id:
        return paid_booking_change_reply(patient, str(rh_patient_id or ""), "reschedule")
    client = configured_rh_client()
    try:
        booking = client.booking_status(str(booking_id), patient_id=str(rh_patient_id))
        physio_id = str(booking.get("physiotherapist_id") or "")
        if not physio_id or booking.get("booking_status") not in {"confirmed", "paid", "scheduled"}:
            return paid_booking_change_reply(patient, str(rh_patient_id), "reschedule")
        mode = str(booking.get("service_mode") or "online")
        duration = int(booking.get("duration_minutes") or 60)
        current = booking.get("session_start")
        slots = [s for s in _slot_choices(client, physio_id, mode, duration_minutes=duration) if s.get("start") != current]
    except (RHIntegrationError, ValueError, TypeError):
        return paid_booking_change_reply(patient, str(rh_patient_id), "reschedule")
    name = ((booking.get("provider") or {}).get("display_name") or "your physio") if isinstance(booking.get("provider"), dict) else "your physio"
    if not slots:
        return (
            f"{name} has no other free times in the next 7 days, so I can't move it here.\n\n"
            + paid_booking_change_reply(patient, str(rh_patient_id), "reschedule")
        )
    ctx["reschedule_slots"] = slots
    ctx["reschedule_provider_name"] = name
    _set_substate(conversation, AWAITING_RH_RESCHEDULE, ctx)
    when = f" (now {_lagos_label(current)})" if isinstance(current, (int, float)) else ""
    lines = [f"Let's move your appointment{when}. {name}'s free times (Lagos time):"]
    lines += [f"{index}. {_lagos_label(slot['start'])}" for index, slot in enumerate(slots, 1)]
    lines += ["", "Reply with a number, or *KEEP* to keep your current time. Within 24 hours of the visit you can move it once for free."]
    return "\n".join(lines)


def _move_appointment_reminders(session: Session, booking_id: str, new_start_ms: int) -> None:
    """The booking's pending reminders (30 minutes before, at the start) follow the new time."""
    from app.models.appointment_reminder import AppointmentReminder

    if not booking_id:
        return
    new_start = datetime.fromtimestamp(new_start_ms / 1000, timezone.utc)
    for reminder in session.scalars(select(AppointmentReminder).where(
        AppointmentReminder.rh_booking_id == booking_id, AppointmentReminder.status == "pending",
    )):
        shift = new_start - reminder.session_start
        reminder.session_start = new_start
        reminder.reminder_at = reminder.reminder_at + shift
    session.flush()


def _continue_rh_reschedule(session: Session, conversation: Conversation, patient: Patient, user_text: str) -> str:
    ctx = dict(conversation.booking_context or {})
    slots = list(ctx.get("reschedule_slots") or [])
    if _KEEP_RE.fullmatch(user_text or ""):
        for key in ("reschedule_slots", "reschedule_provider_name"):
            ctx.pop(key, None)
        _set_substate(conversation, None, ctx)
        return "No problem, your appointment stays as it is."
    choice = _parse_index(user_text, len(slots))
    if choice is None:
        return f"Reply with a time number from 1 to {len(slots)}, or *KEEP* to keep your current time."
    slot = slots[choice - 1]
    rh_patient_id = str(ctx.get("rh_patient_id") or "")
    try:
        result = configured_rh_client().operational_mutation(
            "patient_reschedule_booking",
            actor=_rh_actor(patient, rh_patient_id),
            data={"patient_id": rh_patient_id, "booking_id": str(ctx.get("rh_booking_id") or ""), "slot_start": int(slot["start"])},
            idempotency_key=f"joy-reschedule-{ctx.get('rh_booking_id')}-{int(slot['start'])}",
        )
    except RHIntegrationError:
        return "I couldn't move it just now. Please reply with the number again in a few minutes, or *KEEP* to keep your time."
    if not result.get("moved"):
        reason = str(result.get("message") or "That time can't be booked any more.")
        return f"{reason}\n\nReply with another number, or *KEEP* to keep your current time."
    for key in ("reschedule_slots", "reschedule_provider_name"):
        ctx.pop(key, None)
    _set_substate(conversation, None, ctx)
    _move_appointment_reminders(session, str(ctx.get("rh_booking_id") or ""), int(slot["start"]))
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_booking_rescheduled", "rh_booking_id": str(ctx.get("rh_booking_id") or "")})
    name = ctx.get("reschedule_provider_name") or result.get("physio_name") or "your physio"
    return (
        f"Done. I've asked {name} to confirm {_lagos_label(slot['start'])} (Lagos time). "
        "Your new time shows in your Rehabify dashboard, and your reminders follow it once it's confirmed."
    )


def _paystack_callback_url() -> str:
    configured = (get_settings().paystack_callback_url or "").strip()
    if configured:
        return configured
    return _PLACEHOLDER_CALLBACK


def _parse_index(user_text: str, n: int) -> int | None:
    match = _INDEX_RE.search(user_text)
    if not match:
        return None
    idx = int(match.group(1))
    if 1 <= idx <= n:
        return idx
    return None


def _parse_mode(user_text: str) -> str | None:
    lower = user_text.lower()
    if "teleconsult" in lower:
        return "teleconsult"
    if re.search(r"home[\s_-]?visit", lower):
        return "home_visit"
    return None


def _physio_ids(conversation: Conversation) -> list[str]:
    return list((conversation.booking_context or {}).get("physio_ids") or [])


def _continue_offering(
    session: Session,
    conversation: Conversation,
    patient: Patient,
    user_text: str,
    paystack,
) -> str:
    ids = _physio_ids(conversation)
    if not ids:
        return NO_SPECIALIST_YET
    index = _parse_index(user_text, len(ids))
    mode = _parse_mode(user_text)
    if index is not None and mode is not None:
        return _start_payment(session, conversation, patient, ids, index, mode, paystack)
    if index is not None:
        ctx = dict(conversation.booking_context or {})
        ctx["selected_index"] = index
        _set_substate(conversation, AWAITING_SLOT_MODE, ctx)
        return _SLOT_PROMPT
    n = len(ids)
    return f"Reply with a number from 1 to {n} and teleconsult or home_visit."


def _continue_slot_mode(
    session: Session,
    conversation: Conversation,
    patient: Patient,
    user_text: str,
    paystack,
) -> str:
    ids = _physio_ids(conversation)
    index = (conversation.booking_context or {}).get("selected_index")
    mode = _parse_mode(user_text)
    if isinstance(index, int) and mode is not None and ids:
        return _start_payment(session, conversation, patient, ids, index, mode, paystack)
    picked = _parse_index(user_text, len(ids)) if ids else None
    if picked is not None:
        ctx = dict(conversation.booking_context or {})
        ctx["selected_index"] = picked
        _set_substate(conversation, AWAITING_SLOT_MODE, ctx)
        return _SLOT_PROMPT
    return _SLOT_PROMPT


def _start_payment(
    session: Session,
    conversation: Conversation,
    patient: Patient,
    physio_ids: list[str],
    index: int,
    mode: str,
    paystack,
) -> str:
    physio = session.get(Physiotherapist, UUID(physio_ids[index - 1]))
    if physio is None:
        return NO_SPECIALIST_YET
    active = get_active_booking(session, patient.id)
    if active is not None:
        if active.status in {BookingStatus.AWAITING_PAYMENT, BookingStatus.PROCESSING}:
            return _processing_reply(conversation)
        return "You already have a session booked. Reply cancel if you want to change it."
    booking = create_draft(
        session,
        patient.id,
        physio.id,
        mode,
        slot_start=None,
        amount_kobo=physio.price_kobo,
    )
    reference = f"joy-{uuid4().hex}"
    email = f"{patient.phone_e164}@patients.rehabify.invalid"
    callback_url = _paystack_callback_url()
    if paystack is not None:
        result = paystack.initialize_transaction(
            email, physio.price_kobo, reference, callback_url
        )
    else:
        result = initialize_transaction(
            email, physio.price_kobo, reference, callback_url
        )
    mark_awaiting_payment(booking, result["reference"])
    send_session_reminder(booking.id)
    url = result["authorization_url"]
    ctx = dict(conversation.booking_context or {})
    ctx["booking_id"] = str(booking.id)
    ctx["authorization_url"] = url
    _set_substate(conversation, AWAITING_PAYMENT, ctx)
    return f"Pay here: {url}"


# ---------------------------------------------------------------------------------------------
# Self-referral booking (app/triage/self_referral.py; owner's guide, Nov 2026)
#
# After triage Joy shows up to 3 named physios free within 24 hours (best first, RH ranks them:
# convex/joyMatching.ts), each with their photo when they've uploaded one. The patient picks
# one, sees the time and price, and taps Confirm and pay (which accepts the booking policy),
# Choose another time, or Cancel. Then the receipt email and the Paystack link, as before.
# Nobody free within 24 hours: the care team is alerted and arranges it.
# ---------------------------------------------------------------------------------------------

AWAITING_RH_NAMED_PROVIDER = "rh_awaiting_named_provider"
AWAITING_RH_CONFIRM = "rh_awaiting_confirm"
AWAITING_RH_OTHER_TIME = "rh_awaiting_other_time"
NAMED_ROUTE = "named_online"
INITIAL_CONSULT_MINUTES = 20  # RH prices a 20-minute online visit as the ₦6,000 initial consultation
MATCH_WINDOW_HOURS = 24
_PAGE = 3
_KEYCAPS = ("1\ufe0f\u20e3", "2\ufe0f\u20e3", "3\ufe0f\u20e3", "4\ufe0f\u20e3", "5\ufe0f\u20e3", "6\ufe0f\u20e3")
_CANT_REACH = (
    "I can't reach Rehabify's booking service right now, so nothing has been booked. "
    "Please reply *TRY AGAIN* in a few minutes, or *CALL ME* and our care team will help."
)
_CONFIRM_WORDS = {
    "confirm and pay", "confirm", "confirm & pay", "yes", "yes please", "pay", "book", "book it", "ok", "okay",
    "go ahead", "proceed", "continue", "yes confirm", "i confirm", "confirm it",
}
_MORE_WORDS = {"more", "see more", "show more", "others", "other options", "more options", "next", "see others"}
_CANCEL_WORDS = {"cancel", "no", "not now", "no thanks", "stop", "none", "no thank you", "later"}
_QUESTION_RE = re.compile(r"\?|^(what|how|why|when|where|who|which|is|are|can|do|does|will|should|could)\b", re.I)


def when_label(start_ms: int | float, *, now: datetime | None = None) -> str:
    """"Today, 3:00 PM", "Tomorrow, 10:00 AM" or "Thu 6 Nov, 2:00 PM" (Lagos time)."""
    when = datetime.fromtimestamp(float(start_ms) / 1000, timezone.utc).astimezone(_LAGOS)
    today = (now or datetime.now(timezone.utc)).astimezone(_LAGOS).date()
    clock = when.strftime("%I:%M %p").lstrip("0")
    if when.date() == today:
        return f"Today, {clock}"
    if when.date() == today + timedelta(days=1):
        return f"Tomorrow, {clock}"
    return f"{when.strftime('%a')} {when.day} {when.strftime('%b')}, {clock}"


def _naira(kobo: object) -> str:
    return f"₦{int(kobo) // 100:,}" if isinstance(kobo, (int, float)) and kobo > 0 else "₦6,000"


def _present_named_policy(ctx: dict, language: str | None) -> dict | None:
    """The current RH-approved booking policy, kept so Confirm and pay can accept that version."""
    try:
        document = configured_rh_client().current_policy(language=language or "en")
    except RHIntegrationError:
        return None
    if not document.is_approved:
        return None
    policy = {
        "policy_id": document.policy_id, "version": document.version, "url": document.url,
        "content_sha256": document.content_sha256, "effective_at": document.effective_at,
        "acceptance_text": document.acceptance_text, "language": document.language,
        "presented_at": datetime.now(timezone.utc).isoformat(),
    }
    ctx["sr_policy"] = policy
    return policy


def _photo_cards(providers: list[dict], start: int, end: int) -> list[dict]:
    """A photo with name, specialty and next free time, for each physio who has uploaded one."""
    from app.exercises.media import is_profile_photo_url

    cards = []
    for index in range(start, min(end, len(providers))):
        provider = providers[index]
        url = provider.get("photo_url")
        if not isinstance(url, str) or not is_profile_photo_url(url):
            continue  # no photo: the list below has their details; never a placeholder
        lines = [f"{_KEYCAPS[index]} {provider.get('display_name') or 'Physiotherapist'}"]
        if provider.get("specialty_label"):
            lines.append(str(provider["specialty_label"]))
        if provider.get("next_slot_start"):
            lines.append(f"Next available: {when_label(provider['next_slot_start'])}")
        cards.append({"photo_url": url, "caption": "\n".join(lines)})
    return cards


def named_list_text(providers: list[dict], start: int, end: int, *, urgent: bool = False, when: str = "in the next 24 hours") -> str:
    end = min(end, len(providers))
    count = end - start
    if start:
        head = f"Here are more physiotherapists free {when}:"
    elif urgent:
        head = "Here are the physiotherapists free soonest:"
    else:
        head = f"Here {'is' if count == 1 else 'are'} {count} physiotherapist{'' if count == 1 else 's'} free {when}:"
    blocks = [head]
    for index in range(start, end):
        provider = providers[index]
        lines = [f"{_KEYCAPS[index]} *{provider.get('display_name') or 'Physiotherapist'}*"]
        if provider.get("specialty_label"):
            lines.append(f"   {provider['specialty_label']}")
        if provider.get("next_slot_start"):
            lines.append(f"   Next available: {when_label(provider['next_slot_start'])}")
        blocks.append("\n".join(lines))
    price = _naira(providers[start].get("amount_kobo") if providers else None)
    more = ", or *See more*" if end < len(providers) else ""
    blocks.append(
        f"The initial consultation is {price}: an online video call of about 20 minutes.\n\n"
        f"Would you like to book one? Reply with the number{more}."
    )
    return "\n\n".join(blocks)


# ── Requests at any step of the named-physio booking (owner's test, 9 Nov 2026) ─────────────
# "I want to cancel booking" at the physio list got "reply 1 to 4", and "Olamide Akinwola" at the
# time list got "reply 1 to 8". These are acted on first; then the step carries on.

_STOP_BOOKING_RE = re.compile(
    r"\b(?:cancel(?:\s+(?:the|my|this))?\s+(?:booking|appointment|it all|everything)|"
    r"i\s+(?:want|wan|would like|'d like)\s+to\s+cancel|stop\s+(?:the\s+)?booking|"
    r"(?:don't|do not|dont)\s+want\s+to\s+book|not\s+booking\s+(?:any\s*more|again)|forget\s+it)\b",
    re.I,
)
_CHANGE_PHYSIO_RE = re.compile(
    r"\b(?:change|switch|swap)\s+(?:my\s+|the\s+)?(?:physio(?:therapist)?|pt|therapist)\b|"
    r"\b(?:another|different|new|other)\s+(?:physio(?:therapist)?|pt|therapist)\b|"
    r"\bsomeone\s+else\b",
    re.I,
)
_CHANGE_DAY_RE = re.compile(
    r"\b(?:change|another|different|other|new)\s+(?:the\s+)?day\b|\b(?:a|another)\s+different\s+day\b|"
    r"\bnot\s+(?:today|tomorrow)\b|\b(?:next week|this week)\b|"
    r"\b(?:on|for|this|next)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|"
    r"^(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)$",
    re.I,
)
# "Book Olamide", "I want Olamide Akinwola", "can I see Grace?": a name the patient asked for
_NAMED_ASK_RE = re.compile(
    # The request words in any case; the name itself must start with a capital
    r"\b(?i:book(?:\s+with)?|i\s+want|i'?d\s+like|i\s+would\s+like|i\s+prefer|can\s+i\s+(?:have|book|see|get)|"
    r"with)\s+(?i:dr\.?\s+|physio\s+|pt\s+)?([A-Z][a-z]{2,})(?:\s+([A-Z][a-z]{2,}))?",
)
_NAME_STOPWORDS = {"the", "you", "him", "her", "them", "another", "someone", "physio", "time", "day", "this",
                   "that", "one", "pay", "today", "tomorrow", "monday", "tuesday", "wednesday", "thursday",
                   "friday", "saturday", "sunday", "video", "home", "online", "female", "male", "joy"}


def _provider_by_name(providers: list[dict], text: str) -> int | None:
    """The index of the physio whose name the patient wrote (first or last name, 3+ letters)."""
    words = {w for w in re.findall(r"[a-zà-ÿ']{3,}", (text or "").casefold()) if w not in _NAME_STOPWORDS}
    if not words:
        return None
    best, best_score = None, 0
    for index, provider in enumerate(providers):
        names = {w for w in re.findall(r"[a-zà-ÿ']{3,}", str(provider.get("display_name") or "").casefold())}
        score = len(words & names)
        if score > best_score:
            best, best_score = index, score
    return best


def _named_route_request(
    session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, user_text: str,
) -> str | None:
    """Cancel, change physio, a named physio or another day, at any named-booking step (None: not one)."""
    from app.triage import timing
    from app.triage.self_referral import FLOW_KEY, SR_KEY, TIMING

    ctx = dict(conversation.booking_context or {})
    if ctx.get("booking_route") != NAMED_ROUTE:
        return None
    text = user_text or ""
    paid = _rh_booking_paid(ctx)
    providers = [p for p in ctx.get("providers") or [] if isinstance(p, dict)]

    def ask_timing(lead: str) -> str:
        sr = dict(ctx.get(SR_KEY) or {})
        sr["menu"] = timing.timing_buttons()
        sr.pop("timing_days", None)
        ctx[SR_KEY] = sr
        ctx[FLOW_KEY] = TIMING
        for key in ("selected_provider", "selected_slot", "slots"):
            ctx.pop(key, None)
        _set_substate(conversation, None, ctx)
        return f"{lead}{timing.TIMING_TEXT}"

    if _STOP_BOOKING_RE.search(text):
        if paid:
            return paid_booking_change_reply(patient, str(ctx.get("rh_patient_id") or ""), "cancel")
        released = _maybe_cancel(session, conversation, patient, "cancel") if ctx.get("rh_booking_id") else None
        if released is not None and released != _CANCELLED:
            return released  # the held time couldn't be released yet: say so, never claim it was
        ctx = dict(conversation.booking_context or {})
        for key in ("selected_provider", "selected_slot", "slots", "rh_booking_id", "authorization_url"):
            ctx.pop(key, None)
        sr = dict(ctx.get(SR_KEY) or {})
        sr["menu"] = timing.timing_buttons()
        ctx[SR_KEY] = sr
        ctx[FLOW_KEY] = TIMING
        _set_substate(conversation, None, ctx)
        append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
               payload={"decision": "named_booking_stopped", "released_hold": released is not None})
        return (
            "Okay, I've cancelled that, so nothing is booked and you haven't been charged.\n\n"
            "Whenever you're ready, just tell me when you're free and I'll find you a physiotherapist."
        )

    if _CHANGE_PHYSIO_RE.search(text) and not (conversation.booking_substate == AWAITING_RH_CONFIRM and _norm_text(text) in _CANCEL_WORDS):
        if paid:
            # A paid booking changes physio only with the care team's approval
            from app.admin.escalation_router import route_escalation

            try:
                route_escalation(session, "change_physio", {
                    "patient_id": str(ctx.get("rh_patient_id") or patient.id), "phone": patient.phone_e164,
                    "booking_id": str(ctx.get("rh_booking_id") or ""), "text": text[:200],
                })
            except Exception:
                logger.warning("joy_change_physio_alert_failed", exc_info=True)
            return (
                "I've asked our care team to approve a change of physiotherapist for your booking. "
                "Someone will message you here shortly. Your current booking stays in place until then."
            )
        if providers:
            selected = (ctx.get("selected_provider") or {}).get("physiotherapist_id")
            others = [p for p in providers if p.get("physiotherapist_id") != selected] or providers
            ctx["providers"] = others
            ctx["providers_shown"] = min(_PAGE, len(others))
            for key in ("selected_provider", "selected_slot", "slots"):
                ctx.pop(key, None)
            ctx["_before"] = _photo_cards(others, 0, ctx["providers_shown"])
            _set_substate(conversation, AWAITING_RH_NAMED_PROVIDER, ctx)
            return named_list_text(others, 0, ctx["providers_shown"], when=str(ctx.get("window_label") or "in the next 24 hours"))

    if not paid and providers:
        index = _provider_by_name(providers, text)
        if index is not None and (_NAMED_ASK_RE.search(text) or len(text.split()) <= 4):
            ctx["providers_shown"] = max(int(ctx.get("providers_shown") or 0), index + 1)
            for key in ("selected_provider", "selected_slot", "slots"):
                ctx.pop(key, None)
            _set_substate(conversation, AWAITING_RH_NAMED_PROVIDER, ctx)
            return _continue_named_provider(session, conversation, patient, str(index + 1))
        asked = _NAMED_ASK_RE.search(text)
        if asked and asked.group(1).casefold() not in _NAME_STOPWORDS:
            name = " ".join(part for part in asked.groups() if part)
            when = str(ctx.get("window_label") or "in the next 24 hours")
            return (
                f"{name} isn't one of the physiotherapists free {when}. Reply *change day* to look at another "
                "day, or choose from the list I sent."
            )

    if not paid and _CHANGE_DAY_RE.search(text):
        choice = timing.parse_timing(text)
        window = timing.window_for(choice) if choice not in (None, "choose") else None
        if window is None:
            return ask_timing("No problem. ")
        sr = dict(ctx.get(SR_KEY) or {})
        sr["window"] = window.as_dict()
        ctx[SR_KEY] = sr
        for key in ("selected_provider", "selected_slot", "slots"):
            ctx.pop(key, None)
        conversation.booking_context = ctx
        reply, before = offer_named_physios(
            session, conversation, patient, extracted, urgent=False,
            language=getattr(patient, "preferred_language", None), intro="", window=window.as_dict(),
            physio_sex=sr.get("physio_pref"),
        )
        if before:
            fresh = dict(conversation.booking_context or {})
            fresh["_before"] = before
            conversation.booking_context = fresh
        return reply
    return None


def _norm_text(text: str) -> str:
    return " ".join((text or "").casefold().split()).strip(" .!?")


def hand_to_care_team(session: Session, conversation: Conversation, patient: Patient, *, rh_patient_id: str | None, reason_text: str) -> str:
    """Nobody fits and is free within 24 hours: the care team arranges it (owner decision, Nov 2026)."""
    from app.admin.escalation_router import route_escalation
    from app.triage.self_referral import CARE_TEAM, CARE_TEAM_HANDOFF, FLOW_KEY

    if rh_patient_id:
        try:
            configured_rh_client().operational_mutation(
                "patient_request_callback", actor=_rh_actor(patient, rh_patient_id),
                data={"patient_id": rh_patient_id, "reason": "no_match", "text": reason_text[:200]},
                idempotency_key=f"joy-no-match-{conversation.id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H')}",
            )
        except RHIntegrationError as error:
            logger.warning("joy_no_match_alert_failed code=%s", error.code)
        journey(rh_patient_id, "handed_to_human", f"no-match-{conversation.id}-{datetime.now(timezone.utc).strftime('%Y%m%d')}")
    route_escalation(session, "no_match", {
        "patient_id": str(patient.id), "phone": patient.phone_e164, "text": reason_text[:160],
    })
    ctx = dict(conversation.booking_context or {})
    ctx[FLOW_KEY] = CARE_TEAM
    for key in ("providers", "providers_shown", "selected_provider", "selected_slot", "slots"):
        ctx.pop(key, None)
    _set_substate(conversation, None, ctx)
    append(session, kind=AuditKind.MATCH, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "self_referral_no_match_care_team", "conversation_id": str(conversation.id)})
    return CARE_TEAM_HANDOFF


def offer_named_physios(
    session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, *,
    urgent: bool, language: str | None, intro: str, window: dict | None = None, physio_sex: str | None = None,
) -> tuple[str, list[dict]]:
    """(the list to book from, the messages before it: the outcome, then the physios' photos).

    ``window`` is the patient's answer to "When are you free?" (app/triage/timing.py); without one
    (a conversation from before that step) it's the next 24 hours.
    """
    from app.triage import timing

    ctx = dict(conversation.booking_context or {})
    lead = [{"text": intro}] if intro else []
    chosen = timing.window_from(window) or timing.Window(MATCH_WINDOW_HOURS, "in the next 24 hours", None, "soon")
    rh_patient_id = _rh_patient_id(session, patient)
    tags = _required_specialties(extracted) or ["msk"]
    if not rh_patient_id:
        return _CANT_REACH, lead
    if _present_named_policy(ctx, language) is None:
        return _CANT_REACH, lead
    try:
        matches = configured_rh_client().match_physios(
            patient_id=rh_patient_id, assessment_id=str(_current_assessment(session, patient)), assessment_revision=1,
            required_specialties=tags, service_mode="online", actor=_rh_actor(patient, rh_patient_id),
            city=patient.city or None, area=patient.area or None, latitude=patient.lat, longitude=patient.lng,
            within_hours=chosen.within_hours, language=language, duration_minutes=INITIAL_CONSULT_MINUTES,
            urgent=urgent, limit=6, not_before_ms=chosen.not_before_ms,
            physio_sex=physio_sex if physio_sex in ("female", "male") else None,
        )
    except (RHIntegrationError, ValueError) as error:
        logger.warning("joy_named_matching_failed error=%s", getattr(error, "code", type(error).__name__))
        return _CANT_REACH, lead
    # Never "Physiotherapist" with no name (RH leaves them out too)
    providers = [dict(m.__dict__) for m in matches if m.next_slot_start and (m.display_name or "").strip()]
    if not providers and not urgent and chosen.kind != "week":
        # Nobody that day: offer another time before handing over (the patient chose the window)
        from app.triage.self_referral import FLOW_KEY, SR_KEY, TIMING

        sr = dict(ctx.get(SR_KEY) or {})
        sr["menu"] = timing.timing_buttons()
        sr.pop("timing_days", None)
        ctx[SR_KEY] = sr
        ctx[FLOW_KEY] = TIMING
        _set_substate(conversation, None, ctx)
        who = f"a {physio_sex} physiotherapist" if physio_sex in ("female", "male") else "a physiotherapist"
        return (
            f"I couldn't find {who} who fits and is free {chosen.label}. When else are you free? "
            "Or reply *care team* and our team will arrange it for you."
        ), lead
    if not providers:
        conversation.booking_context = ctx
        area = (extracted.body_location or extracted.body_region or "").strip()
        reply = hand_to_care_team(
            session, conversation, patient, rh_patient_id=rh_patient_id,
            reason_text=f"{'Urgent' if urgent else 'Routine'} triage{f', {area}' if area else ''}, free {chosen.label}. Language: {language or 'en'}.",
        )
        return reply, lead
    shown = min(_PAGE, len(providers))
    ctx.update({
        "rh_patient_id": rh_patient_id, "service_mode": "online", "required_specialties": tags,
        "providers": providers, "providers_shown": shown, "booking_route": NAMED_ROUTE, "sr_urgent": urgent,
        "window_label": chosen.label,
    })
    for key in ("selected_provider", "selected_slot", "slots", "rh_booking_id", "authorization_url", "rh_payment_status", "policy_accepted"):
        ctx.pop(key, None)
    _set_substate(conversation, AWAITING_RH_NAMED_PROVIDER, ctx)
    append(session, kind=AuditKind.MATCH, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_named_matches_presented", "urgent": urgent,
                    "provider_ids": [p["physiotherapist_id"] for p in providers]})
    send_triage_snapshot(session, conversation, patient, rh_patient_id=str(rh_patient_id))
    journey(rh_patient_id, "matches_shown", f"matches-{conversation.id}-named")
    return named_list_text(providers, 0, shown, urgent=urgent, when=chosen.label), [*lead, *_photo_cards(providers, 0, shown)]


def _continue_named_provider(session: Session, conversation: Conversation, patient: Patient, user_text: str) -> str | None:
    ctx = dict(conversation.booking_context or {})
    providers = [p for p in ctx.get("providers") or [] if isinstance(p, dict)]
    shown = int(ctx.get("providers_shown") or min(_PAGE, len(providers)))
    text = " ".join((user_text or "").casefold().split()).strip(" .!?")
    if not providers:
        return None
    if text in _MORE_WORDS or "see more" in text or "more option" in text:
        when = str(ctx.get("window_label") or "in the next 24 hours")
        if shown >= len(providers):
            return (
                f"Those are all the physiotherapists free {when}. Reply with a number to book, "
                "*change day* for another time, or *CALL ME* if you'd like our care team to help."
            )
        end = min(shown + _PAGE, len(providers))
        ctx["providers_shown"] = end
        ctx["_before"] = _photo_cards(providers, shown, end)
        _set_substate(conversation, AWAITING_RH_NAMED_PROVIDER, ctx)
        return named_list_text(providers, shown, end, when=when)
    match = re.fullmatch(r"(?:book\s*(?:number\s*)?|number\s*|option\s*|no\.?\s*)?([1-6])(?:\s*please)?", text)
    if match is None:
        for index, provider in enumerate(providers[:shown], 1):
            name = str(provider.get("display_name") or "").casefold()
            if name and (text == name or (len(text) >= 4 and text in name)):
                match = re.match(r"(\d)", str(index))
                break
    if match is None or int(match.group(1)) > shown:
        if _QUESTION_RE.search(text):
            return None  # a question: answered from the booking facts (app/booking/step_help.py)
        more = ", or *See more*" if shown < len(providers) else ""
        return f"Reply with a number from 1 to {shown} to book{more}."
    provider = providers[int(match.group(1)) - 1]
    ctx["selected_provider"] = provider
    ctx["selected_slot"] = {"start": provider.get("next_slot_start"), "end": provider.get("next_slot_end")}
    _set_substate(conversation, AWAITING_RH_CONFIRM, ctx)
    return confirm_text(ctx)


def confirm_text(ctx: dict) -> str:
    provider = ctx.get("selected_provider") or {}
    slot = ctx.get("selected_slot") or {}
    policy = ctx.get("sr_policy") or {}
    url = str(policy.get("url") or "https://physioaroundme.com/consultation-booking-policy")
    when = when_label(slot["start"]) if isinstance(slot.get("start"), (int, float)) else "the time shown"
    return (
        f"You've selected *{provider.get('display_name') or 'your physiotherapist'}*.\n\n"
        "Initial consultation\n"
        f"📅 {when}\n"
        "💻 Online video call, about 20 minutes\n"
        f"💳 {_naira(provider.get('amount_kobo'))}\n\n"
        f"By tapping *Confirm and pay*, you accept our Consultation & Booking Policy: {url}\n\n"
        "Would you like to confirm?"
    )


def _render_other_times(provider: dict, slots: list[dict]) -> str:
    lines = [f"Other free times with {provider.get('display_name') or 'this physiotherapist'} (Lagos time):"]
    for index, slot in enumerate(slots, 1):
        lines.append(f"{index}. {when_label(slot['start'])}")
    lines.append("Reply with the number of the time you'd like, or *Back* to keep the first one.")
    return "\n".join(lines)


def _continue_confirm(
    session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage,
    user_text: str, wa_message_id: str | None,
) -> str | None:
    ctx = dict(conversation.booking_context or {})
    provider = ctx.get("selected_provider") or {}
    text = " ".join((user_text or "").casefold().split()).strip(" .!?")
    if text in _CONFIRM_WORDS or text.startswith("confirm"):
        return _hold_named_slot(session, conversation, patient, extracted, ctx, wa_message_id)
    if "another time" in text or "other time" in text or "different time" in text or text in {"change time", "another", "later time", "choose another time"}:
        try:
            slots = _slot_choices(configured_rh_client(), str(provider.get("physiotherapist_id")), "online", duration_minutes=INITIAL_CONSULT_MINUTES)
        except RHIntegrationError:
            return "I can't load other times right now. Tap *Confirm and pay* to keep this time, or try again in a few minutes."
        if not slots:
            return (
                f"{provider.get('display_name') or 'This physiotherapist'} has no other free times this week. "
                "Tap *Confirm and pay* to keep this time, or *Cancel* to choose another physiotherapist."
            )
        ctx["slots"] = slots
        _set_substate(conversation, AWAITING_RH_OTHER_TIME, ctx)
        return _render_other_times(provider, slots)
    if text in _CANCEL_WORDS:
        ctx.pop("selected_provider", None)
        ctx.pop("selected_slot", None)
        _set_substate(conversation, AWAITING_RH_NAMED_PROVIDER, ctx)
        providers = [p for p in ctx.get("providers") or [] if isinstance(p, dict)]
        shown = int(ctx.get("providers_shown") or min(_PAGE, len(providers)))
        more = ", or *See more*" if shown < len(providers) else ""
        return (
            "No problem, nothing has been booked. Reply with a number to choose another physiotherapist"
            f"{more}. You can also come back to this any time."
        )
    if _QUESTION_RE.search(text):
        return None
    return "Please tap *Confirm and pay*, *Choose another time* or *Cancel*.\n\n" + confirm_text(ctx)


def _continue_other_time(session: Session, conversation: Conversation, patient: Patient, user_text: str) -> str | None:
    ctx = dict(conversation.booking_context or {})
    slots = [s for s in ctx.get("slots") or [] if isinstance(s, dict) and isinstance(s.get("start"), (int, float))]
    text = " ".join((user_text or "").casefold().split()).strip(" .!?")
    if text in {"back", "keep", "keep the first one", "keep first", "cancel", "no"}:
        _set_substate(conversation, AWAITING_RH_CONFIRM, ctx)
        return confirm_text(ctx)
    selected = _parse_index(user_text, len(slots))
    if selected is None:
        if _QUESTION_RE.search(text):
            return None
        return f"Reply with a time number from 1 to {len(slots)}, or *Back* to keep the first time."
    slot = slots[selected - 1]
    ctx["selected_slot"] = {"start": slot["start"], "end": slot.get("end")}
    _set_substate(conversation, AWAITING_RH_CONFIRM, ctx)
    return confirm_text(ctx)


NAMED_HOLD_BLOCKED = (
    "I need our care team to check one thing before I can book this time, so nothing has been booked "
    "or charged. Someone will message you here shortly."
)


def _named_hold_blocked(session: Session, conversation: Conversation, patient: Patient, rh_patient_id: str, reason: str) -> str:
    """The booking safety check refused: say so once, and let a person sort it out (never a retry loop)."""
    from app.admin.escalation_router import route_escalation

    logger.warning("joy_named_hold_not_eligible reason=%s", reason)
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_named_hold_not_eligible", "reason": reason})
    try:
        route_escalation(session, "booking_blocked", {
            "patient_id": rh_patient_id, "phone": patient.phone_e164, "reason": reason,
        })
    except Exception:
        logger.warning("joy_booking_blocked_alert_failed", exc_info=True)
    return NAMED_HOLD_BLOCKED


def _hold_named_slot(
    session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, ctx: dict, wa_message_id: str | None,
) -> str:
    """Confirm and pay: accept the policy shown, hold the time in RH, then ask for the receipt email."""
    from app.triage.self_referral import SR_KEY, physio_summary

    provider = ctx.get("selected_provider") or {}
    slot = ctx.get("selected_slot") or {}
    rh_patient_id = ctx.get("rh_patient_id")
    policy = ctx.get("sr_policy") or _present_named_policy(ctx, getattr(patient, "preferred_language", None))
    if not provider or not isinstance(slot.get("start"), (int, float)) or not rh_patient_id or not policy:
        return "I need to refresh your booking details first. Please reply *TRY AGAIN*."
    accepted = {
        **policy,
        "accepted_at": datetime.now(timezone.utc).isoformat(),
        "acceptance_message_id": wa_message_id or f"joy-confirm-{conversation.id}-{int(slot['start'])}",
        "actor_phone": patient.phone_e164,
    }
    ctx["policy_accepted"] = accepted
    # The safety gate below reads the acceptance from the conversation, so it is saved first.
    # (Kept only in this copy, every Confirm and pay was refused as "policy not accepted".)
    conversation.booking_context = dict(ctx)
    session.flush()
    append(session, kind=AuditKind.POLICY, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"event": "accepted", "via": "confirm_and_pay", **accepted})
    try:
        rh_client = configured_rh_client()
        eligibility_reference: str | None = None
        if rh_client.uses_direct_convex_gateway:
            eligibility = issue_eligibility_reference(
                session=session, settings=get_settings(),
                payload=EligibilityRequest(
                    rh_patient_id=str(rh_patient_id), assessment_id=str(_current_assessment(session, patient)),
                    assessment_revision=1, service_type="standard_consultation", policy_version=str(policy["version"]),
                ),
                conversation=conversation,
            )
            if not eligibility.get("allowed"):
                return _named_hold_blocked(session, conversation, patient, str(rh_patient_id), str(eligibility.get("reason") or "unknown"))
            eligibility_reference = eligibility.get("eligibility_reference")
        booking = rh_client.create_pending_booking(
            patient_id=str(rh_patient_id), physiotherapist_id=str(provider["physiotherapist_id"]),
            slot_start=int(slot["start"]), duration_minutes=INITIAL_CONSULT_MINUTES, service_mode="online",
            session_type="physiotherapy", triage_summary_reference=str(_current_assessment(session, patient)),
            assessment_id=str(_current_assessment(session, patient)), assessment_revision=1,
            protocol_version="clinical_engine_v1", policy_version=str(policy["version"]),
            policy_acceptance_reference=str(accepted["acceptance_message_id"]),
            conversation_id=str(conversation.id), actor=_rh_actor(patient, str(rh_patient_id)),
            idempotency_key=f"joy-named-booking-{conversation.id}-{provider['physiotherapist_id']}-{int(slot['start'])}",
            required_specialties=list(ctx.get("required_specialties") or []), patient_address=patient.location,
            eligibility_reference=eligibility_reference,
        )
    except RHIntegrationError as error:
        append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
               payload={"decision": "rh_named_hold_failed", "error_code": error.code})
        if error.code in {"DEPENDENCY_UNAVAILABLE", "INTEGRATION_NOT_CONFIGURED", "RH_BOOKING_GATEWAY_UNAVAILABLE", "SAFETY_ELIGIBILITY_REQUIRED"}:
            conversation.booking_context = ctx
            return "I can't confirm that time with Rehabify right now, so nothing has been booked. Please tap *Confirm and pay* again in a few minutes."
        try:
            slots = _slot_choices(configured_rh_client(), str(provider["physiotherapist_id"]), "online", duration_minutes=INITIAL_CONSULT_MINUTES)
        except RHIntegrationError:
            slots = []
        if slots:
            ctx["slots"] = slots
            _set_substate(conversation, AWAITING_RH_OTHER_TIME, ctx)
            return "That time has just been taken, so nothing was booked.\n\n" + _render_other_times(provider, slots)
        ctx.pop("selected_provider", None)
        _set_substate(conversation, AWAITING_RH_NAMED_PROVIDER, ctx)
        return "That time has just been taken, so nothing was booked. Please choose another physiotherapist: reply with their number."
    when = when_label(slot["start"])
    sr = dict(ctx.get(SR_KEY) or {})
    sr["physio_summary"] = physio_summary(patient, extracted, sr, appointment=when)
    ctx[SR_KEY] = sr
    ctx.update({"rh_booking_id": booking.booking_id, "rh_amount_kobo": booking.amount_kobo, "service_mode": "online"})
    known_email = _known_email(patient)
    if known_email:
        ctx["suggested_email"] = known_email
    _set_substate(conversation, AWAITING_RH_PAYMENT_EMAIL, ctx)
    send_intake(session, conversation, patient, rh_patient_id=str(rh_patient_id), booking_id=booking.booking_id, policy=accepted)
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_named_booking_held", "rh_booking_id": booking.booking_id})
    held = f"Your time with {provider.get('display_name') or 'your physiotherapist'} ({when}) is held for 30 minutes."
    if known_email:
        return f"{held} Shall I send your payment receipt to {known_email}? Reply YES, or send a different email address."
    return f"{held} Please reply with the email address you'd like your payment receipt sent to."


def named_payment_received_text(context: dict, due_at_ms: int | float | None = None) -> str:
    provider = context.get("selected_provider") or {}
    name = provider.get("display_name") or "Your physiotherapist"
    due = ""
    if isinstance(due_at_ms, (int, float)):
        due = f" by {when_label(due_at_ms)}"
    return (
        f"Payment received ✅ Thank you.\n\n{name} has up to 2 hours{due} to confirm your consultation. "
        "I'll message you here as soon as they do. If they can't, I'll offer you another physiotherapist or a full refund."
    )
