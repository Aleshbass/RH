"""Joy for patients already in care (owner, 10 Nov 2026; RH convex/joyConnect.ts).

* ``connect_turn``: "Hi Joy, connect me: K7P3XQ2M", the link their physio or clinic sent them. RH binds
  this WhatsApp number to their Rehabify record (patient_connect) and Joy's mapping follows it, so
  their programme, reminders and visits work here. A phone number alone never connects anyone.
* ``care_summary``: who looks after them, today's programme and the next visit (patient_care_summary),
  cached on the conversation for a few hours.
* ``companion_turn``: for a patient with a physio, the greeting menu, "message my physio", "book a
  visit" with their own physio or clinic (never the first-consultation booking), and an offer to pass
  anything else to their physio instead of starting a new-patient intake. "Someone new" hands the
  conversation back to the usual intake, for a new physiotherapist.

Code-owned replies only: the model never decides who someone's physio is.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.rh_identity_mapping import RHIdentityMapping
from app.models.types import AuditKind

logger = logging.getLogger(__name__)

_CODE = r"([A-Za-z0-9]{4}[\s-]?[A-Za-z0-9]{2,8})"
CONNECT_RE = re.compile(
    rf"^\s*(?:hi|hello|hey)?\s*(?:joy)?\s*[,!.]?\s*connect\s+me\s*[:\-]?\s*{_CODE}\s*[.!]?\s*$|^\s*join\s+(?:joy\s+)?{_CODE}\s*$",
    re.IGNORECASE,
)

CARE_KEY = "care_summary"
CARE_TTL_SECONDS = 6 * 3600
PENDING_KEY = "companion_pending"  # "message" | "visit_choice" | "visit_times" | "offer"
STASH_KEY = "companion_text"
NEW_CARE_KEY = "companion_new_care_until"  # "Someone new": the usual intake for a day
NEW_CARE_SECONDS = 24 * 3600
ALIAS_PERSONA = "patient_alias"

BTN_EXERCISES = "my exercises"
BTN_MESSAGE = "message my physio"
BTN_BOOK = "book a visit"
BTN_OWN = "with my physio"
BTN_NEW = "someone new"
BTN_SEND = "send to my physio"

_MESSAGE_RE = re.compile(r"^\s*(?:message|text|write\s+to|tell)\s+(?:my\s+)?(?:physio(?:therapist)?|doctor|dr\b.*)\s*[.!]?\s*$", re.IGNORECASE)
_VISIT_RE = re.compile(
    r"\b(?:book|schedule|arrange|need|want)\b[^.?!]{0,30}\b(?:visit|session|appointment|follow[\s-]?up|consultation)\b|^\s*book\s*[.!]?\s*$",
    re.IGNORECASE,
)
# Handled elsewhere (exercises, DONE, dashboard, LINK, sign-up, check-in, reminders): never swallowed here
_OTHER_COMMAND_RE = re.compile(
    r"^\s*(?:done\b|finished\b|link\b|check\s*in\b|stop\b|pause\b|start\b|remind\b|sign\s*up\b|update\s+my\s+details)"
    r"|\bdashboard\b|\b(?:my|show|send)\b[^.?!]{0,20}\b(?:exercises?|programme|program)\b",
    re.IGNORECASE,
)


def connect_code(user_text: str) -> str | None:
    match = CONNECT_RE.match(user_text or "")
    if not match:
        return None
    raw = match.group(1) or match.group(2) or ""
    code = re.sub(r"[^A-Za-z0-9]", "", raw).upper()
    return code if 6 <= len(code) <= 12 else None


def _actor(patient: Patient, rh_patient_id: str) -> RHActor:
    return RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id)


def _mapping(session: Session, patient: Patient) -> RHIdentityMapping | None:
    return session.scalar(select(RHIdentityMapping).where(
        RHIdentityMapping.persona == "patient", RHIdentityMapping.joy_person_id == patient.id,
    ))


def patient_conversation(session: Session, patient: Patient) -> Conversation | None:
    return session.scalar(select(Conversation).where(
        Conversation.person_id == patient.id, Conversation.persona == "patient",
    ))


def repoint_patient_mapping(session: Session, patient: Patient, new_rh_id: str) -> None:
    """Joy works on ``new_rh_id`` from now on. The old record stays reachable as an alias, so events
    for bookings made on it (confirmations, meeting links, cancellations) still reach the patient."""
    mapping = _mapping(session, patient)
    if mapping is None:
        session.add(RHIdentityMapping(persona="patient", joy_person_id=patient.id, rh_record_id=new_rh_id))
        session.flush()
        return
    old_rh_id = mapping.rh_record_id
    if old_rh_id == new_rh_id:
        return
    # Another Joy person mapped to that record (it moved to this number at RH): it lets go
    other = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == new_rh_id))
    if other is not None and other.id != mapping.id:
        session.delete(other)
        session.flush()
    mapping.rh_record_id = new_rh_id
    session.flush()
    alias = session.scalar(select(RHIdentityMapping).where(
        RHIdentityMapping.persona == ALIAS_PERSONA, RHIdentityMapping.joy_person_id == patient.id,
    ))
    taken = session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == old_rh_id))
    if taken is None:
        if alias is not None:
            alias.rh_record_id = old_rh_id
        else:
            session.add(RHIdentityMapping(persona=ALIAS_PERSONA, joy_person_id=patient.id, rh_record_id=old_rh_id))
        session.flush()


def care_summary(session: Session, patient: Patient, conversation: Conversation | None, *, refresh: bool = False) -> dict | None:
    """Who looks after the patient (cached). None for someone Joy has no Rehabify record for yet:
    a new sender is never looked up (that would create an empty record for every hello)."""
    mapping = _mapping(session, patient)
    if mapping is None:
        return None
    context = dict(conversation.booking_context or {}) if conversation is not None else {}
    cached = context.get(CARE_KEY)
    if not refresh and isinstance(cached, dict) and time.time() - float(cached.get("fetched_at") or 0) < CARE_TTL_SECONDS:
        data = cached.get("data")
        return data if isinstance(data, dict) else None
    try:
        data = configured_rh_client().care_summary(patient_id=mapping.rh_record_id, actor=_actor(patient, mapping.rh_record_id))
    except Exception as error:  # best effort: without it Joy answers as for anyone else
        logger.warning("joy_care_summary_failed code=%s", getattr(error, "code", type(error).__name__))
        data = cached.get("data") if isinstance(cached, dict) else None
        return data if isinstance(data, dict) else None
    if conversation is not None and isinstance(data, dict):
        context[CARE_KEY] = {"fetched_at": time.time(), "data": data}
        conversation.booking_context = context
    return data if isinstance(data, dict) else None


def forget_care_summary(conversation: Conversation | None) -> None:
    if conversation is None:
        return
    context = dict(conversation.booking_context or {})
    if context.pop(CARE_KEY, None) is not None:
        conversation.booking_context = context


def in_care(session: Session, patient: Patient | None, conversation: Conversation | None) -> dict | None:
    """The care summary when the patient has a physio and hasn't asked for someone new; else None."""
    if patient is None:
        return None
    context = (conversation.booking_context or {}) if conversation is not None else {}
    new_until = context.get(NEW_CARE_KEY)
    if isinstance(new_until, (int, float)) and new_until > time.time():
        return None
    summary = care_summary(session, patient, conversation)
    return summary if summary and summary.get("has_physio") else None


def _first_name(patient: Patient, summary: dict | None) -> str:
    name = (summary or {}).get("first_name") or (patient.name or "").split(" ")[0]
    name = (name or "").strip()
    return "" if name.casefold() in {"", "patient"} else name


def _physio(summary: dict) -> str:
    return (summary.get("physio_name") or "your physio").strip()


def companion_greeting(patient: Patient, summary: dict, *, connected: bool = False) -> tuple[str, dict]:
    from app.booking.appointment_reminders import appointment_start_from_ms, format_lagos_appointment_time
    from app.conversation.interactive import reply_buttons

    first = _first_name(patient, summary)
    physio = _physio(summary)
    clinic = (summary.get("clinic_name") or "").strip()
    lines = []
    if connected:
        lines.append(f"You're connected{f', {first}' if first else ''} ✅")
    else:
        lines.append(f"Hi {first} 👋" if first else "Hi 👋")
    who = f"{physio} ({clinic})" if clinic and clinic not in physio else physio
    lines.append(f"{who} looks after you, and I'm here to help between visits.")
    programme = summary.get("programme") if isinstance(summary.get("programme"), dict) else None
    if programme and not programme.get("locked"):
        items = int(programme.get("items") or 0)
        done = int(programme.get("done_today") or 0)
        if programme.get("finished_today"):
            lines.append(f"\n🏋️ Today's exercises are done and sent to {physio}. Well done!")
        elif items:
            lines.append(f"\n🏋️ *{programme.get('title') or 'Your exercises'}*: {done} of {items} done today.")
    visit = summary.get("next_appointment") if isinstance(summary.get("next_appointment"), dict) else None
    if visit and isinstance(visit.get("start_time"), (int, float)):
        when = format_lagos_appointment_time(appointment_start_from_ms(visit["start_time"]))
        lines.append(f"📅 Next visit: {when}{' (video call)' if visit.get('online') else ''}")
    lines.append(f"\nWhat would you like to do? You can also just tell me how you're getting on and I'll pass it to {physio}.")
    buttons = reply_buttons((BTN_EXERCISES, "My exercises"), (BTN_BOOK, "Book a visit"), (BTN_MESSAGE, "Message my physio"))
    return "\n".join(lines), buttons


_CONNECT_FAILURES = {
    "invalid": "That link doesn't look right. Please tap the link your physio or clinic sent you again, or ask them for a new one.",
    "expired": "That link has expired. Please ask your physio or clinic to send you a new one.",
    "used": "That link has already been used on another number. Please ask your physio or clinic to send you a new one.",
    "rate_limited": "That's a lot of tries. Please wait an hour, then tap the link again.",
}


def connect_turn(session: Session, patient: Patient, conversation: Conversation | None, user_text: str) -> tuple[str, dict | None] | None:
    """The "Connect to Joy" message. None when the text isn't one."""
    code = connect_code(user_text)
    if code is None:
        return None
    from app.booking.booking_flow import _rh_patient_id

    rh_patient_id = _rh_patient_id(session, patient)
    if not rh_patient_id:
        return "I can't reach Rehabify right now. Please send the message again in a few minutes.", None
    try:
        result = configured_rh_client().connect_patient(patient_id=rh_patient_id, code=code, actor=_actor(patient, rh_patient_id))
    except RHIntegrationError:
        return "I can't reach Rehabify right now. Please send the message again in a few minutes.", None
    if result.get("connected") is not True or not isinstance(result.get("patient_id"), str):
        return _CONNECT_FAILURES.get(str(result.get("reason")), _CONNECT_FAILURES["invalid"]), None

    repoint_patient_mapping(session, patient, result["patient_id"])
    first = result.get("first_name")
    if isinstance(first, str) and first.strip() and (not patient.name or patient.name.strip().casefold() == "patient"):
        patient.name = first.strip()[:60]
    if conversation is not None:
        context = dict(conversation.booking_context or {})
        for key in (NEW_CARE_KEY, PENDING_KEY, STASH_KEY, CARE_KEY):
            context.pop(key, None)
        conversation.booking_context = context
    append(session, kind=AuditKind.IDENTITY, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "rh_patient_connected"})
    summary = care_summary(session, patient, conversation, refresh=True) or {
        "has_physio": bool(result.get("physio_name")),
        "first_name": first,
        "physio_name": result.get("physio_name"),
        "clinic_name": result.get("clinic_name"),
    }
    return companion_greeting(patient, summary, connected=True)


def _set_pending(conversation: Conversation | None, pending: str | None, stash: str | None = None) -> None:
    if conversation is None:
        return
    context = dict(conversation.booking_context or {})
    if pending:
        context[PENDING_KEY] = pending
    else:
        context.pop(PENDING_KEY, None)
    if stash is not None:
        context[STASH_KEY] = stash[:1000]
    elif pending is None:
        context.pop(STASH_KEY, None)
    conversation.booking_context = context


def _rh_id(session: Session, patient: Patient) -> str | None:
    mapping = _mapping(session, patient)
    return mapping.rh_record_id if mapping is not None else None


def _send_to_physio(session: Session, patient: Patient, conversation: Conversation | None, summary: dict, text: str) -> str:
    physio = _physio(summary)
    rh_patient_id = _rh_id(session, patient)
    if not rh_patient_id:
        return "I can't reach Rehabify right now. Please try again in a few minutes."
    try:
        result = configured_rh_client().message_physio(patient_id=rh_patient_id, message=text, actor=_actor(patient, rh_patient_id))
    except RHIntegrationError:
        return "I can't reach Rehabify right now. Please try again in a few minutes."
    _set_pending(conversation, None)
    if result.get("sent") is True:
        return f"Sent to {result.get('physio_name') or physio} ✅ Their reply will come to you here."
    return "I couldn't find your physio's chat. Please message them from your Rehabify dashboard, or reply CALL ME and our care team will help."


def _request_visit(session: Session, patient: Patient, conversation: Conversation | None, summary: dict, times: str) -> str:
    rh_patient_id = _rh_id(session, patient)
    if not rh_patient_id:
        return "I can't reach Rehabify right now. Please try again in a few minutes."
    try:
        result = configured_rh_client().request_visit(patient_id=rh_patient_id, preferred_times=times, actor=_actor(patient, rh_patient_id))
    except RHIntegrationError:
        return "I can't reach Rehabify right now. Please try again in a few minutes."
    _set_pending(conversation, None)
    if result.get("sent") is True:
        who = result.get("name") or _physio(summary)
        return (
            f"Done ✅ I've asked {who} to book your next visit ({times}). "
            "I'll send you the time here once it's booked."
        )
    if result.get("reason") == "already_asked":
        return f"You've already asked {result.get('name') or 'your clinic'} for a visit. They'll be in touch soon."
    return "I couldn't reach your physio's diary. Please reply CALL ME and our care team will book it with you."


def companion_turn(
    session: Session,
    patient: Patient,
    conversation: Conversation | None,
    user_text: str,
    *,
    is_greeting: bool,
    offer_free_text: bool,
) -> tuple[str, dict | None] | None:
    """The companion for a patient in care. None to let Joy's other handlers answer.

    ``offer_free_text``: also offer to pass any other message to the physio (the late call, after
    Joy's exercise, dashboard and LINK commands had their turn)."""
    from app.conversation.interactive import reply_buttons

    summary = in_care(session, patient, conversation)
    if summary is None:
        return None
    text = (user_text or "").strip()
    low = text.casefold().strip(" .!")
    context = (conversation.booking_context or {}) if conversation is not None else {}
    pending = context.get(PENDING_KEY)
    physio = _physio(summary)

    if _OTHER_COMMAND_RE.search(text) and low not in {BTN_MESSAGE, BTN_BOOK, BTN_OWN, BTN_NEW, BTN_SEND}:
        if pending:
            _set_pending(conversation, None)
        return None
    if low == BTN_NEW:
        if conversation is not None:
            ctx = dict(conversation.booking_context or {})
            ctx[NEW_CARE_KEY] = time.time() + NEW_CARE_SECONDS
            ctx.pop(PENDING_KEY, None)
            ctx.pop(STASH_KEY, None)
            conversation.booking_context = ctx
        return (
            "Okay, let's find you a new physiotherapist. Tell me what's going on in a few words, "
            f"and I'll take it from there. {physio} still has your records."
        ), None
    if low == BTN_SEND:
        stash = context.get(STASH_KEY)
        if isinstance(stash, str) and stash.strip():
            return _send_to_physio(session, patient, conversation, summary, stash), None
        _set_pending(conversation, "message")
        return f"What would you like me to tell {physio}?", None
    if low == BTN_MESSAGE or _MESSAGE_RE.match(text):
        _set_pending(conversation, "message")
        return f"What would you like me to tell {physio}? Type your message and I'll send it.", None
    if low == BTN_OWN:
        _set_pending(conversation, "visit_times")
        return (
            f"Which days and times suit you for your next visit with {physio}? "
            "For example: \"Tuesday or Thursday morning\"."
        ), None
    if low == BTN_BOOK or _VISIT_RE.search(text):
        _set_pending(conversation, "visit_choice")
        return (
            f"Would you like your next visit with {physio}, or would you like to see someone new?",
            reply_buttons((BTN_OWN, "With my physio"), (BTN_NEW, "Someone new")),
        )
    if pending == "message" and text:
        return _send_to_physio(session, patient, conversation, summary, text), None
    if pending == "visit_times" and text:
        return _request_visit(session, patient, conversation, summary, text[:300]), None
    if is_greeting:
        _set_pending(conversation, None)
        return companion_greeting(patient, summary)
    if offer_free_text and text:
        _set_pending(conversation, "offer", stash=text)
        return (
            f"Would you like me to send that to {physio}? They'll reply here.",
            reply_buttons((BTN_SEND, "Send to my physio"), (BTN_BOOK, "Book a visit"), (BTN_NEW, "Someone new")),
        )
    return None
