"""Questions about an exercise in the physio's plan: answered from the plan, or sent to the physio.

"How do I do the bridge?" or "how many reps for exercise 2?" is answered from the plan the
physio sent: the dose and frequency, the exercise library's steps, the physio's own note and the
exercise's picture. Anything else about an exercise ("can I do it twice a day?", "exercise 2
hurts my knee") goes to the physio as a message in their Rehabify Messages (operation
patient_ask_physio), and their reply comes back here on WhatsApp. Joy never writes exercise
advice of its own.

Only messages that clearly mention an exercise get here: "exercise", "reps", "#2"... or, within
3 days of the plan or a reminder being shown, the name of one of the plan's exercises.
"""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.exercises.programme import _clean, _dose, _rh_patient, exercise_items, fetch_programmes, image_caption
from app.models.patient import Patient
from app.models.types import AuditKind

logger = logging.getLogger(__name__)

_GATE_RE = re.compile(r"\b(exercises?|stretch\w*|reps?|sets?|routine|workout)\b|#\s?\d|\bnumber\s+\d", re.I)
_QUESTION_RE = re.compile(r"\?|^\s*(how|what|which|can|could|should|is|are|do|does|why|when|may|am i)\b", re.I)
_SYMPTOM_RE = re.compile(r"\b(hurt\w*|pain\w*|ache\w*|sore|swell\w*|worse|numb\w*|tingl\w*|click\w*|pop\w*)\b", re.I)
_HOW_RE = re.compile(
    r"\bhow (do|should|can|would|will) i (do|perform|start)\b|\bhow (to|do you) do\b|\bshow me\b"
    r"|\bwhat('?s| is) (the |this |that )?(exercise|it)\b|\bexplain\b|\b(demo|video|picture|steps|technique)\b",
    re.I,
)
_DOSE_RE = re.compile(r"\bhow (many|much|long|often)\b|\b(reps?|sets?|times a (day|week)|per day|hold for)\b", re.I)
_NUMBER_RE = re.compile(r"(?:exercise|number|no\.?|#)\s*(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:exercise|one)\b", re.I)
_ORDINAL_RE = re.compile(r"\b(first|second|third|fourth|fifth|sixth|last)\s+(exercise|one)\b", re.I)
_ORDINALS = {"first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6}
# Words in exercise names that don't identify one exercise
_GENERIC = {"exercise", "exercises", "stretch", "stretches", "left", "right", "with", "your", "side", "lying",
            "standing", "seated", "sitting", "both", "single", "double", "slow", "gentle", "active", "assisted"}
_RECENT = timedelta(days=3)
_SAFETY_LINE = (
    "If an exercise hurts more than a little, stop it for now. Seek medical care if the pain is severe "
    "or you feel unwell."
)


def _name_words(item: dict) -> set[str]:
    words = re.findall(r"[a-z]{4,}", (_clean(item.get("name"), 80) or "").casefold())
    return {w for w in words if w not in _GENERIC}


def _pick(exercises: list[dict], text: str) -> tuple[int, dict] | None:
    """The exercise the patient means: by number, "the first one", or a word of its name."""
    match = _NUMBER_RE.search(text)
    number = int(match.group(1) or match.group(2)) if match else None
    ordinal = _ORDINAL_RE.search(text)
    if number is None and ordinal:
        word = ordinal.group(1).casefold()
        number = len(exercises) if word == "last" else _ORDINALS.get(word)
    if number is not None:
        return (number, exercises[number - 1]) if 1 <= number <= len(exercises) else None
    said = set(re.findall(r"[a-z]{4,}", text.casefold()))
    scored = [(len(_name_words(item) & said), n, item) for n, item in enumerate(exercises, 1)]
    best = max(scored, default=(0, 0, None), key=lambda row: row[0])
    if best[0] == 0 or sum(1 for row in scored if row[0] == best[0]) > 1:
        return None
    return best[1], best[2]


def exercise_question_turn(session: Session, patient: Patient, user_text: str) -> tuple[str, list[dict]] | None:
    """(reply, messages to send after it), or None when this isn't about the physio's exercises."""
    text = " ".join((user_text or "").split())
    if not text or len(text) > 300:
        return None
    asks = bool(_QUESTION_RE.search(text))
    symptom = bool(_SYMPTOM_RE.search(text))
    if not asks and not symptom:
        return None
    prompted = patient.exercise_prompted_at
    recent = prompted is not None and datetime.now(timezone.utc) - (prompted if prompted.tzinfo else prompted.replace(tzinfo=timezone.utc)) < _RECENT
    gated = bool(_GATE_RE.search(text))
    if not gated and not recent:
        return None
    rh_patient_id = _rh_patient(session, patient)
    data = fetch_programmes(patient, rh_patient_id) if rh_patient_id else None
    programmes = [p for p in (data or {}).get("programmes") or [] if isinstance(p, dict)]
    exercises = exercise_items(programmes[0]) if programmes else []
    if not exercises:
        return None
    picked = _pick(exercises, text)
    if picked is None and not gated:
        return None  # a recent plan, but nothing in the message points to an exercise

    if picked is not None and not symptom:
        number, item = picked
        name = _clean(item.get("name"), 80) or f"Exercise {number}"
        if _HOW_RE.search(text) and (item.get("steps") or _clean(item.get("note"), 240) or item.get("image_url")):
            caption = image_caption(number, item)
            image = item.get("image_url")
            if isinstance(image, str) and image.startswith("https://"):
                return f"Here's how to do *{name}* 👇", [{"image_url": image, "caption": caption}]
            return caption, []
        if _DOSE_RE.search(text) and not _HOW_RE.search(text):
            detail = " · ".join(x for x in (_dose(item), _clean(item.get("frequency"), 80)) if x)
            note = _clean(item.get("note"), 240)
            if detail or note:
                lines = [f"*{number}. {name}*"] + ([detail] if detail else []) + ([f"💬 Your physio: _{note}_"] if note else [])
                return "\n".join(lines) + "\n\nThat's what your physio set. To change it, ask them first.", []

    return _ask_physio(session, patient, rh_patient_id, text, picked, symptom), []


def _ask_physio(session: Session, patient: Patient, rh_patient_id: str, text: str, picked, symptom: bool) -> str:
    from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client

    exercise = (_clean(picked[1].get("name"), 80) or f"Exercise {picked[0]}") if picked else ""
    try:
        result = configured_rh_client().operational_mutation(
            "patient_ask_physio",
            actor=RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id),
            data={"patient_id": rh_patient_id, "question": text, **({"exercise": exercise} if exercise else {})},
            idempotency_key=f"joy-ask-physio-{patient.id}-{hashlib.sha256(text.encode()).hexdigest()[:16]}",
        )
    except RHIntegrationError as error:
        logger.warning("joy_ask_physio_failed code=%s", error.code)
        result = {}
    append(session, kind=AuditKind.TRIAGE, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "exercise_question_to_physio", "sent": bool(result.get("sent"))})
    safety = f"\n\n{_SAFETY_LINE}" if symptom else ""
    if result.get("sent"):
        who = _clean(result.get("physio_name"), 60) or "your physio"
        return (
            f"That's one for your physio, so I've sent your question to {who}"
            f"{f' (about {exercise})' if exercise else ''}. Their reply will come to you here on WhatsApp.{safety}"
        )
    return (
        "I couldn't send that to your physio just now. Please try again later, or type *CALL ME* and our "
        f"care team will help.{safety}"
    )
