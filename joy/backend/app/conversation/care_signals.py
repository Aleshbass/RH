"""In-care escalations from Mary's Joy coordination spec ("Escalation thresholds").

For a patient already in care (a physio looks after them), these are checked on every message,
after the crisis and red-flag checks (app/safety) and before the companion menu:

- A fall or a new injury: "Please stop the exercises. If you're badly hurt, seek medical care
  now. I've told <physio>." The physio is messaged at once.
- "I'm worried about something": "I've told <physio> right away. If it feels urgent, please
  seek medical care now." The physio is messaged at once.

The physio gets the message in their Messages chat, with the usual push (RH op
patient_message_physio). If that can't be sent, the care team is told instead, so "I've told"
is always true. Pain of 7 or more, or 2 or more points above the last check-in, is handled by
the check-in (app/conversation/check_in.py, RH recordPatientCheckIn).
"""

from __future__ import annotations

import logging
import re

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.patient import Patient
from app.models.types import AuditKind
from app.safety.volunteered_red_flags import is_negated

logger = logging.getLogger(__name__)

_FALL = (
    r"(?:i|he|she|they|my\s+\w+)\s+(?:just\s+|have\s+|has\s+)?(?:fell|fallen|slipped|tripped(?:\s+and\s+fell)?)",
    r"had\s+a\s+(?:bad\s+)?fall",
    r"new\s+injury",
    r"(?:injured|twisted|sprained|broke|broken)\s+my\s+\w+",
    r"i\s+(?:fall|don\s+fall)\s+(?:down|for\s+ground)",
)
_WORRY = (
    r"i(?:['’]m|\s+am)\s+(?:really\s+|very\s+|so\s+|a\s+bit\s+|quite\s+)?(?:worried|scared|concerned|frightened|anxious)",
    r"(?:something|this)\s+(?:is|['’]s|feels)\s+(?:wrong|not\s+right)",
    r"i\s+(?:dey|de)\s+(?:fear|worry)",
    r"worried\s+about",
)
_COMPILED = {
    "fall": tuple(re.compile(rf"\b(?:{p})\b", re.I) for p in _FALL),
    "worry": tuple(re.compile(rf"\b(?:{p})\b", re.I) for p in _WORRY),
}


def care_signal(text: str | None) -> str | None:
    """"fall", "worry" or None. A fall wins: it also asks them to stop the exercises."""
    source = " ".join((text or "").split())
    for kind in ("fall", "worry"):
        for pattern in _COMPILED[kind]:
            if any(not is_negated(source, match.start()) for match in pattern.finditer(source)):
                return kind
    return None


def _reply(kind: str, physio: str) -> str:
    if kind == "fall":
        return (
            f"Please stop the exercises for now. If you're badly hurt, seek medical care now or call 112. "
            f"I've told {physio}, and they'll get back to you."
        )
    return f"I've told {physio} right away. If it feels urgent, please seek medical care now or call 112."


def care_signal_turn(session: Session, patient: Patient, care: dict, kind: str, user_text: str) -> str:
    """Tell the physio now (or the care team if that fails) and return the reply for the patient."""
    from app.booking.booking_flow import _rh_patient_id
    from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client

    physio = (care.get("physio_name") or "your physio").strip()
    first = (patient.name or "").split(" ")[0].strip() or "Your patient"
    label = "a fall or new injury" if kind == "fall" else "that they're worried about something"
    message = f"⚠️ {first} told Joy on WhatsApp about {label}. They wrote: \"{' '.join((user_text or '').split())[:300]}\""
    sent = False
    rh_patient_id = _rh_patient_id(session, patient)
    if rh_patient_id:
        try:
            result = configured_rh_client().message_physio(
                patient_id=rh_patient_id, message=message,
                actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id),
            )
            sent = bool(result.get("sent"))
        except RHIntegrationError as error:
            logger.warning("joy_care_signal_physio_failed code=%s", error.code)
    if not sent:
        try:
            from app.admin.escalation_router import route_escalation

            route_escalation(session, "callback", {
                "patient_id": rh_patient_id or str(patient.id), "phone": patient.phone_e164, "role": "patient",
                "text": f"In care, reported {label} and their physio couldn't be messaged: {user_text[:160]}",
            })
        except Exception:
            logger.warning("joy_care_signal_escalation_failed", exc_info=True)
    append(session, kind=AuditKind.TRIAGE, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "care_signal", "kind": kind, "physio_messaged": sent})
    return _reply(kind, physio)
