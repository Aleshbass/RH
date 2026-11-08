"""Letting someone who picked the wrong role switch, safely.

A tester once typed "I'm a physio" and was then asked for an MRTB number on every message with no
way out. Now a number in physio sign-up that has not got anywhere yet (unverified, still
"collecting", no MRTB number, no bookings or payouts) can become a patient:

* "I'm a patient" / "I'm not a physio": switched at once, and a message that also says what's wrong
  ("I'm a patient, my knee hurts") carries on as their first patient message;
* writing like a patient (symptoms, or asking for care) or "wrong option" / "start over": Joy asks
  "Are you contacting us as a patient? Reply Patient or Physio." first, and keeps the message so
  "Patient" can carry on with it.

A verified physio, one already in review (MRTB sent) or one with bookings or payouts is never
changed here. The other way, a patient who says they are a physiotherapist never loses anything:
a number that has only said hello starts WhatsApp physio sign-up (its empty patient record stays),
and anyone with a story, a booking or a Rehabify account is given the website sign-up link.

The words are matched in code; the turn handler (app/conversation/turn_handler.py) does the switch.
"""

from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.identity.unknown_sender import (
    looks_like_patient_care_intent,
    looks_like_physio_claim,
    looks_like_symptom,
)
from app.models.physiotherapist import Physiotherapist

ROLE_CHECK_KEY = "role_check"
PHYSIO_SIGNUP_URL = "https://physioaroundme.com/sign-up?as=physio"

ROLE_QUESTION = "Are you contacting us as a patient? Reply *Patient* or *Physio*."
ROLE_QUESTION_RED_FLAG = (
    "If you or someone with you has these symptoms now, please call 112 or go to the nearest "
    "hospital straight away.\n\n" + ROLE_QUESTION
)
SWITCHED_PREFIX = "No problem, I've switched you to patient care."
SWITCHED_WELCOME = (
    f"{SWITCHED_PREFIX}\n\n"
    "What's going on today? Tell me in your own words: what's bothering you, where, and for how long. "
    "A voice note is fine."
)
STAY_PHYSIO_PREFIX = "Great, let's finish your physiotherapist sign-up."
PHYSIO_START_PREFIX = "Welcome! Let's get you set up as a physiotherapist."
PHYSIO_ESCAPE_HINT = "Here for care yourself? Reply *I'm a patient*."
PHYSIO_LOCKED_REPLY = (
    "This number is set up as a Rehabify physiotherapist account, so I can't switch it to patient care "
    "here. Please email hello@myrehabifyhealth.com and our team will sort it out."
)
PHYSIO_SIGNUP_REPLY = (
    "Welcome! Physiotherapists join Rehabify on our website: "
    f"{PHYSIO_SIGNUP_URL}\n\n"
    "Once you're verified, reply *PT* here. If you need care for yourself, just tell me what's going on."
)

_APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "`": "'"})
_ROLE = r"(?:physio(?:therapist)?|therapist|pt)"
_PATIENT_STATEMENT_RE = re.compile(
    r"\bi(?:\s+am|'m|m)\s+(?:a\s+|the\s+)?patient\b"
    rf"|\bi(?:\s+am|'m|m)\s+not\s+(?:a\s+)?{_ROLE}\b"
    rf"|\bnot\s+a\s+{_ROLE}\b"
    rf"|\bi\s+no\s+be\s+{_ROLE}\b"
    r"|\bi\s+be\s+(?:a\s+)?patient\b"
    r"|\bas\s+a\s+patient\b",
    re.I,
)
_RESTART_RE = re.compile(
    r"\b(?:start(?:ing)?\s+(?:over|again|afresh)|restart|begin\s+again|reset)\b"
    r"|\bwrong\s+(?:option|choice|button|one|selection|role)\b"
    r"|\b(?:chose|choose|picked|pick|selected|select|pressed|clicked|tapped|typed)\s+(?:the\s+)?wrong\b",
    re.I,
)
# The question is "Are you contacting us as a patient?", so a plain yes / no answers it too
_PATIENT_CHOICE = {
    "patient", "a patient", "i'm a patient", "im a patient", "i am a patient", "as a patient", "patient please",
    "yes", "yeah", "yep", "yes i am", "yes please", "i am",
}
_PHYSIO_CHOICE = {
    "physio", "a physio", "physiotherapist", "a physiotherapist", "pt", "therapist", "physio please",
    "i'm a physio", "im a physio", "i am a physio", "i'm a physiotherapist", "i am a physiotherapist",
    "no", "nope", "no i'm not", "i'm not",
}
def _plain(text: str) -> str:
    return " ".join((text or "").translate(_APOSTROPHES).split())


def is_patient_statement(text: str) -> bool:
    """ "I'm a patient", "I'm not a physio", "I no be physio": the person says which role they are."""
    return bool(_PATIENT_STATEMENT_RE.search(_plain(text)))


def is_restart_request(text: str) -> bool:
    """ "Start over", "wrong option": short messages only, never words inside a story."""
    plain = _plain(text)
    return len(plain) <= 80 and bool(_RESTART_RE.search(plain))


def role_choice(text: str) -> str | None:
    """The answer to "Patient or Physio?": "patient", "physio" or None."""
    plain = _plain(text).casefold().strip(" .!?,;:")
    if plain in _PATIENT_CHOICE:
        return "patient"
    if plain in _PHYSIO_CHOICE:
        return "physio"
    return None


def writes_like_patient(text: str) -> bool:
    return looks_like_symptom(text) or looks_like_patient_care_intent(text)


def carries_patient_story(text: str) -> bool:
    """Something to carry on with as a patient beyond the role words themselves."""
    rest = _PATIENT_STATEMENT_RE.sub(" ", _plain(text))
    return writes_like_patient(rest)


def is_onboarding_content(text: str, media: list[str] | None) -> bool:
    """MRTB number, specialty tags or a credential photo: physio sign-up, never a role question."""
    from app.physio.onboarding import _parse_mrtb, _parse_tags

    return bool([item for item in (media or []) if item]) or bool(_parse_mrtb(text) or _parse_tags(text))


def patient_says_physio(text: str) -> bool:
    """A patient saying they're a physiotherapist (or replying PT), without a problem of their own."""
    plain = _plain(text)
    if plain.casefold().strip(" .!?") == "pt":
        return True
    return looks_like_physio_claim(plain) and not looks_like_symptom(plain)


def is_switchable_physio(session: Session, physio: Physiotherapist) -> bool:
    """An unverified physio sign-up that hasn't got anywhere: no MRTB yet, no bookings or payouts."""
    from app.ops.reset_phone import physio_removal_refusal

    if physio.verified or physio.onboarding_status != "collecting" or physio.mrtb_number:
        return False
    return physio_removal_refusal(session, physio) is None
