import re
import unicodedata

from sqlalchemy.orm import Session

from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import Identity, Persona

_UNKNOWN_SENDER_QUESTION = (
    "Are you looking for physiotherapy care, are you a physiotherapist, "
    "or did a family member add you here?"
)

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


def begin_unknown(session: Session, phone_e164: str) -> str:
    del session, phone_e164
    return _UNKNOWN_SENDER_QUESTION


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text)


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


def maybe_provision_patient(
    session: Session, phone_e164: str, user_text: str
) -> Identity | None:
    if looks_like_role_claim(user_text):
        return None
    if not looks_like_symptom(user_text):
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
