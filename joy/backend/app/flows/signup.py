"""Offer the WhatsApp sign-up form and save what the patient fills in.

The form (app/flows/signup_flow.py) is offered with the first-chat welcome and whenever a patient
types "sign up". It never blocks typing: a patient can ignore it and just tell Joy what's wrong.

When the form comes back (an ``nfm_reply`` webhook), the answers are saved on Joy's patient
record so Joy doesn't ask for them again, then sent to Rehabify:
  - ``patient_update_profile``: name, gender, date of birth, email, state/city/area, conditions
  - ``patient_record_consents``: the current Terms and Privacy versions the patient agreed to
If Rehabify can't be reached the answers wait in ``Patient.signup_pending_rh`` and are retried
after the patient's next message (``sync_pending_signup``).
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from datetime import date, datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.config import get_settings
from app.flows.signup_flow import HEALTH_CONDITIONS, OTHER_AREA, signup_flow_message
from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.types import AuditKind, Persona, PatientPhase, TurnResult

logger = logging.getLogger(__name__)

FLOW_TOKEN_PREFIX = "signup:"
_LAGOS = ZoneInfo("Africa/Lagos")
_EMAIL_RE = re.compile(r"^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$")
_GENDERS = {"female", "male", "other", "prefer_not_to_say"}
_CONDITION_TITLES = {row["id"]: row["title"] for row in HEALTH_CONDITIONS}
# States whose home-visit city has a different name from the state
_STATE_CITY = {"Lagos": "Lagos", "FCT": "Abuja"}

SIGNUP_REQUEST_RE = re.compile(
    r"^\s*(?:please\s+)?(?:sign\s*up|signup|register|join(?:\s+rehabify)?|get\s+started|"
    r"create\s+(?:my\s+|an\s+)?account|(?:update|change|edit)\s+my\s+(?:details|profile|info(?:rmation)?))"
    r"\s*(?:please)?\s*[.!]?\s*$",
    re.IGNORECASE,
)

WELCOME_WITH_FORM = (
    "Hello 👋 Welcome to Rehabify.\n\n"
    "Tap *Get started* to set up your profile in about a minute: your name, age and where you are, "
    "so I don't have to ask later.\n\n"
    "Or just tell me in your own words what's going on today: what's bothering you, which part of "
    "your body, and how long you've had it. You can type or send a voice note.\n\n"
    "Messaging for someone else? Just tell me who it's for."
)
SIGNUP_OFFER = (
    "Tap *Get started* to fill in your details. It takes about a minute, and you can change them "
    "any time by typing *update my details*."
)
WELCOME_WITHOUT_FORM = (
    "Hello 👋 Welcome to Rehabify.\n\n"
    "Could you tell me what’s going on today?\n\n"
    "You can tell me:\n\n"
    "• what’s bothering you\n"
    "• which part of your body is affected\n"
    "• how long you’ve had it\n"
    "• whether you’ve seen anyone about it\n"
    "• anything you’ve already tried\n\n"
    "Just tell me in your own words. There’s no need to fill out a form.\n\n"
    "Messaging for someone else? Just tell me who it's for."
)
FORM_UNAVAILABLE = (
    "The sign-up form isn't available on WhatsApp just yet. You don't need it: tell me what's going "
    "on in your own words, and I'll take your details as we go."
)


def text_without_form(text: str) -> str:
    """What to send instead when Meta refuses the form message: never point to a missing button."""
    if text == WELCOME_WITH_FORM:
        return WELCOME_WITHOUT_FORM
    if "Get started" in text:
        return FORM_UNAVAILABLE
    return text


def _digits(phone: str) -> str:
    return "".join(ch for ch in phone or "" if ch.isdigit())


def signup_form_enabled(phone: str | None = None) -> bool:
    """A form is set up, and (for an unpublished draft) this number is one of the testers."""
    settings = get_settings()
    if not settings.whatsapp_signup_flow_id:
        return False
    if settings.whatsapp_signup_flow_mode != "draft":
        return True
    testers = {_digits(p) for p in settings.whatsapp_signup_flow_testers.split(",") if _digits(p)}
    return bool(phone) and _digits(phone) in testers


def signup_interactive(conversation_id: Any, phone: str | None = None) -> dict | None:
    """The "Get started" form message for this conversation, or None when no form is offered."""
    settings = get_settings()
    if not signup_form_enabled(phone):
        return None
    return signup_flow_message(
        settings.whatsapp_signup_flow_id,
        f"{FLOW_TOKEN_PREFIX}{conversation_id}",
        mode=settings.whatsapp_signup_flow_mode,
    )


def is_signup_request(user_text: str) -> bool:
    return bool(SIGNUP_REQUEST_RE.fullmatch(user_text or ""))


# ---------------------------------------------------------------------------------------------
# Reading the answers
# ---------------------------------------------------------------------------------------------


def _text(value: Any, limit: int) -> str:
    return " ".join(str(value).split())[:limit] if isinstance(value, (str, int, float)) else ""


def _tidy_name(value: Any) -> str:
    name = _text(value, 60).strip(" .,-")
    # "ada" or "ADA" → "Ada"; leave mixed case ("McDonald", "de Souza") as typed
    if name and (name.islower() or name.isupper()):
        name = " ".join(part[:1].upper() + part[1:].lower() for part in name.split(" "))
    return name


def _date_of_birth(value: Any, today: date) -> date | None:
    raw = _text(value, 32)
    parsed: date | None = None
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", raw):
        try:
            parsed = date.fromisoformat(raw)
        except ValueError:
            parsed = None
    elif re.fullmatch(r"\d{10,13}", raw):  # older Flow versions send epoch milliseconds
        try:
            parsed = datetime.fromtimestamp(int(raw) / 1000, tz=_LAGOS).date()
        except (OverflowError, OSError, ValueError):
            parsed = None
    if parsed is None or parsed > today or parsed.year < today.year - 120:
        return None
    return parsed


def _age(born: date, today: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value if isinstance(item, (str, int))]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.strip("[]").replace('"', "").split(",") if part.strip()]
    return []


def _accepted(value: Any) -> bool:
    return value is True or str(value).strip().casefold() in {"true", "yes", "1"}


def parse_answers(response: dict, *, today: date | None = None) -> dict[str, Any]:
    """Clean, bounded answers from the form's response_json (unknown keys are ignored)."""
    today = today or datetime.now(_LAGOS).date()
    born = _date_of_birth(response.get("date_of_birth"), today)
    email = _text(response.get("email"), 120).casefold()
    picked = next(
        (_text(v, 120) for k, v in response.items() if k.startswith("area_") and _text(v, 120)), ""
    )
    conditions = [c for c in _list(response.get("health_conditions")) if c in _CONDITION_TITLES]
    if len(conditions) > 1:
        conditions = [c for c in conditions if c != "none"]
    gender = _text(response.get("gender"), 32)
    return {
        "first_name": _tidy_name(response.get("first_name")),
        "last_name": _tidy_name(response.get("last_name")),
        "gender": gender if gender in _GENDERS else None,
        "date_of_birth": born.isoformat() if born else None,
        "age": _age(born, today) if born else None,
        "email": email if _EMAIL_RE.fullmatch(email) and not email.endswith(".invalid") else None,
        "state": _text(response.get("state"), 40) or None,
        "area_pick": picked or None,
        "town": _text(response.get("town"), 80).strip(" .,") or None,
        "conditions": [c for c in conditions if c != "none"],
        "no_conditions": conditions == ["none"],
        "other_conditions": _text(response.get("other_conditions"), 600) or None,
        "accepted_terms": _accepted(response.get("accept_terms")),
    }


def _cities_in_state(state: str, cities: list[dict]) -> list[dict]:
    return [c for c in cities if str(c.get("state") or "") == state]


def resolve_location(answers: dict, cities: list[dict]) -> tuple[str | None, str | None]:
    """(city, area) in RH travel-zone terms, from the area picked or the town typed."""
    state = answers.get("state")
    town = answers.get("town")
    pick = answers.get("area_pick")
    if pick and "|" in pick:
        area, city = pick.split("|", 1)
        if area == OTHER_AREA:
            return city, town  # "Other area in Lagos": the town typed, if any, is the area
        return city, area
    if not state:
        return None, None
    in_state = _cities_in_state(state, cities)
    if town and in_state:
        from app.booking.booking_flow import _resolve_place

        places, was_town = _resolve_place(town, in_state)
        if was_town and len(places) == 1:
            return str(places[0].get("city")), town
    if len(in_state) == 1:
        return str(in_state[0].get("city")), town
    if not in_state and not cities:  # Rehabify unreachable: the zone city names are predictable
        return _STATE_CITY.get(state, f"{state} State" if state != "Oyo" else None), town
    return None, town


def _health_titles(answers: dict) -> list[str]:
    return [_CONDITION_TITLES[c] for c in answers.get("conditions") or [] if c in _CONDITION_TITLES and c != "other"]


# ---------------------------------------------------------------------------------------------
# Saving the answers
# ---------------------------------------------------------------------------------------------


def _patient_for_phone(session: Session, phone: str) -> Patient | None:
    from app.identity.resolver import resolve

    identity = resolve(session, phone)
    if identity is None:
        patient = Patient(phone_e164=phone)
        session.add(patient)
        session.flush()
        return patient
    if identity.persona != Persona.PATIENT:
        return None
    return session.get(Patient, identity.person_id)


def _service_cities(patient: Patient) -> list[dict]:
    try:
        result = configured_rh_client().service_areas(
            actor=RHActor(persona="patient", sender_phone=patient.phone_e164)
        )
    except RHIntegrationError:
        return []
    return [c for c in result.get("cities") or [] if isinstance(c, dict)]


def rh_payload(answers: dict, city: str | None, area: str | None) -> dict[str, Any]:
    payload = {
        "first_name": answers.get("first_name") or None,
        "last_name": answers.get("last_name") or None,
        "gender": answers.get("gender"),
        "date_of_birth": answers.get("date_of_birth"),
        "email": answers.get("email"),
        "state": answers.get("state"),
        "city": city,
        "area": area,
        "health_conditions": _health_titles(answers),
        "other_conditions": answers.get("other_conditions"),
    }
    return {
        key: value for key, value in payload.items() if value not in (None, "", [])
    } | {"accepted_terms": bool(answers.get("accepted_terms"))}


def _digest(data: dict) -> str:
    return hashlib.sha256(json.dumps(data, sort_keys=True, default=str).encode()).hexdigest()[:16]


def _sync_to_rh(session: Session, patient: Patient, payload: dict, conversation_id: Any) -> bool:
    """Send the answers and the consent to Rehabify. True when both were saved."""
    from app.booking.booking_flow import _rh_patient_id

    rh_patient_id = _rh_patient_id(session, patient)
    if not rh_patient_id:
        return False
    client = configured_rh_client()
    actor = RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id)
    profile = {key: value for key, value in payload.items() if key != "accepted_terms"}
    try:
        client.operational_mutation(
            "patient_update_profile", actor=actor, data={"patient_id": rh_patient_id, **profile},
            idempotency_key=f"joy-signup-profile-{patient.id}-{_digest(profile)}",
        )
        if payload.get("accepted_terms"):
            needed = client.operational_query(
                "patient_consent_status", actor=actor, data={"patient_id": rh_patient_id}
            ).get("consents_required") or []
            accepted = {
                str(doc["policy_id"]): str(doc["version"])
                for doc in needed if isinstance(doc, dict) and doc.get("policy_id") and doc.get("version")
            }
            if accepted:
                client.operational_mutation(
                    "patient_record_consents", actor=actor,
                    data={"patient_id": rh_patient_id, "accepted": accepted, "conversation_id": f"signup-form:{conversation_id}"},
                    idempotency_key=f"joy-signup-consents-{patient.id}-{'-'.join(sorted(accepted.values()))}",
                )
    except RHIntegrationError as error:
        logger.warning("joy_signup_rh_sync_failed code=%s", error.code)
        return False
    return True


def sync_pending_signup(session: Session, phone: str) -> bool:
    """Retry saving form answers that couldn't reach Rehabify earlier. Never raises."""
    try:
        patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone))
        if patient is None or not patient.signup_pending_rh:
            return False
        if _sync_to_rh(session, patient, dict(patient.signup_pending_rh), "retry"):
            patient.signup_pending_rh = None
            session.flush()
            return True
    except Exception:  # A retry must never break the reply that triggered it
        logger.warning("joy_signup_retry_failed", exc_info=True)
    return False


def _conversation(session: Session, patient: Patient) -> Conversation | None:
    return session.scalar(select(Conversation).where(
        Conversation.person_id == patient.id, Conversation.persona == Persona.PATIENT,
    ))


def _last_joy_question(session: Session, conversation: Conversation | None) -> str | None:
    """Joy's last real question before the form, to carry on from it (not the welcome or offer)."""
    if conversation is None:
        return None
    recent = session.scalars(
        select(Message).where(Message.conversation_id == conversation.id, Message.role == "joy")
        .order_by(Message.created_at.desc()).limit(4)
    ).all()
    for message in recent:
        text = message.text or ""
        if text.startswith(("Tap *Get started*", "Thanks, ")):
            continue  # the form offer, or the reply to an earlier form
        if "Welcome to Rehabify" in text or len(text) > 700:
            return None
        return text or None
    return None


def apply_signup_response(session: Session, phone: str, response: dict, wa_message_id: str | None = None) -> TurnResult:
    """Save a completed sign-up form and reply. Always returns a reply for the patient."""
    from app.conversation.state_manager import load, save_turn
    from app.models.types import Identity
    from app.conversation.orchestrator import has_narrative

    patient = _patient_for_phone(session, phone)
    if patient is None:
        return TurnResult(reply_text="Thanks, your answers came through.", language="en", phase=PatientPhase.FIRST_CONTACT)
    answers = parse_answers(response)
    cities = _service_cities(patient)
    city, area = resolve_location(answers, cities)

    name = " ".join(part for part in (answers["first_name"], answers["last_name"]) if part)
    if name:
        patient.name = name
    for attr in ("gender", "email", "state"):
        if answers.get(attr):
            setattr(patient, attr, answers[attr])
    if answers.get("date_of_birth"):
        patient.date_of_birth = date.fromisoformat(answers["date_of_birth"])
        patient.age = answers["age"]
    if city:
        same_city = patient.city == city
        patient.city = city
        patient.area = area or (patient.area if same_city else None)
        patient.location = f"{patient.area}, {city}" if patient.area else None
    patient.signup_completed_at = datetime.now(timezone.utc)
    session.flush()

    identity = Identity(persona=Persona.PATIENT, person_id=patient.id, phone_e164=phone)
    state = load(session, identity)
    payload = rh_payload(answers, city, area)
    saved = _sync_to_rh(session, patient, payload, state.conversation_id)
    patient.signup_pending_rh = None if saved else payload
    append(
        session, kind=AuditKind.IDENTITY, actor_phone=phone, person_id=patient.id,
        payload={
            "decision": "whatsapp_signup_form_completed",
            "fields": sorted(k for k in payload if k not in {"health_conditions", "other_conditions"}),
            "terms_accepted": bool(answers.get("accepted_terms")),
            "saved_in_rehabify": saved,
        },
    )

    first = answers["first_name"] or "there"
    conversation = _conversation(session, patient)
    carry_on = _last_joy_question(session, conversation)
    if has_narrative(state.extracted) or carry_on:
        reply = f"Thanks, {first}. Your details are saved, so I won't ask for them again."
        reply += f"\n\nLet's carry on. {carry_on}" if carry_on else "\n\nLet's carry on where we left off."
    else:
        where = f" I have you in {area + ', ' if area else ''}{city}." if city else ""
        reply = (
            f"Thanks, {first}. Your Rehabify profile is set up.{where}\n\n"
            "Now, tell me what's going on: what's bothering you, which part of your body is affected, "
            "and how long you've had it. You can type or send a voice note."
        )
    save_turn(
        session, state, "[Sign-up form completed]", reply, state.extracted, state.phase,
        state.last_known_language or "en", wa_message_id,
    )
    return TurnResult(reply_text=reply, language=state.last_known_language or "en", phase=state.phase, extracted=state.extracted)


def signup_offer(session: Session, identity) -> tuple[str, dict] | None:
    """The reply and form button for "sign up"; None when no form is configured."""
    if not signup_form_enabled(identity.phone_e164) or identity.persona != Persona.PATIENT:
        return None
    conversation = session.scalar(select(Conversation).where(
        Conversation.person_id == identity.person_id, Conversation.persona == identity.persona,
    ))
    interactive = signup_interactive(conversation.id if conversation is not None else identity.person_id, identity.phone_e164)
    patient = session.get(Patient, identity.person_id)
    if patient is not None and patient.signup_completed_at is not None:
        return "Tap *Get started* to update your details. Anything you change replaces what I had.", interactive
    return SIGNUP_OFFER, interactive
