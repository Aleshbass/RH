"""Pain and progress check-ins on WhatsApp, sent to the patient's physio.

"check in" starts four short questions, all handled in code:
  1. pain now, 0 to 10
  2. exercises since last time: all / some / none (buttons)
  3. mood: great / good / okay / low (list)
  4. anything for the physio (a note, or "Nothing else")
The answers are saved in Rehabify with the same rules as the app's check-in (operation
patient_check_in -> recordPatientCheckIn): high or rising pain, low mood and any note are flagged,
and the physio gets an alert.

"cancel" or "stop" ends a check-in. One left unanswered for 2 hours is dropped. A reply that
describes warning signs ends the check-in and goes to the safety engine instead.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.conversation.interactive import list_menu, reply_buttons
from app.models.conversation import Conversation
from app.models.types import AuditKind

logger = logging.getLogger(__name__)

CHECK_IN_KEY = "check_in"
_EXPIRES_AFTER = timedelta(hours=2)

START_RE = re.compile(
    r"(i want to |i'?d like to |can i |let me |please )?(do |send |start )?(a |my )?"
    r"(check[- ]?in|checkin|progress update|pain update)( with my physio| for my physio| please)?[.!?]*"
    r"|update my physio(therapist)?[.!?]*",
    re.I,
)
_CANCEL_RE = re.compile(r"(cancel|stop|never ?mind|not now|later|exit|quit)[.!]*", re.I)
_PAIN_RE = re.compile(r"(?:pain\s*(?:is\s*)?)?(\d{1,2})(?:\s*(?:/|out of)\s*10)?[.!]*", re.I)
_NO_NOTE_RE = re.compile(r"(no|nope|nothing|nothing else|none|no thanks|no thank you|that'?s all|all good)[.!]*", re.I)

_EXERCISES = {
    "all": re.compile(r"(all|all of them|yes|yes all|done|did them all|every(thing| one))[.!]*", re.I),
    "some": re.compile(r"(some|some of them|a few|a bit|partly|half|not all)[.!]*", re.I),
    "none": re.compile(r"(none|no|not yet|didn'?t|did not|nope|none of them)[.!]*", re.I),
}
_MOODS = {
    "great": re.compile(r"(great|excellent|very good|amazing)[.!]*", re.I),
    "good": re.compile(r"(good|fine|ok good|well)[.!]*", re.I),
    "okay": re.compile(r"(okay|ok|alright|so[- ]so|not bad|average)[.!]*", re.I),
    "low": re.compile(r"(low|bad|sad|down|not good|poor|terrible|stressed)[.!]*", re.I),
}

PAIN_QUESTION = (
    "Let's do a quick check-in for your physio. 4 short questions.\n\n"
    "1/4 How's your pain right now, from 0 (no pain) to 10 (the worst)? Reply with a number."
)
_EXERCISE_QUESTION = "2/4 Since your last check-in, did you do your exercises?"
_MOOD_QUESTION = "3/4 And how are you feeling in yourself?"
_NOTE_QUESTION = "4/4 Anything you'd like your physio to know? Type it here, or tap *Nothing else*."


def _exercise_buttons() -> dict[str, Any]:
    return reply_buttons(("all", "All of them"), ("some", "Some"), ("none", "None"))


def _mood_list() -> dict[str, Any]:
    return list_menu("Choose", [("great", "Great", None), ("good", "Good", None), ("okay", "Okay", None), ("low", "Low", None)], section="How you feel")


def _match(table: dict[str, re.Pattern], text: str) -> str | None:
    for value, pattern in table.items():
        if pattern.fullmatch(text):
            return value
    return None


def _active(context: dict, now: datetime) -> dict | None:
    current = context.get(CHECK_IN_KEY)
    if not isinstance(current, dict):
        return None
    try:
        started = datetime.fromisoformat(str(current.get("started_at")))
    except ValueError:
        return None
    return current if now - started < _EXPIRES_AFTER else None


def _store(conversation: Conversation, value: dict | None) -> None:
    context = dict(conversation.booking_context or {})
    if value is None:
        context.pop(CHECK_IN_KEY, None)
    else:
        context[CHECK_IN_KEY] = value
    conversation.booking_context = context


def check_in_turn(session: Session, identity, conversation: Conversation | None, user_text: str) -> tuple[str, dict | None] | None:
    """The next check-in question (and its buttons), or None when this message isn't part of one."""
    if conversation is None:
        return None
    text = " ".join((user_text or "").split())
    now = datetime.now(timezone.utc)
    current = _active(dict(conversation.booking_context or {}), now)

    if current is None:
        if not START_RE.fullmatch(text):
            return None
        _store(conversation, {"step": "pain", "started_at": now.isoformat()})
        return PAIN_QUESTION, None

    from app.conversation.human_request import is_human_request
    from app.safety.volunteered_red_flags import detect_volunteered_red_flags

    if detect_volunteered_red_flags(text) or is_human_request(text):
        _store(conversation, None)  # warning signs or "call me": answered by the safety engine / care team
        return None
    if _CANCEL_RE.fullmatch(text):
        _store(conversation, None)
        return "No problem, I've stopped the check-in. Type *CHECK IN* any time to send one.", None

    step = current.get("step")
    if step == "pain":
        match = _PAIN_RE.fullmatch(text)
        pain = int(match.group(1)) if match else None
        if pain is None or not 0 <= pain <= 10:
            return "Please reply with a number from 0 (no pain) to 10 (the worst). Or reply CANCEL to stop.", None
        _store(conversation, {**current, "step": "exercises", "pain": pain})
        return _EXERCISE_QUESTION, _exercise_buttons()
    if step == "exercises":
        done = _match(_EXERCISES, text)
        if done is None:
            return "Tap *All of them*, *Some* or *None*.", _exercise_buttons()
        _store(conversation, {**current, "step": "mood", "exercises": done})
        return _MOOD_QUESTION, _mood_list()
    if step == "mood":
        mood = _match(_MOODS, text)
        if mood is None:
            return "Choose Great, Good, Okay or Low.", _mood_list()
        _store(conversation, {**current, "step": "note", "mood": mood})
        return _NOTE_QUESTION, reply_buttons(("nothing else", "Nothing else"))
    if step == "note":
        note = None if _NO_NOTE_RE.fullmatch(text) else text[:1000]
        _store(conversation, None)
        return _save(session, identity, current, note), None
    _store(conversation, None)
    return None


def _save(session: Session, identity, answers: dict, note: str | None) -> str:
    from app.booking.booking_flow import _rh_patient_id
    from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
    from app.models.patient import Patient

    patient = session.get(Patient, identity.person_id)
    rh_patient_id = _rh_patient_id(session, patient) if patient is not None else None
    if not rh_patient_id:
        return "I couldn't send your check-in just now. Please type *CHECK IN* to try again in a few minutes."
    pain = int(answers.get("pain") or 0)
    data = {
        "patient_id": rh_patient_id,
        "pain_score": pain,
        "exercises_done": answers.get("exercises") or "none",
        "mood": answers.get("mood"),
        **({"note": note} if note else {}),
    }
    try:
        result = configured_rh_client().operational_mutation(
            "patient_check_in",
            actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id),
            data=data,
            idempotency_key=f"joy-check-in-{patient.id}-{answers.get('started_at')}",
        )
    except RHIntegrationError as error:
        logger.warning("joy_check_in_failed code=%s", error.code)
        return "I couldn't send your check-in just now. Please type *CHECK IN* to try again in a few minutes."
    append(session, kind=AuditKind.TRIAGE, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "check_in_sent", "saved": bool(result.get("saved")), "flagged": bool(result.get("flagged"))})
    if not result.get("saved"):
        if result.get("reason") == "too_soon":
            return "You checked in a few minutes ago, so I didn't send this one. You can check in again tomorrow."
        return "I couldn't send your check-in just now. Please type *CHECK IN* to try again in a few minutes."
    if not result.get("has_physio"):
        text = "Thanks, I've saved your check-in to your Rehabify record. Once you have a physio, they'll see it."
    elif result.get("flagged"):
        text = "Thanks, I've sent this to your physio and flagged it so they look at it soon."
    else:
        text = "Thanks, I've sent this to your physio. Keep going with your exercises!"
    if pain >= 8:
        text += "\n\nIf the pain is severe or suddenly worse, or you feel unwell, call 112 or go to the nearest hospital."
    return text
