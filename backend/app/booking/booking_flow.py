import logging
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from app.audit.logger import append
from app.booking.paystack_client import initialize_transaction
from app.booking.state import cancel, create_draft, get_active_booking, mark_awaiting_payment
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
from app.queue.tasks import _redis

logger = logging.getLogger(__name__)

OFFERING_MATCHES = "offering_matches"
AWAITING_SLOT_MODE = "awaiting_slot_mode"
AWAITING_PAYMENT = "awaiting_payment"
AWAITING_RH_SERVICE_MODE = "rh_awaiting_service_mode"
AWAITING_RH_LOCATION = "rh_awaiting_location"
AWAITING_RH_PROVIDER = "rh_awaiting_provider"
AWAITING_RH_SLOT = "rh_awaiting_slot"
AWAITING_RH_PAYMENT = "rh_awaiting_payment"
AWAITING_RH_REPLACEMENT = "rh_awaiting_replacement"

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
) -> str | None:
    conversation = session.get(Conversation, state.conversation_id)
    if conversation is None:
        return None

    cancelled = _maybe_cancel(session, conversation, patient, user_text)
    if cancelled is not None:
        return cancelled

    rescheduled = _maybe_reschedule(session, patient, user_text)
    if rescheduled is not None:
        return rescheduled

    paid = _maybe_paid_status(session, conversation, patient, user_text)
    if paid is not None:
        return paid

    sub = conversation.booking_substate
    if sub == AWAITING_RH_REPLACEMENT:
        return _continue_rh_replacement(session, conversation, patient, user_text)
    if sub == AWAITING_RH_SERVICE_MODE:
        return _continue_rh_service_mode(session, conversation, patient, extracted, user_text)
    if sub == AWAITING_RH_LOCATION:
        return _continue_rh_location(session, conversation, patient, extracted, user_text)
    if sub == AWAITING_RH_PROVIDER:
        return _continue_rh_provider(session, conversation, patient, user_text)
    if sub == AWAITING_RH_SLOT:
        return _continue_rh_slot(session, conversation, patient, user_text)
    if sub == AWAITING_RH_PAYMENT:
        return _rh_payment_status(conversation, user_text)
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
    return resolved.patient_id


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


def _location_prompt() -> str:
    return "For a home visit, what city and area are you in? Reply in this format: Area, City — for example, Jabi, Abuja."


def _find_rh_matches(session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, *, mode: str, rh_patient_id: str, tags: list[str]) -> str:
    if mode == "home_visit" and (not patient.city or not patient.area):
        _set_substate(conversation, AWAITING_RH_LOCATION, {
            "rh_patient_id": rh_patient_id, "service_mode": mode, "required_specialties": tags,
        })
        return _location_prompt()
    try:
        matches = configured_rh_client().match_physios(
            patient_id=rh_patient_id, assessment_id=str(_current_assessment(session, patient)), assessment_revision=1,
            required_specialties=tags, service_mode=mode, city=patient.city if mode == "home_visit" else None,
            area=patient.area if mode == "home_visit" else None, actor=_rh_actor(patient, rh_patient_id),
        )
    except RHIntegrationError:
        return "I can’t retrieve live specialist availability right now. Please try again shortly."
    if not matches:
        _set_substate(conversation, None, {})
        if mode == "home_visit":
            return "There are no verified specialists currently serving your area for this care. I can’t offer a home visit there right now. You can ask about clinic or online care instead."
        return NO_SPECIALIST_YET
    providers = [m.__dict__ for m in matches]
    lines = ["Here are the verified specialists available for your care:"]
    for index, match in enumerate(matches, 1):
        lines.append(f"{index}. {match.display_name or 'Physiotherapist'} — ₦{match.amount_kobo // 100:,}")
    lines.append("Reply with the number of the specialist you prefer.")
    _set_substate(conversation, AWAITING_RH_PROVIDER, {
        "rh_patient_id": rh_patient_id, "service_mode": mode, "required_specialties": tags,
        "providers": providers,
    })
    append(session, kind=AuditKind.MATCH, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_matches_presented", "service_mode": mode, "provider_ids": [m.physiotherapist_id for m in matches]})
    return "\n".join(lines)


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


def _continue_rh_location(session: Session, conversation: Conversation, patient: Patient, extracted: ExtractedTriage, user_text: str) -> str:
    parsed = _parse_city_area(user_text)
    if parsed is None:
        return _location_prompt()
    city, area = parsed
    ctx = dict(conversation.booking_context or {})
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
    session.flush()
    append(session, kind=AuditKind.MATCH, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "patient_booking_location_saved", "city": city, "area": area})
    return _find_rh_matches(session, conversation, patient, extracted, mode=mode, rh_patient_id=rh_patient_id, tags=tags)


def _current_assessment(session: Session, patient: Patient) -> UUID:
    triage = session.scalar(select(TriageSession).where(TriageSession.patient_id == patient.id).order_by(TriageSession.created_at.desc()))
    if triage is None:
        raise ValueError("triage assessment is missing")
    return triage.id


def _slot_choices(client, provider_id: str, mode: str) -> list[dict]:
    now = datetime.now(timezone.utc)
    result = client.availability(provider_id, start_ms=int(now.timestamp() * 1000), end_ms=int((now + timedelta(days=7)).timestamp() * 1000), duration_minutes=60, service_mode=mode)
    slots = result.get("slots") or []
    return [slot for slot in slots if isinstance(slot, dict) and isinstance(slot.get("start"), (int, float))][:8]


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
    lines = [f"Available times with {provider.get('display_name') or 'this specialist'}:"]
    for index, slot in enumerate(slots, 1):
        lines.append(f"{index}. {datetime.fromtimestamp(slot['start'] / 1000, timezone.utc).astimezone().strftime('%a %d %b, %I:%M %p')}")
    lines.append("Reply with the time number you prefer.")
    return "\n".join(lines)


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
        booking = configured_rh_client().create_pending_booking(
            patient_id=str(rh_patient_id), physiotherapist_id=str(provider["physiotherapist_id"]),
            slot_start=int(slot["start"]), duration_minutes=60, service_mode=str(ctx["service_mode"]),
            session_type="physiotherapy", triage_summary_reference=str(_current_assessment(session, patient)),
            assessment_id=str(_current_assessment(session, patient)), assessment_revision=1,
            protocol_version="clinical_engine_v1", policy_version=str(policy["version"]),
            policy_acceptance_reference=str(policy.get("acceptance_message_id") or policy["version"]),
            conversation_id=str(conversation.id), actor=_rh_actor(patient, str(rh_patient_id)),
            idempotency_key=f"joy-booking-{conversation.id}-{slot['start']}",
            required_specialties=list(ctx.get("required_specialties") or []), patient_address=patient.location,
        )
        payment = configured_rh_client().initialize_booking_payment(
            booking.booking_id, patient_id=str(rh_patient_id), email=f"{patient.phone_e164}@patients.rehabify.invalid",
            actor=_rh_actor(patient, str(rh_patient_id)), idempotency_key=f"joy-payment-{booking.booking_id}",
        )
    except RHIntegrationError:
        return "I couldn’t reserve that live slot. It may just have been taken; please choose another time."
    ctx.update({"rh_booking_id": booking.booking_id, "authorization_url": payment.authorization_url})
    _set_substate(conversation, AWAITING_RH_PAYMENT, ctx)
    append(session, kind=AuditKind.BOOKING, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_pending_payment_created", "rh_booking_id": booking.booking_id})
    return f"Your slot is held. Complete payment securely here: {payment.authorization_url}"


def _rh_payment_status(conversation: Conversation, user_text: str) -> str | None:
    if _PAY_NUDGE_RE.search(user_text) or _PAID_RE.search(user_text):
        return "Your payment is being verified. I’ll confirm the appointment here after the specialist accepts it."
    return None


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


def _maybe_reschedule(session: Session, patient: Patient, user_text: str) -> str | None:
    if not _RESCHEDULE_RE.search(user_text):
        return None
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
        return "Your payment is being verified. I’ll confirm the appointment here after the specialist accepts it."
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
