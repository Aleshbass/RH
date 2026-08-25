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
from app.models.types import AuditKind, BookingStatus, ExtractedTriage
from app.queue.tasks import _redis

OFFERING_MATCHES = "offering_matches"
AWAITING_SLOT_MODE = "awaiting_slot_mode"
AWAITING_PAYMENT = "awaiting_payment"

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
    area = extracted.condition_area
    if area is None:
        _set_substate(conversation, None, {})
        return NO_SPECIALIST_YET

    physios = eligible_physios(session, area)
    if not physios:
        _set_substate(conversation, None, {})
        return NO_SPECIALIST_YET

    ranked = rank(patient, physios, area)
    if not ranked:
        _set_substate(conversation, None, {})
        return NO_SPECIALIST_YET

    lines = ["Here are specialists I can offer:"]
    for i, row in enumerate(ranked, start=1):
        naira = row.price_kobo // 100
        lines.append(
            f"{i}. {row.display_name} — ₦{naira:,} — rating {row.rating:g} — {area.value}"
        )
    lines.append(_OFFER_FOOTER)
    _set_substate(
        conversation,
        OFFERING_MATCHES,
        {"physio_ids": [str(row.physio_id) for row in ranked]},
    )
    return "\n".join(lines)


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
