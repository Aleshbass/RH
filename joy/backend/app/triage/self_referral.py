"""Self-referral triage and booking (owner's guide "JOY (Initial triage and booking)", Nov 2026).

For a patient with no physiotherapist, Joy runs a structured triage-and-matching flow. It never
names a condition, plans treatment or suggests exercises before a physio has assessed them.

    welcome + safety boundary -> language -> consent -> first name, age, area
    -> what's wrong (free text or voice, read by the model) -> affected area if unclear
    -> the 7-item red-flag screen -> up to 5 tap-to-answer questions
    -> outcome (never a diagnosis) -> 3 named physios with photos (app/booking/booking_flow.py)

Rules:
- Code owns every step. The model only reads the patient's own story.
- Red flags: any item except "None of these" stops the booking. Joy directs the patient to
  urgent medical care and the care team is alerted (owner decision: follow the guide exactly,
  "severe pain" included).
- Urgent clinician review: a protocol AMBER result, or "Severe" pain today, books the earliest
  free physio. The old paid specialist review is not offered here.
- No physio free within 24 hours: hand to the care team (owner decision).
- Self-management with safety-netting needs criteria and leaflets approved by the clinical
  lead. Until then every non-urgent result is routine physiotherapy.

State lives in the conversation's booking_context: ``triage_flow_state`` (the step) and
``self_referral`` (the answers). The language, consent and profile also go on the patient
record, so a returning patient is never asked twice. Switched on by JOY_SELF_REFERRAL_V2.
"""

from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.types import AuditKind, ConditionArea, ExtractedTriage, SafetyResult
from app.triage import timing

logger = logging.getLogger(__name__)

FLOW_KEY = "triage_flow_state"  # the same key app/conversation/turn_handler.py uses
SR_KEY = "self_referral"

LANGUAGE = "sr_language"
CONSENT = "sr_consent"
PROFILE = "sr_profile"
REASON = "sr_reason"
AREA = "sr_area"
RED_FLAGS = "sr_red_flags"
QUESTIONS = "sr_questions"
TIMING = "sr_timing"
CARE_TEAM = "sr_care_team"
BOOKING = "sr_booking"
FRONT_STEPS = (LANGUAGE, CONSENT, PROFILE)
STEPS = (*FRONT_STEPS, REASON, AREA, RED_FLAGS, QUESTIONS, TIMING, CARE_TEAM, BOOKING)

PRIVACY_URL = "https://physioaroundme.com/privacy-policy"
TERMS_URL = "https://physioaroundme.com/terms-and-conditions"


def enabled() -> bool:
    import app.config

    return bool(getattr(app.config.get_settings(), "joy_self_referral_v2", False))


def active(context: dict | None) -> bool:
    """This conversation runs the self-referral flow (it was started after the switch went on)."""
    return enabled() and isinstance((context or {}).get(SR_KEY), dict)


@dataclass
class Step:
    """What a self-referral step wants turn_handler to do with this message."""

    kind: str  # reply | story | red_flag | outcome | safety
    reply: str = ""
    interactive: dict | None = None
    before: list[dict] = field(default_factory=list)
    language: str | None = None
    story: str | None = None
    extracted: ExtractedTriage | None = None
    safety: SafetyResult | None = None
    urgent: bool = False
    stage: str | None = None  # "safety_screen" | "matching" | "summary"
    # The time window to match in (app/triage/timing.py Window.as_dict()), for an "outcome"
    window: dict | None = None


def _buttons(*options: tuple[str, str]) -> dict:
    from app.conversation.interactive import reply_buttons

    return reply_buttons(*options)


def _list(button: str, rows: list[tuple[str, str, str | None]], section: str) -> dict:
    from app.conversation.interactive import list_menu

    return list_menu(button, rows, section=section)


def _norm(text: str) -> str:
    return " ".join((text or "").casefold().replace("’", "'").split()).strip(" .!?,;:")


def _ctx(conversation: Conversation) -> dict:
    return dict(conversation.booking_context or {})


def _sr(context: dict) -> dict:
    value = context.get(SR_KEY)
    return dict(value) if isinstance(value, dict) else {}


def _save(conversation: Conversation, context: dict, sr: dict, step: str | None) -> None:
    context[SR_KEY] = sr
    if step is None:
        context.pop(FLOW_KEY, None)
    else:
        context[FLOW_KEY] = step
    conversation.booking_context = context


def step_interactive(conversation: Conversation | None) -> dict | None:
    """The buttons or list the current step was asked with, for asking it again."""
    if conversation is None:
        return None
    context = conversation.booking_context or {}
    step = context.get(FLOW_KEY)
    if step == LANGUAGE:
        return _list("Choose language", list(LANGUAGE_ROWS), "Language")
    if step == CONSENT:
        return _buttons(("I agree", "I agree"), ("I don't agree", "I don't agree"))
    if step in (AREA, RED_FLAGS, QUESTIONS, TIMING):
        menu = (context.get(SR_KEY) or {}).get("menu")
        return menu if isinstance(menu, dict) else None
    return None


def current_step(conversation: Conversation | None) -> str | None:
    if conversation is None:
        return None
    step = (conversation.booking_context or {}).get(FLOW_KEY)
    return step if step in STEPS else None


# ---------------------------------------------------------------------------------------------
# 1. Welcome, language, consent, profile
# ---------------------------------------------------------------------------------------------

WELCOME = (
    "Hi 👋 I'm Joy, Rehabify's recovery companion.\n\n"
    "I can help you find suitable physiotherapy care, understand your options, and book an "
    "assessment with a licensed physiotherapist.\n\n"
    "I don't provide a diagnosis or emergency care. In an emergency, call 112 or go to the nearest hospital.\n\n"
    "Which language would you like to use? Tap *Choose language*, or reply with a number:\n"
    "1. English\n2. Pidgin\n3. Yorùbá\n4. Igbo\n5. Hausa\n\n"
    "Messaging for someone else? Just tell me who it's for."
)
LANGUAGE_ROWS = (
    ("en", "English", None),
    ("pcm", "Pidgin", None),
    ("yo", "Yorùbá", None),
    ("ig", "Igbo", None),
    ("ha", "Hausa", None),
)
_LANGUAGE_WORDS = {
    "1": "en", "en": "en", "english": "en",
    "2": "pcm", "pcm": "pcm", "pidgin": "pcm", "pidgin english": "pcm", "broken english": "pcm",
    "3": "yo", "yo": "yo", "yoruba": "yo", "yorùbá": "yo", "yorúbà": "yo",
    "4": "ig", "ig": "ig", "igbo": "ig",
    "5": "ha", "ha": "ha", "hausa": "ha",
}

CONSENT_TEXT = (
    "Before we continue, please confirm:\n\n"
    "1️⃣ I agree to Rehabify's Privacy Policy and Terms of Service\n"
    "2️⃣ I consent to Rehabify securely storing my information to arrange my care\n\n"
    f"Privacy Policy: {PRIVACY_URL}\n"
    f"Terms of Service: {TERMS_URL}\n\n"
    "You can withdraw your consent at any time."
)
CONSENT_DECLINED = (
    "That's okay. I can only arrange care once you've agreed, because I need to keep your details "
    "to do that. If you change your mind, reply *I agree*.\n\n"
    "If this is an emergency, call 112 or go to the nearest hospital now."
)
_AGREE = {"i agree", "agree", "yes", "yes i agree", "i agree to both", "both", "1 2", "1 and 2", "1, 2", "ok", "okay",
          "i consent", "consent", "accept", "i accept", "yes please", "sure", "agreed", "y"}
_DISAGREE = {"no", "i don't agree", "i do not agree", "dont agree", "don't agree", "disagree", "no thanks", "i disagree"}

PROFILE_TEXT = (
    "Thank you. Let's get started.\n\n"
    "1. What is your first name?\n"
    "2. How old are you?\n"
    "3. Which city or area are you in?\n\n"
    "You can answer in one message, for example: *Ada, 34, Yaba Lagos*. "
    "I'll use this WhatsApp number to reach you."
)
REASON_TEXT = (
    "What would you like help with today? Tell me in your own words what's bothering you, or send a voice note."
)

# Common areas whose city patients often leave out
_AREA_CITY = {
    **{a: "Lagos" for a in (
        "yaba", "surulere", "ikeja", "lekki", "ajah", "victoria island", "vi", "ikoyi", "gbagada", "maryland",
        "ikorodu", "festac", "apapa", "magodo", "ogba", "ojota", "ketu", "mushin", "oshodi", "isolo", "egbeda",
        "ojodu", "berger", "agege", "alimosho", "ojo", "badagry", "epe", "sangotedo", "chevron", "oniru",
        "ilupeju", "anthony", "palmgrove", "akoka", "bariga", "shomolu", "ebute metta", "obalende", "ikotun",
        "igando", "ipaja", "ayobo", "abule egba", "iyana ipaja", "ogudu", "ilasamaja", "amuwo odofin",
    )},
    **{a: "Abuja" for a in (
        "wuse", "wuse 2", "garki", "maitama", "asokoro", "gwarinpa", "kubwa", "lugbe", "jabi", "utako", "life camp",
        "katampe", "jahi", "durumi", "apo", "lokogoma", "galadimawa", "karu", "nyanya", "dutse", "bwari", "gwagwalada",
    )},
}
_CITIES = {
    "lagos": "Lagos", "abuja": "Abuja", "fct": "Abuja", "port harcourt": "Port Harcourt", "ph": "Port Harcourt",
    "ibadan": "Ibadan", "kano": "Kano", "enugu": "Enugu", "benin": "Benin City", "benin city": "Benin City",
    "kaduna": "Kaduna", "abeokuta": "Abeokuta", "ilorin": "Ilorin", "owerri": "Owerri", "uyo": "Uyo",
    "calabar": "Calabar", "jos": "Jos", "warri": "Warri", "akure": "Akure", "osogbo": "Osogbo", "onitsha": "Onitsha",
    "asaba": "Asaba", "ogun": "Ogun", "oyo": "Oyo", "rivers": "Port Harcourt", "ibeju lekki": "Lagos",
}
_NAME_RE = re.compile(r"\b(?:my name is|my name's|i am|i'm|im|call me|name\s*:)\s+([A-Za-zÀ-ÿ'’-]{2,30})", re.I)
_AGE_WORDS_RE = re.compile(r"\b(?:age\s*:?|aged|i am|i'm|im)\s*(\d{1,3})\b", re.I)
_AGE_YEARS_RE = re.compile(r"\b(\d{1,3})\s*(?:years?(?:\s+old)?|yrs?(?:\s+old)?|y/?o)\b", re.I)
_PLACE_IN_RE = re.compile(r"\b(?:live in|living in|based in|staying in|stay in|reside in|from|in|at|area\s*:|city\s*:)\s+([^,.;\n]{2,60})", re.I)
_FILLER_RE = re.compile(r"(?:and|i|i am|i'm|im|i live|my|years? old|old|yrs|years|hi|hello|ok|okay)", re.I)
_NOT_A_NAME = {
    "yes", "no", "ok", "okay", "hi", "hello", "lagos", "abuja", "male", "female", "sir", "ma", "thanks",
    "in", "at", "from", "the", "a", "an", "here", "fine", "good", "not", "very", "so", "and", "pain", "my",
}


def parse_language(text: str) -> str | None:
    return _LANGUAGE_WORDS.get(_norm(text))


def _tidy_name(raw: str) -> str | None:
    name = raw.strip(" .,-:'’")
    if not name or not re.fullmatch(r"[A-Za-zÀ-ÿ'’-]{2,30}", name) or name.casefold() in _NOT_A_NAME:
        return None
    return name[:1].upper() + name[1:].lower() if (name.islower() or name.isupper()) else name


def place_from_text(text: str) -> tuple[str | None, str | None]:
    """(city, area) from what the patient typed. Either can be None; nothing is geocoded."""
    raw = " ".join((text or "").split()).strip(" .")
    if not raw:
        return None, None
    parts = [p.strip(" .") for p in re.split(r"[,;/\n]", raw) if p.strip(" .")]
    lowered = [p.casefold() for p in parts]
    city = None
    for index, part in enumerate(lowered):
        if part in _CITIES:
            city = _CITIES[part]
            area = ", ".join(p for i, p in enumerate(parts) if i != index) or None
            return city, area or (None if city else raw)
    words = raw.casefold()
    for key, name in sorted(_CITIES.items(), key=lambda item: -len(item[0])):
        if re.search(rf"\b{re.escape(key)}\b", words):
            area = re.sub(rf"\b{re.escape(key)}\b", "", raw, flags=re.I).strip(" ,.-")
            return name, area or None
    for key, name in _AREA_CITY.items():
        if re.search(rf"\b{re.escape(key)}\b", words):
            return name, raw
    return None, raw


def _age_in(text: str) -> tuple[int, re.Match] | None:
    """An age: "I am 34", "34 years", or a part that is only a number (never "Wuse 2")."""
    for regex in (_AGE_WORDS_RE, _AGE_YEARS_RE):
        match = regex.search(text)
        if match and 0 < int(match.group(1)) <= 110:
            return int(match.group(1)), match
    for match in re.finditer(r"(?:^|[,;\n])\s*(\d{1,3})\s*(?=$|[,;\n])", text):
        if 0 < int(match.group(1)) <= 110:
            return int(match.group(1)), match
    tokens = text.split()
    if len(tokens) >= 2 and tokens[1].isdigit() and 0 < int(tokens[1]) <= 110:
        # "Ada 34 Yaba": a word, then a number
        match = re.search(rf"\b{re.escape(tokens[1])}\b", text)
        if match:
            return int(tokens[1]), match
    return None


def parse_profile(text: str, missing: list[str]) -> dict[str, Any]:
    """first_name / age / place from one reply. With one field missing, the whole reply answers it."""
    raw = " ".join((text or "").split())
    found: dict[str, Any] = {}
    if not raw:
        return found
    if missing == ["name"]:
        match = _NAME_RE.search(raw)
        name = _tidy_name(match.group(1) if match else raw.split()[0])
        return {"name": name} if name else {}
    if missing == ["age"]:
        age = _age_in(raw) or (
            (int(m.group(1)), m) if (m := re.search(r"\b(\d{1,3})\b", raw)) and 0 < int(m.group(1)) <= 110 else None
        )
        return {"age": age[0]} if age else {}
    if missing == ["place"]:
        city, area = place_from_text(raw)
        return {"city": city, "area": area} if (city or area) else {}

    rest = raw
    match = _NAME_RE.search(rest)
    if match and _tidy_name(match.group(1)):
        found["name"] = _tidy_name(match.group(1))
        rest = f"{rest[:match.start()]} , {rest[match.end():]}"
    age = _age_in(rest)
    if age:
        found["age"] = age[0]
        rest = f"{rest[:age[1].start()]} , {rest[age[1].end():]}"
    place = None
    for place in _PLACE_IN_RE.finditer(rest):
        pass
    if place is not None:
        city, area = place_from_text(place.group(1))
        if city or area:
            found.update({"city": city, "area": area})
        rest = f"{rest[:place.start()]} , {rest[place.end():]}"
    parts = [part.strip(" .-") for part in re.split(r"[,;\n]|\band\b", rest, flags=re.I) if part.strip(" .-")]
    parts = [part for part in parts if not _FILLER_RE.fullmatch(part)]
    if "name" not in found and parts:
        first = parts[0].split()
        known_place = place_from_text(parts[0])[0] is not None
        if len(first) == 1 and _tidy_name(first[0]) and not known_place:
            found["name"] = _tidy_name(first[0])
            parts = parts[1:]
    if "city" not in found and "area" not in found and parts:
        city, area = place_from_text(", ".join(parts))
        if city or area:
            found.update({"city": city, "area": area})
    return found


_SEXES = ("female", "male", "other", "prefer_not_to_say")


def profile_missing(patient: Patient, sr: dict | None = None) -> list[str]:
    """What the profile still needs, in the order Joy asks (one question per message).

    With the self-referral state: "confirm" first when the name came from an existing record
    ("Am I speaking with Simidara?", in case someone else is using the phone), and the patient's
    preference for a female or male physiotherapist last.
    """
    missing = []
    if sr is not None and sr.get("known_name") and not sr.get("identity_confirmed"):
        missing.append("confirm")
    if not (patient.name or "").strip():
        missing.append("name")
    if patient.age is None and patient.date_of_birth is None:
        missing.append("age")
    if (patient.gender or "") not in _SEXES and not (sr or {}).get("sex_skipped"):
        missing.append("sex")
    if not (patient.area or patient.city or patient.location):
        missing.append("place")
    if sr is not None and "physio_pref" not in sr:
        missing.append("physio_pref")
    return missing


def _first_name(patient: Patient) -> str:
    return (patient.name or "").split(" ")[0].strip()


_ASK_MISSING = {
    "name": "What's your first name?",
    "age": "How old are you? A number is fine. If you're asking for a child, tell me their age.",
    "sex": "Are you female or male?",
    "place": "Which state and area are you in? For example, *Bodija, Ibadan*. You can also tap *Send location*.",
    "physio_pref": "Would you prefer a female or male physiotherapist?",
}
_YES_WORDS = {"yes", "yeah", "yep", "y", "yes that's me", "that's me", "it's me", "its me", "correct", "right",
              "yes it is", "yes i am", "sure", "ok", "okay", "yes, that's me", "na me", "yes na me"}
_NO_WORDS = {"no", "nope", "n", "not me", "no it's not", "no its not", "someone else", "wrong person", "no i'm not",
             "no im not", "that's not me", "thats not me"}
_PREF_NONE = {"no preference", "none", "any", "anyone", "either", "either is fine", "doesn't matter", "does not matter",
              "it doesn't matter", "i don't mind", "dont mind", "i dont mind", "no", "not really", "anybody", "any one"}


def _parse_sex(text: str) -> str | None:
    plain = _norm(text)
    if plain in {"f"} or re.search(r"\b(female|woman|lady|girl)\b", plain):
        return "female"
    if plain in {"m"} or re.search(r"\b(male|man|guy|boy|gentleman)\b", plain):
        return "male"
    return None


def _parse_physio_pref(text: str) -> str | None:
    plain = _norm(text)
    if plain in _PREF_NONE or re.search(r"\bno preference\b|\bdoesn'?t matter\b|\bany(one|body)?\b", plain):
        return "none"
    return _parse_sex(plain)


def _profile_prompt(field: str, patient: Patient) -> tuple[str, dict | None]:
    """The question for one profile field, with its buttons."""
    if field == "confirm":
        first = _first_name(patient) or "you"
        place = ", ".join(part for part in (patient.area, patient.city) if part)
        known = []
        if patient.age is not None:
            known.append(f"{patient.age}")
        if place:
            known.append(f"in {place}")
        details = f" I have you down as {first}, {', '.join(known)}." if known else ""
        return (f"Am I speaking with {first}?{details}",
                _buttons(("yes", "Yes, that's me"), ("no", "No, someone else")))
    if field == "sex":
        return _ASK_MISSING["sex"], _buttons(("female", "Female"), ("male", "Male"))
    if field == "physio_pref":
        return _ASK_MISSING["physio_pref"], _buttons(("no preference", "No preference"), ("female", "Female"), ("male", "Male"))
    if field == "place":
        from app.conversation.interactive import location_request

        return _ASK_MISSING["place"], location_request()
    return _ASK_MISSING[field], None


def _looks_like_story(text: str) -> bool:
    """A message that tells Joy what's wrong, not a reply to the step (kept to process later)."""
    words = re.findall(r"[A-Za-zÀ-ÿ']+", text or "")
    return len(words) >= 4


def _keep_story(sr: dict, text: str) -> None:
    story = (sr.get("opening_story") or "").strip()
    text = (text or "").strip()
    if text and text not in story:
        sr["opening_story"] = f"{story}\n{text}".strip()[:1500]


def needs_front(patient: Patient, sr: dict | None = None) -> list[str]:
    steps = []
    if not patient.preferred_language:
        steps.append(LANGUAGE)
    if patient.care_consent_at is None:
        steps.append(CONSENT)
    if profile_missing(patient, sr if sr is not None else {}) and not (sr or {}).get("profile_skipped"):
        steps.append(PROFILE)
    return steps


def _record_consent(session: Session, patient: Patient, conversation: Conversation) -> None:
    """Terms and Privacy on the patient's Rehabify record (the versions RH says are current). Never raises."""
    try:
        from app.booking.booking_flow import _rh_patient_id
        from app.integrations.rh_client import RHActor, configured_rh_client

        rh_patient_id = _rh_patient_id(session, patient)
        if not rh_patient_id:
            return
        client = configured_rh_client()
        actor = RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id)
        needed = client.operational_query("patient_consent_status", actor=actor, data={"patient_id": rh_patient_id}).get("consents_required") or []
        accepted = {
            str(doc["policy_id"]): str(doc["version"])
            for doc in needed if isinstance(doc, dict) and doc.get("policy_id") and doc.get("version")
        }
        if accepted:
            client.operational_mutation(
                "patient_record_consents", actor=actor,
                data={"patient_id": rh_patient_id, "accepted": accepted, "conversation_id": f"joy-consent:{conversation.id}"},
                idempotency_key=f"joy-care-consent-{patient.id}-{'-'.join(sorted(accepted.values()))}",
            )
    except Exception:
        logger.warning("joy_care_consent_not_recorded", exc_info=True)


def _sync_profile(session: Session, patient: Patient) -> None:
    """First name, age, sex and place on the Rehabify record. Never raises."""
    try:
        from app.booking.booking_flow import _rh_patient_id
        from app.integrations.rh_client import RHActor, configured_rh_client

        rh_patient_id = _rh_patient_id(session, patient)
        if not rh_patient_id:
            return
        data = {k: v for k, v in {
            "patient_id": rh_patient_id, "first_name": _first_name(patient) or None,
            "state": getattr(patient, "state", None), "city": patient.city, "area": patient.area,
            "age_years": patient.age if isinstance(patient.age, int) and 0 < patient.age < 120 else None,
            "gender": patient.gender if patient.gender in ("female", "male") else None,
        }.items() if v}
        configured_rh_client().operational_mutation(
            "patient_update_profile",
            actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id),
            data=data, idempotency_key=f"joy-sr-profile-{patient.id}-{hashlib.sha256(repr(sorted(data.items())).encode()).hexdigest()[:16]}",
        )
    except Exception:
        logger.warning("joy_sr_profile_not_synced", exc_info=True)


def _apply_place(patient: Patient, city: str | None, area: str | None) -> None:
    if city:
        patient.city = city
    if area:
        patient.area = area[:80]
    if city or area:
        patient.location = ", ".join(p for p in (area, city) if p)[:120]


def _next_front(session: Session, patient: Patient, conversation: Conversation, context: dict, sr: dict, *, prefix: str = "") -> Step:
    """Ask the next front step, or move on to the story once they're all done."""
    steps = needs_front(patient, sr)
    lead = f"{prefix}\n\n" if prefix else ""
    if CONSENT in steps:
        _save(conversation, context, sr, CONSENT)
        return Step("reply", lead + CONSENT_TEXT, _buttons(("I agree", "I agree"), ("I don't agree", "I don't agree")))
    if PROFILE in steps:
        # One question per message (Joy coordination spec, step 4)
        field = profile_missing(patient, sr)[0]
        sr["asking"] = field
        _save(conversation, context, sr, PROFILE)
        ask, menu = _profile_prompt(field, patient)
        return Step("reply", lead + ask, menu)
    sr["front_done_at"] = datetime.now(timezone.utc).isoformat()
    story = (sr.pop("opening_story", None) or "").strip()
    if story:
        # They already told Joy what's wrong: read it now, as this turn's message
        _save(conversation, context, sr, None)
        return Step("story", story=story)
    _save(conversation, context, sr, REASON)
    name = _first_name(patient)
    return Step("reply", f"{lead}Thanks{', ' + name if name else ''}. {REASON_TEXT}")


def start(session: Session, patient: Patient, conversation: Conversation, user_text: str, *, is_greeting: bool) -> Step | None:
    """The first message of a new self-referral: the welcome and language question, or onward."""
    context = _ctx(conversation)
    sr = _sr(context)
    sr.setdefault("started_at", datetime.now(timezone.utc).isoformat())
    if (patient.name or "").strip() and "known_name" not in sr:
        # Known from an earlier record: confirm it's them before using it (a relative may have the phone)
        sr["known_name"] = patient.name
    if not is_greeting and _looks_like_story(user_text):
        _keep_story(sr, user_text)
    append(session, kind=AuditKind.TRIAGE, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"event": "self_referral_started", "conversation_id": str(conversation.id)})
    if LANGUAGE in needs_front(patient, sr):
        _save(conversation, context, sr, LANGUAGE)
        return Step("reply", WELCOME, _list("Choose language", list(LANGUAGE_ROWS), "Language"))
    if not needs_front(patient, sr) and not sr.get("opening_story"):
        # Language, consent and profile are already known: straight to what's wrong
        name = _first_name(patient)
        _save(conversation, context, sr, REASON)
        return Step("reply", f"Hi{' ' + name if name else ''} 👋 I'm Joy. I don't give a diagnosis or emergency care "
                             f"(in an emergency, call 112).\n\n{REASON_TEXT}")
    return _next_front(session, patient, conversation, context, sr)


def front_turn(
    session: Session, patient: Patient, conversation: Conversation, user_text: str, *,
    detected_language: str, location: tuple[float, float] | None = None,
) -> Step | None:
    context = _ctx(conversation)
    sr = _sr(context)
    step = context.get(FLOW_KEY)
    text = _norm(user_text)

    pinned = False
    if location is not None:
        from app.booking.booking_flow import place_from_pin

        found_pin = place_from_pin(session, patient, context, location[0], location[1])
        if found_pin:
            _apply_place(patient, *found_pin)
            pinned = True
        if step == LANGUAGE:
            _save(conversation, context, sr, LANGUAGE)
            return Step("reply", "Thanks, I've saved your location.\n\n" + WELCOME,
                        _list("Choose language", list(LANGUAGE_ROWS), "Language"))
        if step != PROFILE:
            return _next_front(session, patient, conversation, context, sr)
        if not pinned and "place" in profile_missing(patient, sr):
            _save(conversation, context, sr, PROFILE)
            return Step("reply", "Thanks for the pin. I couldn't work out the area from it, so please type your area and city, for example *Yaba, Lagos*.")

    if step == LANGUAGE:
        language = parse_language(user_text)
        if language is None:
            if _looks_like_story(user_text):
                # They went straight to their problem: keep it, and use the language they wrote in
                _keep_story(sr, user_text)
                language = detected_language or "en"
            else:
                attempts = int(sr.get("language_attempts") or 0) + 1
                sr["language_attempts"] = attempts
                if attempts < 2:
                    _save(conversation, context, sr, LANGUAGE)
                    return Step("reply", "Please choose a language: reply 1 for English, 2 Pidgin, 3 Yorùbá, 4 Igbo or 5 Hausa.",
                                _list("Choose language", list(LANGUAGE_ROWS), "Language"))
                language = detected_language or "en"
        patient.preferred_language = language
        sr["language"] = language
        step_result = _next_front(session, patient, conversation, context, sr)
        step_result.language = language
        return step_result

    if step == CONSENT:
        if text in _AGREE or text.startswith("i agree"):
            patient.care_consent_at = datetime.now(timezone.utc)
            sr["consented_at"] = patient.care_consent_at.isoformat()
            append(session, kind=AuditKind.POLICY, actor_phone=patient.phone_e164, person_id=patient.id,
                   payload={"event": "care_consent_given", "privacy": PRIVACY_URL, "terms": TERMS_URL, "conversation_id": str(conversation.id)})
            session.flush()
            _record_consent(session, patient, conversation)
            return _next_front(session, patient, conversation, context, sr)
        if text in _DISAGREE:
            _save(conversation, context, sr, CONSENT)
            append(session, kind=AuditKind.POLICY, actor_phone=patient.phone_e164, person_id=patient.id,
                   payload={"event": "care_consent_declined", "conversation_id": str(conversation.id)})
            return Step("reply", CONSENT_DECLINED, _buttons(("I agree", "I agree")))
        if _looks_like_story(user_text):
            _keep_story(sr, user_text)
            _save(conversation, context, sr, CONSENT)
            return Step("reply", "Thanks, I've noted that. " + CONSENT_TEXT, _buttons(("I agree", "I agree"), ("I don't agree", "I don't agree")))
        _save(conversation, context, sr, CONSENT)
        return Step("reply", "Please tap *I agree* to continue, or *I don't agree*.\n\n" + CONSENT_TEXT,
                    _buttons(("I agree", "I agree"), ("I don't agree", "I don't agree")))

    if step == PROFILE:
        missing = profile_missing(patient, sr)
        field = sr.get("asking") if sr.get("asking") in missing else (missing[0] if missing else None)
        prefix = ""
        got = bool(pinned)
        if field == "confirm":
            if text in _YES_WORDS or text.startswith("yes"):
                sr["identity_confirmed"] = True
                got = True
            elif text in _NO_WORDS or text.startswith("no"):
                # Someone else has this phone: take their own details, and use only those
                for attr in ("name", "age", "date_of_birth", "gender", "city", "area", "location"):
                    setattr(patient, attr, None)
                sr["identity_confirmed"] = True
                sr["identity_changed"] = True
                prefix = "Thanks for letting me know."
                got = True
        elif field == "sex":
            sex = _parse_sex(user_text)
            if sex:
                patient.gender = sex
                got = True
        elif field == "physio_pref":
            pref = _parse_physio_pref(user_text)
            if pref:
                sr["physio_pref"] = pref
                got = True
        if field in ("name", "age", "place") and not pinned:
            # Their answer, and anything else they typed with it ("Ada, 34, Yaba")
            core = [item for item in ("name", "age", "place") if item in missing]
            found = parse_profile(user_text, core)
            if found.get("name") and "name" in missing:
                patient.name = found["name"]
            if found.get("age") and "age" in missing:
                patient.age = int(found["age"])
            if (found.get("city") or found.get("area")) and "place" in missing:
                _apply_place(patient, found.get("city"), found.get("area"))
            got = got or field in found or (field == "place" and bool(found.get("city") or found.get("area")))
        if not got and _looks_like_story(user_text) and field in ("confirm", "name"):
            _keep_story(sr, user_text)
        session.flush()
        if not got and field is not None:
            tries = int(sr.get(f"{field}_attempts") or 0) + 1
            sr[f"{field}_attempts"] = tries
            if field == "sex" and tries >= 2:
                sr["sex_skipped"] = True  # never trap anyone: the physio can ask
            elif field == "physio_pref" and tries >= 2:
                sr["physio_pref"] = "none"
            elif field == "confirm" and tries >= 2:
                sr["identity_confirmed"] = True
            elif field in ("name", "age", "place"):
                attempts = int(sr.get("profile_attempts") or 0) + 1
                sr["profile_attempts"] = attempts
                if attempts >= 3:
                    # Never trap anyone here: the physio can take the missing details on the call
                    sr["profile_skipped"] = True
                    sr["profile_missing"] = profile_missing(patient, sr)
        if not profile_missing(patient, sr):
            append(session, kind=AuditKind.TRIAGE, actor_phone=patient.phone_e164, person_id=patient.id,
                   payload={"event": "self_referral_profile", "has_age": patient.age is not None, "city": patient.city,
                            "sex": patient.gender, "physio_pref": sr.get("physio_pref"),
                            "identity_changed": bool(sr.get("identity_changed"))})
            _sync_profile(session, patient)
        return _next_front(session, patient, conversation, context, sr, prefix=prefix)

    return None


def front_pending(patient: Patient, conversation: Conversation | None) -> bool:
    return current_step(conversation) in FRONT_STEPS


# ---------------------------------------------------------------------------------------------
# 2. After the story: the affected area, then the red-flag screen
# ---------------------------------------------------------------------------------------------

AREA_ROWS = (
    ("neck", "Neck", None),
    ("shoulder", "Shoulder", None),
    ("upper back", "Upper back", None),
    ("lower back", "Lower back", None),
    ("hip", "Hip", None),
    ("knee", "Knee", None),
    ("ankle or foot", "Ankle or foot", None),
    ("elbow, wrist or hand", "Elbow, wrist or hand", None),
    ("other", "Somewhere else", None),
)
AREA_TEXT = "Thanks. Which area is affected? Tap *Choose area*, or tell me in a few words."


def _is_back(extracted: ExtractedTriage) -> bool:
    text = " ".join(filter(None, [extracted.body_region, extracted.body_location, extracted.main_complaint])).casefold()
    return bool(re.search(r"\b(back|lumbar|spine|spinal|sciatic|waist)\b", text)) and "upper back" not in text


def _is_neck(extracted: ExtractedTriage) -> bool:
    text = " ".join(filter(None, [extracted.body_region, extracted.body_location, extracted.main_complaint])).casefold()
    return bool(re.search(r"\b(neck|cervical)\b", text))


RED_FLAG_ITEMS = (
    # (id, list title <= 24, full wording, level, words that mean it when typed)
    ("1", "Chest pain or breathing", "Chest pain, trouble breathing, or fainting", "RED",
     ("chest pain", "chest", "breath", "breathing", "faint", "fainted", "passed out", "collapse")),
    ("2", "Weakness or numbness", "New weakness, numbness, or trouble speaking", "RED",
     ("weak", "weakness", "numb", "numbness", "speak", "speaking", "speech", "slurred", "face droop")),
    ("3", "Bladder or bowel", "Loss of bladder or bowel control", "RED",
     ("bladder", "bowel", "incontinen", "wet myself", "can't pee", "cannot pee", "control my urine")),
    ("4", "Severe or worsening pain", "Severe or rapidly worsening pain", "ORANGE",
     ("severe", "worsening", "getting worse", "unbearable", "excruciating", "worst pain")),
    ("5", "Weight loss or fever", "Unexplained weight loss, fever, or night sweats", "ORANGE",
     ("weight loss", "losing weight", "lost weight", "fever", "night sweat", "high temperature")),
    ("6", "Major injury or accident", "Recent major injury or accident", "ORANGE",
     ("accident", "crash", "major injury", "serious injury", "hit by", "fell from")),
)
NONE_ID = "7"
_BACK_BLADDER = "Loss of bladder or bowel control, or numbness in your groin or bottom"
_BACK_WORDS = ("groin", "saddle", "genital", "numb bottom", "numbness around")
_NONE_WORDS = {"none", "no", "none of these", "none of them", "nope", "no to all", "nothing", "non", "no none",
               "none apply", "not at all", "no i haven't", "no i have not", "i haven't", "i have not", "nah", "never"}
_NEGATION_RE = re.compile(r"\b(?:no|not|never|without|don't|dont|haven't|havent|hasn't|didn't|isn't|nor)\b[^.,;!?]{0,40}$")


def red_flag_items(extracted: ExtractedTriage) -> list[tuple[str, str, str, str, tuple[str, ...]]]:
    items = list(RED_FLAG_ITEMS)
    if _is_back(extracted):
        # Low back pain: the bladder item also covers saddle numbness (cauda equina), which the
        # protocol asks about and the guide's list would otherwise miss
        ident, title, _, level, words = items[2]
        items[2] = (ident, title, _BACK_BLADDER, level, words + _BACK_WORDS)
    return items


def red_flag_prompt(extracted: ExtractedTriage, name: str | None = None) -> tuple[str, dict]:
    items = red_flag_items(extracted)
    lines = "\n".join(f"{ident}️⃣ {wording}" for ident, _, wording, _, _ in items)
    thanks = f"Thanks{', ' + name if name else ''}. " if name is not None else ""
    text = (
        f"{thanks}I need to ask a few safety questions. Some symptoms need a doctor urgently rather than "
        "physiotherapy, so I always check these first.\n\n"
        "In the last few weeks, have you had any of the following?\n\n"
        f"{lines}\n{NONE_ID}️⃣ None of these\n\n"
        "Reply with the number(s) that apply, or 7 if none."
    )
    rows = [(ident, title, wording) for ident, title, wording, _, _ in items] + [(NONE_ID, "None of these", None)]
    return text, _list("Choose", rows, "Safety check")


def parse_red_flags(text: str, extracted: ExtractedTriage) -> tuple[str, set[str]]:
    """("none" | "positive" | "unclear" | "which", the items). Never guesses "none"."""
    raw = (text or "").strip()
    norm = _norm(raw)
    if not norm:
        return "unclear", set()
    if norm in {NONE_ID, "7 none", "7. none of these", "none of these 7"}:
        return "none", set()
    if re.fullmatch(r"[\d\s,;/&.+-]+|(?:\d+\s*(?:,|and|&)\s*)+\d+", norm):
        numbers = {n for n in re.findall(r"\d", norm) if n in {"1", "2", "3", "4", "5", "6", "7"}}
        positive = numbers - {NONE_ID}
        if positive:
            return "positive", positive
        if numbers == {NONE_ID}:
            return "none", set()
        return "unclear", set()
    found: set[str] = set()
    for ident, _, _, _, words in red_flag_items(extracted):
        for word in words:
            for match in re.finditer(rf"\b{re.escape(word)}", norm):
                if not _NEGATION_RE.search(norm[: match.start()]):
                    found.add(ident)
    if found:
        return "positive", found
    if norm in _NONE_WORDS or re.match(r"^(?:no|none|nope|nothing)\b", norm):
        return "none", set()
    if norm in {"yes", "yeah", "yep", "y", "i have", "some", "one of them", "yes i have"}:
        return "which", set()
    return "unclear", set()


RED_FLAG_STOP = (
    "Thank you for telling me. Some of these symptoms can need urgent medical assessment.\n\n"
    "Please stop and seek urgent medical care now: go to the nearest hospital emergency department, or call 112.\n\n"
    "I've saved a summary of what you told me, and I've let our care team know. I can't arrange routine "
    "physiotherapy until you have been medically assessed."
)
EMERGENCY_GUIDANCE = (
    "🚨 Getting emergency help in Nigeria\n\n"
    "• Call 112. It's free from any phone\n"
    "• In Lagos, you can also call 767\n"
    "• Or go straight to the emergency department of the nearest general or teaching hospital\n"
    "• If you feel faint, or have chest pain or weakness, don't drive yourself: ask someone to take you\n"
    "• Take your medicines and any medical reports with you\n\n"
    "When a doctor has seen you and says physiotherapy is safe, message me here and I'll help you book."
)
EMERGENCY_UNDERSTOOD = (
    "Thank you. Please get medical care now. When a doctor says physiotherapy is safe for you, "
    "message me here and I'll help you book."
)


def stop_buttons() -> dict:
    return _buttons(("emergency guidance", "Emergency guidance"), ("i understand", "I understand"))


def red_flag_result(items: set[str], extracted: ExtractedTriage) -> SafetyResult:
    chosen = [item for item in red_flag_items(extracted) if item[0] in items]
    level = "RED" if any(item[3] == "RED" for item in chosen) else "ORANGE"
    return SafetyResult(
        fired=True,
        rule_ids=[f"SR-RF-{item[0]}" for item in chosen],
        reason_plain_language="Reported on the safety screen: " + "; ".join(item[2] for item in chosen) + ".",
        action="escalate_doctor" if level == "RED" else "medical_review",
        risk_level=level,
        protocol_version="self-referral-2026-11",
        answers={f"SR-RF-{item[0]}": "yes" for item in chosen},
    )


def resend_after_stop(user_text: str) -> tuple[str, dict | None]:
    """What an escalated self-referral patient gets on later messages."""
    text = _norm(user_text)
    if "guidance" in text or "emergency" in text or "hospital" in text or "where" in text:
        return EMERGENCY_GUIDANCE, None
    if text in {"i understand", "ok", "okay", "understood", "thanks", "thank you", "alright", "noted"}:
        return EMERGENCY_UNDERSTOOD, None
    return RED_FLAG_STOP, stop_buttons()


def after_story(session: Session, patient: Patient, conversation: Conversation, extracted: ExtractedTriage, *, has_area: bool) -> Step:
    """The story is in: ask the area if unclear, otherwise the red-flag screen."""
    context = _ctx(conversation)
    sr = _sr(context)
    if not has_area:
        menu = _list("Choose area", list(AREA_ROWS), "Affected area")
        sr["menu"] = menu  # sent with this reply by app/conversation/interactive.py
        _save(conversation, context, sr, AREA)
        return Step("reply", AREA_TEXT, menu, stage="safety_screen")
    text, menu = red_flag_prompt(extracted, _first_name(patient) or None)
    sr["red_flag_asked_at"] = datetime.now(timezone.utc).isoformat()
    sr["menu"] = menu
    _save(conversation, context, sr, RED_FLAGS)
    return Step("reply", text, menu, stage="safety_screen")


def _area_answer(text: str) -> tuple[str | None, bool]:
    """(the area, whether to ask them to say more)."""
    norm = _norm(text)
    for ident, title, _ in AREA_ROWS:
        if norm == ident or norm == title.casefold():
            return (None, True) if ident == "other" else (title.lower(), False)
    if norm in {"somewhere else", "elsewhere", "other area"}:
        return None, True
    if 1 <= len(norm) <= 60:
        return norm, False
    return None, True


# ---------------------------------------------------------------------------------------------
# 3. Condition questions (5 at most, only the ones the story didn't answer)
# ---------------------------------------------------------------------------------------------

YES_NO = (("yes", "Yes"), ("no", "No"))


def condition_questions(extracted: ExtractedTriage) -> list[dict]:
    questions: list[dict] = []
    if not (extracted.onset or extracted.duration):
        questions.append({"key": "onset", "text": "When did it start?",
                          "buttons": (("less than 1 week", "Less than 1 week"), ("1-6 weeks", "1–6 weeks"), ("more than 6 weeks", "More than 6 weeks"))})
    if extracted.severity is None:
        questions.append({"key": "pain", "text": "How would you rate the pain today? Tap one, or reply with a number from 0 to 10.",
                          "buttons": (("mild", "Mild"), ("moderate", "Moderate"), ("severe", "Severe"))})
    if not extracted.radiation and (_is_back(extracted) or _is_neck(extracted)):
        limb = "leg" if _is_back(extracted) else "arm"
        questions.append({"key": "radiation", "text": f"Does it travel into your {limb}?", "limb": limb,
                          "buttons": (("yes", "Yes"), ("no", "No"), ("not sure", "Not sure"))})
    if not extracted.functional_limitations:
        questions.append({"key": "impact", "text": "Does it affect your sleep, work, or daily activities?",
                          "buttons": (("yes", "Yes"), ("no", "No"), ("sometimes", "Sometimes"))})
    if extracted.seen_clinician is None and not extracted.previous_treatment:
        questions.append({"key": "seen", "text": "Have you seen a doctor or physiotherapist about this before?",
                          "buttons": YES_NO})
    return questions[:5]


_ONSET_LABEL = {"lt1w": "Less than 1 week", "1to6w": "1–6 weeks", "gt6w": "More than 6 weeks"}


def _onset_bucket(text: str) -> str | None:
    norm = _norm(text).replace("–", "-")
    if "less than 1 week" in norm or "less than a week" in norm or norm in {"today", "yesterday", "this week", "few days", "a few days"}:
        return "lt1w"
    if norm in {"1-6 weeks", "1 to 6 weeks", "few weeks", "a few weeks"}:
        return "1to6w"
    if "more than 6 weeks" in norm or norm in {"long time", "a long time", "months", "years"}:
        return "gt6w"
    match = re.search(r"(\d+|a|an|one|two|three|four|five|six)\s*(day|week|wk|month|year|yr)s?", norm)
    if not match:
        return None
    words = {"a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
    count = int(match.group(1)) if match.group(1).isdigit() else words[match.group(1)]
    unit = match.group(2)
    days = count * {"day": 1, "week": 7, "wk": 7, "month": 30, "year": 365, "yr": 365}[unit]
    return "lt1w" if days < 7 else "1to6w" if days <= 42 else "gt6w"


def _pain(text: str) -> tuple[str | None, int | None]:
    norm = _norm(text)
    match = re.fullmatch(r"(?:it'?s\s+|about\s+|around\s+)?(\d{1,2})(?:\s*(?:/|out of)\s*10)?", norm)
    if match and 0 <= int(match.group(1)) <= 10:
        score = int(match.group(1))
        return ("mild" if score <= 3 else "moderate" if score <= 6 else "severe"), score
    if re.search(r"\b(severe|very bad|terrible|unbearable|worst|extreme)\b", norm):
        return "severe", None
    if re.search(r"\b(moderate|medium|bad|quite bad)\b", norm):
        return "moderate", None
    if re.search(r"\b(mild|small|little|slight|not bad|manageable)\b", norm):
        return "mild", None
    return None, None


def _yes_no(text: str, *, allow: tuple[str, ...]) -> str | None:
    norm = _norm(text)
    if norm in {"yes", "y", "yeah", "yep", "it does", "yes it does", "i have", "yes i have"}:
        return "yes"
    if norm in {"no", "n", "nope", "it doesn't", "no it doesn't", "i haven't", "no i haven't", "never", "not really"}:
        return "no"
    if "sometimes" in allow and norm in {"sometimes", "occasionally", "a bit", "a little"}:
        return "sometimes"
    if "not sure" in allow and norm in {"not sure", "i don't know", "dont know", "don't know", "maybe", "unsure"}:
        return "not sure"
    return None


def _question_step(conversation: Conversation, context: dict, sr: dict, questions: list[dict], index: int, *, lead: str = "") -> Step:
    question = questions[index]
    sr["question_keys"] = [q["key"] for q in questions]
    sr["question_index"] = index
    sr["menu"] = _buttons(*question["buttons"])
    _save(conversation, context, sr, QUESTIONS)
    count = f"{index + 1}/{len(questions)} " if len(questions) > 1 else ""
    return Step("reply", f"{lead}{count}{question['text']}", _buttons(*question["buttons"]), stage="safety_screen")


def apply_answer(extracted: ExtractedTriage, key: str, value: str, score: int | None, raw: str, limb: str | None) -> ExtractedTriage:
    update: dict[str, Any] = {}
    if key == "onset":
        label = _ONSET_LABEL.get(value, raw[:60])
        update.update({"onset": label, "duration": label})
    elif key == "pain":
        mapped = score if score else {"mild": 3, "moderate": 5, "severe": 8}.get(value)
        if mapped:
            update["severity"] = max(1, min(10, mapped))
    elif key == "radiation":
        update["radiation"] = {"yes": f"into the {limb or 'limb'}", "no": "does not travel", "not sure": "not sure"}.get(value, raw[:60])
    elif key == "impact":
        if value in {"yes", "sometimes"}:
            update["functional_limitations"] = [f"sleep, work or daily activities ({value})"]
        elif value == "no":
            update["functional_limitations"] = ["no effect on sleep, work or daily activities"]
    elif key == "seen":
        if value in {"yes", "no"}:
            update["seen_clinician"] = value == "yes"
    return extracted.model_copy(update=update) if update else extracted


def clear_protocol_screen(extracted: ExtractedTriage) -> ExtractedTriage:
    """"None of these" answers the protocol's own screen too, so it isn't asked again."""
    from app.safety.protocol_runtime import NO, schedule_questions

    answers = dict(extracted.safety_answers)
    order = list(extracted.safety_question_order)
    for question in schedule_questions(extracted, limit=100):
        answers.setdefault(question.id, NO)
        if question.id not in order:
            order.append(question.id)
    return extracted.model_copy(update={
        "safety_answers": answers, "safety_question_order": order,
        "safety_protocol_version": extracted.safety_protocol_version or "1.0.0",
    })


def _outcome(patient: Patient, conversation: Conversation, context: dict, sr: dict, extracted: ExtractedTriage) -> Step:
    from app.safety.evaluator import evaluate

    safety = evaluate(extracted)
    if safety.fired:
        _save(conversation, context, sr, None)
        return Step("safety", extracted=extracted, safety=safety)
    urgent = (safety.risk_level or "").upper() == "AMBER" or safety.action == "specialist_review" or sr.get("answers", {}).get("pain") == "severe"
    sr["outcome"] = "urgent" if urgent else "routine"
    sr["outcome_rules"] = list(safety.rule_ids)
    if urgent:
        # Urgent patients see only physios free today or tomorrow (spec, matching protocol 5)
        window = timing.soon_window()
        sr["window"] = window.as_dict()
        _save(conversation, context, sr, BOOKING)
        return Step("outcome", extracted=extracted, urgent=True, stage="matching", window=window.as_dict())
    return _timing_step(conversation, context, sr, before=[{"text": outcome_text(False)}], extracted=extracted)


def _timing_step(conversation: Conversation, context: dict, sr: dict, *, lead: str = "", before: list[dict] | None = None,
                 extracted: ExtractedTriage | None = None) -> Step:
    """Ask "When are you free?" with its three buttons."""
    sr.pop("timing_days", None)
    sr["menu"] = timing.timing_buttons()
    _save(conversation, context, sr, TIMING)
    return Step("reply", f"{lead}{timing.TIMING_TEXT}", sr["menu"], before=list(before or []), extracted=extracted, stage="matching")


def timing_turn(conversation: Conversation, context: dict, sr: dict, user_text: str, extracted: ExtractedTriage) -> Step:
    """The answer to "When are you free?" (or to the list of days)."""
    choice = timing.parse_timing(user_text, days_shown=sr.get("timing_days"))
    if choice == "choose":
        rows = timing.day_rows()
        sr["timing_days"] = [row[0] for row in rows]
        sr["menu"] = timing.day_menu()
        _save(conversation, context, sr, TIMING)
        return Step("reply", timing.DAY_TEXT, sr["menu"], extracted=extracted, stage="matching")
    window = timing.window_for(choice) if choice is not None else None
    if window is None:
        if isinstance(choice, date):
            lead = ("There are no times left that day. " if choice <= datetime.now(timing.LAGOS).date()
                    else "I can book up to a week ahead. ")
        else:
            lead = "Sorry, I didn't catch that. "
        return _timing_step(conversation, context, sr, lead=lead, extracted=extracted)
    sr["window"] = window.as_dict()
    sr.pop("timing_days", None)
    sr.pop("menu", None)
    _save(conversation, context, sr, BOOKING)
    return Step("outcome", extracted=extracted, urgent=False, stage="matching", window=window.as_dict())


def outcome_text(urgent: bool) -> str:
    if urgent:
        return (
            "Thank you. Based on your answers, it would be best for a physiotherapist to assess you soon, "
            "so I'll show you the earliest times available.\n\n"
            "This is not a diagnosis. A licensed physiotherapist will review your information before your "
            "appointment. If things get worse before then, get medical care straight away or call 112."
        )
    return (
        "Thank you. Based on your answers, a physiotherapy assessment may be helpful.\n\n"
        "This is not a diagnosis. I can help you book an initial consultation with a licensed physiotherapist, "
        "who will review your information before your appointment."
    )


def triage_turn(
    session: Session, patient: Patient, conversation: Conversation, state_extracted: ExtractedTriage, user_text: str,
) -> Step | None:
    """The area, red-flag and condition-question steps. None when this message isn't for them."""
    context = _ctx(conversation)
    sr = _sr(context)
    step = context.get(FLOW_KEY)
    extracted = state_extracted

    if step == AREA:
        area, ask_more = _area_answer(user_text)
        if ask_more and not sr.get("area_other_asked"):
            sr["area_other_asked"] = True
            _save(conversation, context, sr, AREA)
            return Step("reply", "Please tell me in a few words which part of your body is affected.", stage="safety_screen")
        area = area or _norm(user_text)[:60] or "not specified"
        extracted = extracted.model_copy(update={
            "body_location": extracted.body_location or area,
            "body_region": extracted.body_region or area,
            "condition_area": extracted.condition_area or ConditionArea.MSK,
        })
        text, menu = red_flag_prompt(extracted, None)
        sr["red_flag_asked_at"] = datetime.now(timezone.utc).isoformat()
        _save(conversation, context, sr, RED_FLAGS)
        return Step("reply", text, menu, extracted=extracted, stage="safety_screen")

    if step == RED_FLAGS:
        verdict, items = parse_red_flags(user_text, extracted)
        if verdict == "positive":
            sr["red_flags"] = sorted(items)
            _save(conversation, context, sr, None)
            return Step("red_flag", RED_FLAG_STOP, stop_buttons(), extracted=extracted,
                        safety=red_flag_result(items, extracted))
        if verdict == "none":
            sr["red_flags"] = []
            sr["red_flag_screen"] = "negative"
            extracted = clear_protocol_screen(extracted)
            questions = condition_questions(extracted)
            if not questions:
                return _with_extracted(_outcome(patient, conversation, context, sr, extracted), extracted)
            area = (extracted.body_location or extracted.body_region or "").strip()
            lead = f"Thanks. A few quick questions about your {area}:\n\n" if area else "Thanks. A few quick questions:\n\n"
            return _with_extracted(_question_step(conversation, context, sr, questions, 0, lead=lead), extracted)
        text, menu = red_flag_prompt(extracted, None)
        ask = ("Which one? Reply with the number(s) that apply, for example *2*, or 7 if none of them."
               if verdict == "which" else
               "I want to be sure I've understood. Please reply with the number(s) that apply, or 7 if none of these.")
        _save(conversation, context, sr, RED_FLAGS)
        return Step("reply", f"{ask}\n\n{text.split(chr(10) + chr(10), 1)[1]}", menu, stage="safety_screen")

    if step == QUESTIONS:
        keys = list(sr.get("question_keys") or [])
        index = int(sr.get("question_index") or 0)
        questions = [q for q in condition_questions_all(extracted) if q["key"] in keys]
        questions.sort(key=lambda q: keys.index(q["key"]))
        if index >= len(questions):
            return _with_extracted(_outcome(patient, conversation, context, sr, extracted), extracted)
        question = questions[index]
        key = question["key"]
        value: str | None
        score = None
        if key == "onset":
            value = _onset_bucket(user_text)
        elif key == "pain":
            value, score = _pain(user_text)
        else:
            value = _yes_no(user_text, allow=tuple(b[0] for b in question["buttons"]))
        retries = dict(sr.get("question_retries") or {})
        if value is None and retries.get(key, 0) < 1 and len(_norm(user_text)) <= 60:
            retries[key] = retries.get(key, 0) + 1
            sr["question_retries"] = retries
            return _question_step(conversation, context, sr, questions, index, lead="Sorry, I didn't catch that. ")
        answers = dict(sr.get("answers") or {})
        answers[key] = value or _norm(user_text)[:80]
        if score is not None:
            answers["pain_score"] = score
        sr["answers"] = answers
        extracted = apply_answer(extracted, key, value or "", score, user_text, question.get("limb"))
        if index + 1 < len(questions):
            return _with_extracted(_question_step(conversation, context, sr, questions, index + 1), extracted)
        return _with_extracted(_outcome(patient, conversation, context, sr, extracted), extracted)

    if step == TIMING:
        return timing_turn(conversation, context, sr, user_text, extracted)

    if step == CARE_TEAM:
        if re.search(r"\b(try again|book|search again|find|look again|another day|other day)\b", _norm(user_text)):
            if sr.get("outcome") == "urgent":
                window = timing.soon_window()
                sr["window"] = window.as_dict()
                _save(conversation, context, sr, BOOKING)
                return Step("outcome", extracted=extracted, urgent=True, stage="matching", window=window.as_dict())
            return _timing_step(conversation, context, sr, extracted=extracted)
        return Step("reply", CARE_TEAM_WAITING, stage="summary")
    return None


def condition_questions_all(extracted: ExtractedTriage) -> list[dict]:
    """Every question this patient could be asked (answers already given don't remove one mid-way)."""
    blank = extracted.model_copy(update={
        "onset": None, "duration": None, "severity": None, "radiation": None,
        "functional_limitations": [], "seen_clinician": None, "previous_treatment": [],
    })
    return condition_questions(blank)


def _with_extracted(step: Step, extracted: ExtractedTriage) -> Step:
    if step.extracted is None:
        step.extracted = extracted
    return step


CARE_TEAM_HANDOFF = (
    "I couldn't find a physiotherapist who fits your needs and is free when you need one, so I've passed "
    "your details to our care team. Someone will contact you on this WhatsApp number to arrange your consultation.\n\n"
    "If your symptoms get worse, or you notice any of the warning signs I asked about, get medical care "
    "straight away or call 112."
)
CARE_TEAM_WAITING = (
    "Our care team has your details and will contact you on this number to arrange your consultation. "
    "Reply *TRY AGAIN* if you'd like me to look for a physiotherapist again, or *CALL ME* to ask for a call."
)


# ---------------------------------------------------------------------------------------------
# 4. The summary the physio reads before the consultation
# ---------------------------------------------------------------------------------------------

_LANGUAGE_NAMES = {"en": "English", "pcm": "Pidgin", "yo": "Yorùbá", "ig": "Igbo", "ha": "Hausa"}


def physio_summary(patient: Patient, extracted: ExtractedTriage, sr: dict, *, appointment: str | None = None) -> str:
    name = (patient.name or "").strip()
    parts = name.split()
    display = f"{parts[0][:1]}. {parts[-1]}" if len(parts) > 1 else (name or "Patient")
    answers = sr.get("answers") or {}
    issue = ", ".join(filter(None, [
        (extracted.body_location or extracted.body_region or extracted.main_complaint or "").strip().capitalize() or None,
        extracted.duration or extracted.onset,
    ])) or "Not stated"
    pain = answers.get("pain")
    if answers.get("pain_score") is not None:
        pain = f"{answers['pain_score']}/10 ({pain})"
    elif not pain and extracted.severity:
        pain = f"{extracted.severity}/10"
    impact = {"yes": "Affects sleep, work or daily activities", "sometimes": "Sometimes affects sleep, work or daily activities",
              "no": "No effect on sleep, work or daily activities"}.get(str(answers.get("impact") or ""), None)
    if impact is None and extracted.functional_limitations:
        impact = "; ".join(extracted.functional_limitations)
    lines = [
        f"New self-referral — {display}{f', {patient.age}' if patient.age else ''}",
        "Triage outcome: " + ("Urgent clinician review (earliest available)" if sr.get("outcome") == "urgent" else "Routine MSK physiotherapy"),
        f"Presenting issue: {issue}",
        f"Pain today: {str(pain).capitalize() if pain else 'Not stated'}",
        f"Red-flag screen: {'Negative' if sr.get('red_flag_screen') == 'negative' else 'Not completed'}",
    ]
    if answers.get("radiation"):
        lines.append(f"Travels into the limb: {answers['radiation']}")
    lines.append(f"Functional impact: {impact or 'Not stated'}")
    if answers.get("seen"):
        lines.append(f"Seen a doctor or physio before: {answers['seen']}")
    lines.append(f"Preferred language: {_LANGUAGE_NAMES.get(patient.preferred_language or '', 'English')}")
    if patient.location:
        lines.append(f"Area: {patient.location}")
    if appointment:
        lines.append(f"Consultation: {appointment}")
    return "\n".join(lines)
