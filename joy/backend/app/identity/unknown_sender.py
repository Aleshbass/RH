from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy.orm import Session

from app.identity.greetings import is_greeting_only

# Same pattern as turn_handler._REFERRAL_CODE_RE (RH referral codes are RHB-<digits>)
_REFERRAL_CODE_RE = re.compile(r"\bRHB\s*[-–—]\s*\d{4,}\b", re.IGNORECASE)
from app.llm.gemini_client import LLMClient
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import Identity, Persona

_UNKNOWN_SENDER_QUESTION = (
    "Are you looking for physiotherapy care, are you a physiotherapist, "
    "or did a family member add you here?"
)
_UNKNOWN_SENDER_QUESTION_PATIENT_ONLY = (
    "Are you looking for physiotherapy care, or did a family member add you here?"
)

# Joy is for patients and their families (settings.joy_patient_only): a physio is pointed to the
# website and is never set up on WhatsApp.
PHYSIO_SIGN_UP_REPLY = (
    "Joy is here for patients and their families. To join Rehabify as a physiotherapist, sign up "
    "at https://physioaroundme.com/sign-up?as=physiotherapist\n\n"
    "Already with us? Everything is on your dashboard: https://physioaroundme.com/dashboard/physiotherapist"
)
PHYSIO_USE_DASHBOARD_REPLY = (
    "Joy is here for patients and their families, so I can't help with that here. Everything for "
    "physiotherapists is on your dashboard: https://physioaroundme.com/dashboard/physiotherapist\n\n"
    "I'll still message you here when a patient books you. Reply ACCEPT or REJECT with the booking ID."
)


def _patient_only() -> bool:
    from app.config import get_settings

    return get_settings().joy_patient_only


_PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"

# Fold curly / typographic apostrophes so WhatsApp “I’m” matches regexes.
_APOSTROPHE_RE = re.compile(r"[\u2018\u2019\u201B\u2032\u00B4`]")

_PHYSIO_CLAIM_RE = re.compile(
    r"(?i)(?:"
    r"\bi(?:\s+am|'m)\s+(?:a\s+)?physio(?:therapist)?\b|"
    r"\bi(?:\s+am|'m)\s+(?:a\s+)?therapist\b|"
    r"\b(?:apply(?:ing)?|join(?:ing)?)\s+as(?:\s+a)?\s+"
    r"(?:physio(?:therapist)?|therapist)\b"
    r")"
)

_ROLE_CLAIM_RE = re.compile(
    r"(?i)(?:"
    r"\bi(?:\s+am|'m)\s+(?:a\s+)?physio(?:therapist)?\b|"
    r"\bi(?:\s+am|'m)\s+(?:an\s+)?admin\b|"
    r"\bi(?:\s+am|'m)\s+(?:a\s+)?therapist\b|"
    r"\b(?:apply(?:ing)?|join(?:ing)?)\s+as(?:\s+a)?\s+"
    r"(?:physio(?:therapist)?|therapist)\b"
    r")"
)

_CARE_INTENT_RE = re.compile(
    r"(?i)(?:"
    r"\blooking\s+for\b[\s\w]{0,40}\b(?:physio|physiotherapy|care|treatment|rehab)\b|"
    r"\bneed(?:s)?\s+(?:a\s+)?(?:physio|physiotherapy|treatment|care|rehab)\b|"
    r"\bwant(?:s)?\s+(?:a\s+)?(?:physio|physiotherapy)\b|"
    r"\bi(?:\s+am|'m)\s+(?:a\s+)?patient\b|"
    r"\bphysiotherapy\s+care\b|"
    r"\bfor\s+physiotherapy\b|"
    r"\bseek(?:ing)?\s+(?:care|treatment|physio|physiotherapy)\b"
    r")"
)

_FAMILY_INTENT_RE = re.compile(
    r"(?i)(?:"
    r"\bfamily\s+member\b|"
    r"\b(?:my|our)\s+(?:family|relative|mum|mom|dad|brother|sister|wife|husband|"
    r"son|daughter|uncle|aunt)\b|"
    r"\b(?:added|add)\s+me\b|"
    r"\bi(?:\s+was|'m|\s+am)\s+(?:added|invited)\b|"
    r"\bon\s+behalf\s+of\b"
    r")"
)

# Complaint words only — not copulas ("dey") or body-part/after words ("bayan", "back").
_SYMPTOM_MARKERS = (
    "hurt",
    "hurts",
    "pain",
    "ache",
    "sore",
    "stiff",
    "swell",
    "numb",
    "injury",
    "dun",
    "egbu",
    "zafi",
)

_VALID_INTENTS = frozenset({"patient", "physio", "family", "unclear"})

_FAMILY_FALLBACK = (
    "I hear you — you're here for someone in your family. "
    "They'll need to add this WhatsApp number from their own chat with me first "
    "(they can say something like “add family” and your number). "
    "Once they do, message me again and I can help."
)


@dataclass(frozen=True)
class UnknownSenderDecision:
    intent: str
    reply_text: str
    identity: Identity | None = None


def begin_unknown(session: Session, phone_e164: str) -> str:
    del session, phone_e164
    return _UNKNOWN_SENDER_QUESTION_PATIENT_ONLY if _patient_only() else _UNKNOWN_SENDER_QUESTION


def _normalize(text: str) -> str:
    folded = _APOSTROPHE_RE.sub("'", unicodedata.normalize("NFKC", text or ""))
    return folded


def _is_wordish(ch: str) -> bool:
    category = unicodedata.category(ch)
    return category[0] in {"L", "M", "N"} or ch == "_"


def _has_marker(text: str, marker: str) -> bool:
    haystack = _normalize(text).casefold()
    needle = _normalize(marker).casefold()
    if not needle:
        return False
    start = 0
    while True:
        idx = haystack.find(needle, start)
        if idx < 0:
            return False
        end = idx + len(needle)
        left_ok = idx == 0 or not _is_wordish(haystack[idx - 1])
        right_ok = end >= len(haystack) or not _is_wordish(haystack[end])
        if left_ok and right_ok:
            return True
        start = idx + 1


def looks_like_role_claim(user_text: str) -> bool:
    return bool(_ROLE_CLAIM_RE.search(_normalize(user_text)))


def looks_like_physio_claim(user_text: str) -> bool:
    return bool(_PHYSIO_CLAIM_RE.search(_normalize(user_text)))


def looks_like_symptom(user_text: str) -> bool:
    return any(_has_marker(user_text, marker) for marker in _SYMPTOM_MARKERS)


def looks_like_patient_care_intent(user_text: str) -> bool:
    return bool(_CARE_INTENT_RE.search(_normalize(user_text)))


def looks_like_family_intent(user_text: str) -> bool:
    return bool(_FAMILY_INTENT_RE.search(_normalize(user_text)))


def maybe_provision_patient(
    session: Session, phone_e164: str, user_text: str
) -> Identity | None:
    if looks_like_role_claim(user_text):
        return None
    if looks_like_family_intent(user_text) and not (
        looks_like_symptom(user_text) or looks_like_patient_care_intent(user_text)
    ):
        return None
    if not (looks_like_symptom(user_text) or looks_like_patient_care_intent(user_text)):
        return None
    patient = Patient(phone_e164=phone_e164)
    session.add(patient)
    session.flush()
    return Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=phone_e164,
    )


def maybe_provision_physio(
    session: Session, phone_e164: str, user_text: str
) -> Identity | None:
    if not looks_like_physio_claim(user_text):
        return None
    physio = Physiotherapist(phone_e164=phone_e164)
    session.add(physio)
    session.flush()
    return Identity(
        persona=Persona.PHYSIO,
        person_id=physio.id,
        phone_e164=phone_e164,
    )


def _provision_patient(session: Session, phone_e164: str) -> Identity:
    patient = Patient(phone_e164=phone_e164)
    session.add(patient)
    session.flush()
    return Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=phone_e164,
    )


def _provision_physio(session: Session, phone_e164: str) -> Identity:
    physio = Physiotherapist(phone_e164=phone_e164)
    session.add(physio)
    session.flush()
    return Identity(
        persona=Persona.PHYSIO,
        person_id=physio.id,
        phone_e164=phone_e164,
    )


def _classify_prompt() -> str:
    empathy = (_PROMPTS_DIR / "empathy.md").read_text(encoding="utf-8").strip()
    tone = (_PROMPTS_DIR / "tone_and_format.md").read_text(encoding="utf-8").strip()
    unknown = (_PROMPTS_DIR / "unknown_sender.md").read_text(encoding="utf-8").strip()
    if _patient_only():
        unknown += (
            "\n- Joy is only for patients and their families. If intent is \"unclear\", ask whether "
            "they want physiotherapy care or a family member added them; never ask whether they "
            "are a physiotherapist."
        )
    return f"{empathy}\n\n{tone}\n\n{unknown}"


def _intent_from_extraction(extraction: dict) -> str:
    raw = extraction.get("intent") if isinstance(extraction, dict) else None
    if isinstance(raw, str):
        value = raw.strip().lower()
        if value in _VALID_INTENTS:
            return value
    return "unclear"


def resolve_unknown_sender(
    session: Session,
    phone_e164: str,
    user_text: str,
    llm: LLMClient,
) -> UnknownSenderDecision:
    """Deterministic gates first; Gemini classifies leftovers. Identity stays code-owned."""
    if looks_like_physio_claim(user_text):
        if _patient_only():
            return UnknownSenderDecision(intent="physio", reply_text=PHYSIO_SIGN_UP_REPLY)
        return UnknownSenderDecision(
            intent="physio",
            reply_text="",
            identity=_provision_physio(session, phone_e164),
        )
    if looks_like_patient_care_intent(user_text) or looks_like_symptom(user_text):
        if not looks_like_role_claim(user_text):
            return UnknownSenderDecision(
                intent="patient",
                reply_text="",
                identity=_provision_patient(session, phone_e164),
            )
    # A referral code from a doctor or partner link ("START RHB-1234567890"): a patient, so the
    # code is checked and the referral attributed (turn_handler._verified_referral_turn)
    if _REFERRAL_CODE_RE.search(user_text or ""):
        return UnknownSenderDecision(
            intent="patient",
            reply_text="",
            identity=_provision_patient(session, phone_e164),
        )
    # Just "Hi" (in any of Joy's languages): almost everyone who writes is a patient, so start
    # them on the patient welcome. The welcome tells physios to reply PT and family to say so.
    if is_greeting_only(user_text):
        return UnknownSenderDecision(
            intent="patient",
            reply_text="",
            identity=_provision_patient(session, phone_e164),
        )
    if looks_like_family_intent(user_text):
        response = llm.complete(_classify_prompt(), user_text)
        reply = (response.reply_text or "").strip() or _FAMILY_FALLBACK
        return UnknownSenderDecision(intent="family", reply_text=reply)

    response = llm.complete(_classify_prompt(), user_text)
    intent = _intent_from_extraction(response.extraction_json)
    reply = (response.reply_text or "").strip()

    if intent == "patient":
        return UnknownSenderDecision(
            intent="patient",
            reply_text="",
            identity=_provision_patient(session, phone_e164),
        )
    if intent == "physio":
        if _patient_only():
            return UnknownSenderDecision(intent="physio", reply_text=PHYSIO_SIGN_UP_REPLY)
        return UnknownSenderDecision(
            intent="physio",
            reply_text="",
            identity=_provision_physio(session, phone_e164),
        )
    if intent == "family":
        return UnknownSenderDecision(
            intent="family",
            reply_text=reply or _FAMILY_FALLBACK,
        )
    return UnknownSenderDecision(
        intent="unclear",
        reply_text=reply or begin_unknown(session, phone_e164),
    )
