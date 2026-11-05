"""A patient asking for a person: "call me", "I want to talk to someone", "customer care".

Handled in code before triage. The care team is alerted in Rehabify (bell + push to every admin,
operation patient_request_callback) and on Joy's admin WhatsApp list, the request goes on the
patient's tracking timeline (handed_to_human), and the patient is told someone will call this
number. Joy keeps helping meanwhile: the booking step the patient was on is left as it was.

A message that also describes warning signs ("call me, I have chest pain") is not handled here:
it goes through the safety engine, whose reply sends them to urgent care.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.conversation import Conversation
from app.models.types import AuditKind

logger = logging.getLogger(__name__)

_WHO = (
    r"(a |an |the |your |some |one of your )?(human|person|real person|someone|somebody|agent|staff|"
    r"customer (care|service|support)|care team|support( team)?|representative|manager|doctor|physio(therapist)?)"
)
HUMAN_REQUEST_RE = re.compile(
    r"\b(call me|phone me|ring me|give me a (call|ring)|call me back|callback|call back)\b"
    rf"|\b(talk|speak|chat)\s+(to|with)\s+{_WHO}\b"
    r"|\b(real|actual|live)\s+(person|human|agent)\b"
    r"|\bcustomer (care|service|support)\b"
    r"|^\s*(human|agent|operator|call)\s*[.!]?\s*$"
    r"|\babeg\s+(call|ring)\b",
    re.I,
)
# "Don't call me", "no need to call me": not a request
_NOT_REQUEST_RE = re.compile(r"\b(don['’]?t|do not|no need to|never|stop)\s+(call|phone|ring)", re.I)

CALLBACK_KEY = "callback_requested_at"
_REPEAT_WINDOW = timedelta(hours=2)
_EMERGENCY_LINE = "If it's an emergency, call 112 or go to the nearest hospital now."


def is_human_request(text: str) -> bool:
    text = text or ""
    return len(text) <= 300 and bool(HUMAN_REQUEST_RE.search(text)) and not _NOT_REQUEST_RE.search(text)


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
    """Alert the care team (once per 2 hours) and tell the patient what happens next."""
    phone = identity.phone_e164
    now = datetime.now(timezone.utc)
    context = dict(conversation.booking_context or {}) if conversation is not None else {}
    if _recent_request(context, now):
        return (
            f"I've already asked our care team to call you on {phone}. They'll be in touch as soon as they can.\n\n"
            f"{_EMERGENCY_LINE}"
        )

    rh_patient_id = _alert_rehabify(session, identity, user_text)
    _alert_joy_admins(session, identity, rh_patient_id, user_text)
    if rh_patient_id:
        from app.booking.intake import journey

        journey(rh_patient_id, "handed_to_human", f"callback-{identity.person_id}-{now.strftime('%Y%m%d%H')}")
    if conversation is not None:
        context[CALLBACK_KEY] = now.isoformat()
        conversation.booking_context = context
    append(session, kind=AuditKind.TRIAGE, actor_phone=phone, person_id=identity.person_id,
           payload={"decision": "callback_requested", "rh_notified": bool(rh_patient_id)})
    session.flush()
    return (
        f"Of course. I've asked our care team to call you on {phone}. They'll be in touch as soon as they can.\n\n"
        "In the meantime I'm still here, so keep chatting with me if you like.\n\n"
        f"{_EMERGENCY_LINE}"
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

    try:
        route_escalation(session, "callback", {
            "phone": identity.phone_e164, "patient_id": rh_patient_id or str(identity.person_id),
            "text": (user_text or "")[:200],
        })
    except Exception:
        logger.warning("joy_callback_admin_alert_failed", exc_info=True)
