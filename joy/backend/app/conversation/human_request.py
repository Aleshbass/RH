"""Someone asking for a person: "call me", "I want to talk to someone", "customer care", "abeg make una call me".

Handled in code before triage, for every persona Joy talks to (patients, family, physios, partners)
and in every stage. The care team is alerted on Joy's admin WhatsApp list; for a patient Rehabify is
alerted too (bell + push to every admin, operation patient_request_callback) and the request goes on
the patient's tracking timeline (handed_to_human). The person is told someone will call this number.
Joy keeps helping meanwhile: the step they were on is left as it was.

A message that also describes warning signs ("call me, I have chest pain") is not handled here:
it goes through the safety engine, whose reply sends them to urgent care.

"Are you a real person?" is a question, not a request: Joy says honestly that it is an assistant and
how to reach a person, without alerting anyone (``is_bot_question``).
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.conversation import Conversation
from app.models.types import AuditKind, Persona

logger = logging.getLogger(__name__)

_WHO = (
    r"(a |an |the |your |some |one of your |una |any )?(human( being)?|person|real person|someone|somebody|"
    r"anyone|anybody|agent|staff|customer (care|service|support)|care team|team|support( team)?|"
    r"representative|rep|manager|oga|doctor|physio(therapist)?)"
)
_PERSON = r"(a |an )?(real |actual |live )?(human( being)?|human agent|agent|real person|person to (talk|speak) to|customer care)"
HUMAN_REQUEST_RE = re.compile(
    r"\b(call me|phone me|ring me|give me a (call|ring)|call me back|callback|call back)\b"
    rf"|\b(talk|speak|chat|yarn|gist)\s+(to|with)\s+{_WHO}\b"
    r"|\b(real|actual|live)\s+(person|human|agent)\b"
    r"|\bcustomer (care|service|support)\b"
    # Nigerian English and Pidgin: "connect me to una customer care", "I wan person wey I fit talk to"
    rf"|\b(connect|transfer|put|link|refer)\s+me\s+(through\s+)?(to|with)\s+{_WHO}\b"
    rf"|\b(need|want|wan|would like|'d like|get me|give me)\s+{_PERSON}\b"
    rf"|\b(help|assistance)\s+from\s+{_PERSON}\b"
    r"|\b(human|person|someone|somebody|agent)\s+(i|we)\s+(can|fit)\s+(talk|speak|chat|yarn)\b"
    r"|\bperson\s+wey\b.{0,25}\b(talk|speak|yarn|call)\b"
    r"|\b(someone|somebody|a person|a human|an agent)\s+on\s+(the\s+)?phone\b"
    r"|\b(contact|reach)\s+me\b|\breach\s+out\s+to\s+me\b|\bget\s+in\s+touch\s+with\s+me\b"
    r"|\b(can|may|how (can|do|will))\s+i\s+(call|phone|reach)\s+(you|una|rehabify|your (team|office|customer care))\b"
    r"|\b(your|una|the)\s+(phone|contact|customer care|office|support)\s+(number|line)\b"
    r"|^\s*(human|human being|agent|operator|call|person|real person)\s*(please|pls|abeg)?\s*[.!]?\s*$"
    r"|\babeg\s+(call|ring)\b",
    re.I,
)
# "Don't call me", "no need to call me", "you don't need to contact me": not a request
_NOT_REQUEST_RE = re.compile(
    r"\b(don['’]?t|do not|doesn['’]?t|does not|no need to|never|stop)\s+(need\s+to\s+|have\s+to\s+)?"
    r"(call|phone|ring|contact|reach)",
    re.I,
)
_BOT_QUESTION_RE = re.compile(
    r"^\s*(?:(?:hi|hello|hey)[\s,!]*)?(?:joy[\s,]*)?(?:are|r)\s+(?:you|u)\s+(?:a\s+|an\s+)?(?:real\s+)?"
    r"(?:person|human(?:\s+being)?|bot|robot|machine|ai|computer)\s*\??\s*$"
    r"|^\s*(?:is\s+this|am\s+i\s+(?:talking|chatting|speaking)\s+(?:to|with))\s+(?:a\s+|an\s+)?(?:real\s+)?"
    r"(?:person|human(?:\s+being)?|bot|robot|machine|ai)\s*\??\s*$"
    r"|^\s*(?:you|u)\s+be\s+(?:real\s+)?(?:human|person|robot|bot|machine)\s*\??\s*$"
    r"|^\s*na\s+(?:robot|bot|machine)\s+i\s+dey\s+(?:talk|chat|yarn)\s+(?:to|with)\s*\??\s*$",
    re.I,
)

CALLBACK_KEY = "callback_requested_at"
_REPEAT_WINDOW = timedelta(hours=2)
_EMERGENCY_LINE = "If it's an emergency, call 112 or go to the nearest hospital now."
BOT_REPLY = (
    "I'm Joy, Rehabify's virtual assistant. If you'd like a person from our care team to call you, "
    "just reply *call me*."
)


def is_human_request(text: str) -> bool:
    text = (text or "").replace("’", "'")
    return (
        len(text) <= 300
        and bool(HUMAN_REQUEST_RE.search(text))
        and not _NOT_REQUEST_RE.search(text)
        and not is_bot_question(text)
    )


def is_bot_question(text: str) -> bool:
    """ "Are you a real person?" on its own: answered honestly, nobody is alerted."""
    return bool(_BOT_QUESTION_RE.match((text or "").replace("’", "'")))


def _recent_request(context: dict, now: datetime) -> bool:
    raw = context.get(CALLBACK_KEY)
    if not isinstance(raw, str):
        return False
    try:
        when = datetime.fromisoformat(raw)
    except ValueError:
        return False
    return now - when < _REPEAT_WINDOW


def human_request_reply(session: Session, identity, conversation: Conversation | None, user_text: str) -> str:
    """Alert the team (once per 2 hours) and tell the person, in two short lines, what happens next."""
    phone = identity.phone_e164
    now = datetime.now(timezone.utc)
    cares_for_a_patient = identity.persona in {Persona.PATIENT, Persona.FAMILY}
    team = "our care team" if cares_for_a_patient else "our team"
    # The emergency line matters to someone who is (or is looking after) a patient, not to a physio
    emergency = f"\n\n{_EMERGENCY_LINE}" if cares_for_a_patient else ""
    context = dict(conversation.booking_context or {}) if conversation is not None else {}
    if _recent_request(context, now):
        return f"I've already asked {team} to call you on {phone}. They'll be in touch as soon as they can.{emergency}"

    rh_patient_id = _alert_rehabify(session, identity, user_text) if identity.persona == Persona.PATIENT else None
    _alert_joy_admins(session, identity, rh_patient_id, user_text)
    if rh_patient_id:
        from app.booking.intake import journey

        journey(rh_patient_id, "handed_to_human", f"callback-{identity.person_id}-{now.strftime('%Y%m%d%H')}")
    if conversation is not None:
        context[CALLBACK_KEY] = now.isoformat()
        conversation.booking_context = context
    append(session, kind=AuditKind.TRIAGE, actor_phone=phone, person_id=identity.person_id,
           payload={"decision": "callback_requested", "persona": identity.persona.value, "rh_notified": bool(rh_patient_id)})
    session.flush()
    return (
        f"Of course. I've asked {team} to call you on {phone}. Someone will reach out as soon as they can."
        f"{emergency}"
    )


def _alert_rehabify(session: Session, identity, user_text: str) -> str | None:
    """Bell + push to every Rehabify admin. Returns the RH patient id when the alert went out."""
    from app.booking.booking_flow import _rh_patient_id
    from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
    from app.models.patient import Patient

    patient = session.get(Patient, identity.person_id)
    if patient is None:
        return None
    rh_patient_id = _rh_patient_id(session, patient)
    if not rh_patient_id:
        return None
    try:
        configured_rh_client().operational_mutation(
            "patient_request_callback",
            actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id),
            data={"patient_id": rh_patient_id, "text": (user_text or "")[:200]},
            idempotency_key=f"joy-callback-{patient.id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H')}",
        )
    except RHIntegrationError as error:
        logger.warning("joy_callback_rh_alert_failed code=%s", error.code)
        return None
    return rh_patient_id


def _alert_joy_admins(session: Session, identity, rh_patient_id: str | None, user_text: str) -> None:
    from app.admin.escalation_router import route_escalation

    payload = {
        "phone": identity.phone_e164, "patient_id": rh_patient_id or str(identity.person_id),
        "text": (user_text or "")[:200],
    }
    if identity.persona != Persona.PATIENT:
        payload = {**payload, "role": identity.persona.value, "patient_id": None, "person_id": str(identity.person_id)}
    try:
        route_escalation(session, "callback", payload)
    except Exception:
        logger.warning("joy_callback_admin_alert_failed", exc_info=True)
