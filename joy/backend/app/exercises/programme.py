"""The physio's exercise programme on WhatsApp.

Everything shown comes from the programme the physiotherapist sent in Rehabify (operation
patient_programme): names, doses and the physio's own notes. Joy never writes exercise
instructions or changes a dose. Questions about how to do an exercise go to the physio.

Patients can:
  - ask "my exercises" to see the plan
  - reply DONE (or DONE 2, or DONE pain 6) to log today's session (patient_log_exercise)
  - get a daily reminder at a time they choose ("remind me at 7am"), when their plan includes
    Joy reminders (Flex Max: patient_recovery_plan.joy_reminders_allowed)
  - reply PAUSE or STOP to stop reminders, START to turn them back on
"""

from __future__ import annotations

import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.integrations.rh_client import RHActor, RHIntegrationError, configured_rh_client
from app.models.patient import Patient
from app.models.types import AuditKind

logger = logging.getLogger(__name__)

LAGOS = ZoneInfo("Africa/Lagos")
DEFAULT_TIME = "18:00"
REMINDERS_ON, REMINDERS_PAUSED = "on", "paused"
# A DONE reply counts as an exercise log for this long after Joy showed the plan or a reminder
_DONE_WINDOW = timedelta(hours=20)
_MAX_TEXT = 3000

SHOW_RE = re.compile(
    r"^\s*(?:show\s+)?(?:me\s+)?(?:my\s+)?(?:home\s+)?(?:exercises?|exercise\s+(?:plan|programme|program|list)|"
    r"programme|program|rehab\s+plan|care\s+plan\s+exercises)(?:\s+please)?\s*[?.!]*\s*$",
    re.IGNORECASE,
)
# "What exercises should I do?", "send my exercise plan": the physio's plan, never advice from Joy
ASK_RE = re.compile(
    r"\b(?:my|which|what|send|show)\b[^.?!]{0,30}\b(?:exercises|exercise\s+(?:plan|programme|program|list)|programme|program)\b",
    re.IGNORECASE,
)


# A message about symptoms goes to triage, even when it mentions the exercises
_SYMPTOM_RE = re.compile(r"\b(?:hurt\w*|pain\w*|ache\w*|sore|swell\w*|worse|numb\w*|tingl\w*|injur\w*|bleed\w*|dizz\w*)\b", re.IGNORECASE)


def asks_for_programme(user_text: str) -> bool:
    text = user_text or ""
    if SHOW_RE.fullmatch(text):
        return True
    return len(text) <= 80 and bool(ASK_RE.search(text)) and not _SYMPTOM_RE.search(text)


DONE_RE = re.compile(
    r"^\s*(?:done|finished|completed|did\s+(?:it|them|my\s+exercises))\b(?:\s*(?:exercise\s*)?#?(?P<item>\d{1,2})\b)?"
    r"(?:[\s,.-]*(?:pain|it\s+hurts?)\s*(?:was|is|of|at)?\s*(?P<pain>\d{1,2})(?:\s*/\s*10)?)?\s*[.!✅👍]*\s*$",
    re.IGNORECASE,
)
PAUSE_RE = re.compile(
    r"^\s*(?:stop|pause|unsubscribe|(?:stop|pause|no\s+more|turn\s+off)\s+(?:the\s+|my\s+)?(?:exercise\s+)?reminders?)\s*[.!]*\s*$",
    re.IGNORECASE,
)
START_RE = re.compile(
    r"^\s*(?:start|resume|(?:start|resume|turn\s+on)\s+(?:the\s+|my\s+)?(?:exercise\s+)?reminders?|remind\s+me(?:\s+daily|\s+every\s*day)?)\s*[.!]*\s*$",
    re.IGNORECASE,
)
REMIND_AT_RE = re.compile(
    r"^\s*(?:please\s+)?(?:remind\s+me|reminders?|set\s+(?:my\s+)?reminder)\s+(?:daily\s+|every\s*day\s+)?(?:at|for|to)?\s*"
    r"(?P<hour>\d{1,2})(?:[:.](?P<minute>\d{2}))?\s*(?P<ampm>a\.?m\.?|p\.?m\.?)?\s*(?:every\s*day|daily)?\s*[.!]*\s*$",
    re.IGNORECASE,
)


def _actor(patient: Patient, rh_patient_id: str) -> RHActor:
    return RHActor(persona="patient", sender_phone=patient.phone_e164, rh_user_id=rh_patient_id)


def _rh_patient(session: Session, patient: Patient) -> str | None:
    from app.booking.booking_flow import _rh_patient_id

    return _rh_patient_id(session, patient)


def fetch_programmes(patient: Patient, rh_patient_id: str) -> dict | None:
    try:
        return configured_rh_client().operational_query(
            "patient_programme", actor=_actor(patient, rh_patient_id), data={"patient_id": rh_patient_id}
        )
    except RHIntegrationError as error:
        logger.warning("joy_programme_fetch_failed code=%s", error.code)
        return None


def reminders_allowed(patient: Patient, rh_patient_id: str) -> bool | None:
    try:
        plan = configured_rh_client().operational_query(
            "patient_recovery_plan", actor=_actor(patient, rh_patient_id), data={"patient_id": rh_patient_id}
        )
    except RHIntegrationError:
        return None
    return bool(plan.get("joy_reminders_allowed"))


def _dose(item: dict) -> str:
    sets, reps, hold = item.get("sets"), item.get("reps"), item.get("hold_seconds")
    parts = []
    if isinstance(sets, int) and isinstance(reps, int):
        parts.append(f"{sets} sets × {reps}")
    elif isinstance(reps, int):
        parts.append(f"{reps} reps")
    elif isinstance(sets, int):
        parts.append(f"{sets} sets")
    if isinstance(hold, int) and hold > 0:
        parts.append(f"hold {hold} sec")
    return " · ".join(parts)


def _clean(text: Any, limit: int) -> str:
    # WhatsApp formatting characters in the physio's text would change how it looks
    value = " ".join(str(text).split())[:limit] if isinstance(text, str) else ""
    return value.replace("*", "").replace("_", " ").replace("~", "").strip()


def exercise_items(programme: dict) -> list[dict]:
    return [i for i in programme.get("items") or [] if isinstance(i, dict) and i.get("kind") != "education"]


def _side(item: dict) -> str:
    return {"L": " (left)", "R": " (right)"}.get(str(item.get("side") or ""), "")


def _byline(programme: dict) -> str:
    sender = _clean(programme.get("sender_name"), 60) or "your physiotherapist"
    title = _clean(programme.get("title"), 80)
    return f"_From {sender}{f' · {title}' if title else ''}_"


def programme_text(programme: dict, care_plan_url: str | None, *, watch_url: str | None = None) -> str:
    """The plan as a WhatsApp card: one block per exercise, the physio's words only."""
    lines = ["🏋️ *Your exercise plan*", _byline(programme)]
    exercises = exercise_items(programme)
    for number, item in enumerate(exercises, 1):
        lines += ["", f"*{number}. {_clean(item.get('name'), 80) or 'Exercise'}*{_side(item)}"]
        dose = _dose(item)
        if dose:
            lines.append(dose)
        frequency = _clean(item.get("frequency"), 80)
        if frequency:
            lines.append(f"🕒 {frequency}")
        note = _clean(item.get("note"), 240)
        if note:
            lines.append(f"💬 _{note}_")
    reading = [i for i in programme.get("items") or [] if isinstance(i, dict) and i.get("kind") == "education"]
    extras = []
    if reading:
        extras.append("📖 *To read:* " + "; ".join(_clean(i.get("name"), 60) for i in reading[:5]))
    goals = [g for g in (programme.get("goals") or []) if isinstance(g, str) and g.strip()]
    if goals:
        extras.append("🎯 *Your goals:* " + "; ".join(_clean(g, 80) for g in goals[:4]))
    done = {i for i in programme.get("done_today") or [] if isinstance(i, int)}
    done_count = sum(1 for item in exercises if item.get("index") in done)
    if done_count:
        extras.append(f"✅ *Today:* {done_count} of {len(exercises)} done")
    if extras:
        lines += [""] + extras
    if watch_url:
        lines += ["", f"▶️ Watch them move in 3D: {watch_url}", "🔒 PIN: the last 4 digits of this WhatsApp number"]
    elif care_plan_url:
        lines += ["", f"▶️ Watch them move: {care_plan_url}"]
    text = "\n".join(lines)
    return text if len(text) <= _MAX_TEXT else text[: _MAX_TEXT - 1] + "…"


def image_caption(number: int, item: dict) -> str:
    """The caption under an exercise's picture: dose, the library's steps, the physio's note."""
    lines = [f"*{number}. {_clean(item.get('name'), 80) or 'Exercise'}*{_side(item)}"]
    detail = " · ".join(x for x in (_dose(item), _clean(item.get("frequency"), 60)) if x)
    if detail:
        lines.append(detail)
    steps = [_clean(step, 160) for step in item.get("steps") or [] if isinstance(step, str) and step.strip()]
    if steps:
        lines += ["", "*How to do it*"] + [f"{i}. {step}" for i, step in enumerate(steps[:5], 1)]
    note = _clean(item.get("note"), 240)
    if note:
        lines += ["", f"💬 Your physio: _{note}_"]
    return "\n".join(lines)[:1024]


def _now_lagos(now: datetime | None = None) -> datetime:
    return (now or datetime.now(timezone.utc)).astimezone(LAGOS)


def _time_label(hhmm: str) -> str:
    hour, minute = (int(x) for x in hhmm.split(":"))
    suffix = "am" if hour < 12 else "pm"
    return f"{hour % 12 or 12}{f':{minute:02d}' if minute else ''}{suffix}"


MAX_PICTURES = 6
DONE_PROMPT = (
    "Reply *DONE* when you've done them today, or *DONE 2* for just exercise 2. "
    "If anything hurts, tell me and I'll pass it to your physio."
)


def show_programme(session: Session, patient: Patient) -> tuple[str, dict | None, list[dict]]:
    """Reply to "my exercises": the plan card, then a picture of each exercise, then buttons.

    Returns (text, buttons for the text, messages to send after it).
    """
    from app.conversation.interactive import reply_buttons

    rh_patient_id = _rh_patient(session, patient)
    data = fetch_programmes(patient, rh_patient_id) if rh_patient_id else None
    if data is None:
        return "I can't load your exercise plan right now. Please try again in a few minutes.", None, []
    programmes = [p for p in data.get("programmes") or [] if isinstance(p, dict)]
    if not programmes:
        return (
            "You don't have an exercise plan from a physiotherapist yet. After your assessment, your "
            "physio sends one and I'll show it here.",
            None,
            [],
        )
    programme = programmes[0]
    watch_url = programme_watch_url(session, patient, rh_patient_id, str(programme.get("programme_id") or "")) if not programme.get("locked") else None
    card = programme_text(programme, data.get("care_plan_url"), watch_url=watch_url)
    exercises = exercise_items(programme)
    if not exercises:
        return card, None, []
    patient.exercise_prompted_at = datetime.now(timezone.utc)
    session.flush()
    options = [("DONE", "Done today ✅")]
    if patient.exercise_reminders != REMINDERS_ON:
        # One tap to a daily reminder (it checks whether their plan includes reminders)
        options += [("remind me at 7am", "Remind me 7am"), ("remind me at 6pm", "Remind me 6pm")]
    buttons = reply_buttons(*options)
    pictures = [
        {"image_url": str(item["image_url"]), "caption": image_caption(number, item)}
        for number, item in enumerate(exercises, 1)
        if isinstance(item.get("image_url"), str) and item["image_url"].startswith("https://")
    ][:MAX_PICTURES]
    if not pictures:
        return f"{card}\n\n{DONE_PROMPT}", buttons, []
    # The card, a picture of each exercise, then the buttons at the bottom of the chat
    return card, None, pictures + [{"text": DONE_PROMPT, "interactive": buttons}]


WATCH_LINKS_KEY = "programme_watch_links"


def programme_watch_url(session: Session, patient: Patient, rh_patient_id: str | None, programme_id: str) -> str | None:
    """A link to the 3D player that opens without signing in (PIN: the last 4 digits of this
    number), made by Rehabify once per programme and kept on the conversation until it nearly expires."""
    import time

    from app.conversation.companion import patient_conversation

    if not rh_patient_id or not programme_id:
        return None
    conversation = patient_conversation(session, patient)
    context = dict(conversation.booking_context or {}) if conversation is not None else {}
    links = dict(context.get(WATCH_LINKS_KEY) or {})
    cached = links.get(programme_id)
    now_ms = time.time() * 1000
    if isinstance(cached, dict) and isinstance(cached.get("url"), str) and float(cached.get("expires_at") or 0) > now_ms + 2 * 86_400_000:
        return cached["url"]
    try:
        result = configured_rh_client().programme_watch_link(patient_id=rh_patient_id, sender_phone=patient.phone_e164)
    except Exception as error:  # best effort: the card then links to the dashboard instead
        logger.warning("joy_watch_link_failed code=%s", getattr(error, "code", type(error).__name__))
        return None
    if not isinstance(result, dict):
        return None
    url = result.get("url") if isinstance(result, dict) else None
    if result.get("ok") is not True or not isinstance(url, str) or not url.startswith("https://"):
        return None
    if conversation is not None:
        links[programme_id] = {"url": url, "expires_at": result.get("expires_at")}
        context[WATCH_LINKS_KEY] = links
        conversation.booking_context = context
    return url


def log_done(session: Session, patient: Patient, item: int | None, pain: int | None) -> str:
    rh_patient_id = _rh_patient(session, patient)
    if not rh_patient_id:
        return "I can't reach your Rehabify record right now. Please try DONE again in a few minutes."
    data: dict[str, Any] = {"patient_id": rh_patient_id}
    if item is not None:
        data["item_index"] = item
    if pain is not None:
        data["pain_score"] = max(0, min(10, pain))
    # "DONE 2" means the patient's numbering (exercises only): map it to the programme's index
    if item is not None:
        programmes = (fetch_programmes(patient, rh_patient_id) or {}).get("programmes") or []
        exercises = exercise_items(programmes[0]) if programmes else []
        if not 1 <= item <= len(exercises):
            return f"Your plan has {len(exercises)} exercises. Reply DONE to log them all, or DONE and the exercise number."
        data["item_index"] = exercises[item - 1].get("index")
        data["programme_id"] = programmes[0].get("programme_id")
    try:
        result = configured_rh_client().operational_mutation(
            "patient_log_exercise", actor=_actor(patient, rh_patient_id), data=data,
            idempotency_key=f"joy-exercise-done-{patient.id}-{_now_lagos().date().isoformat()}-{item}",
        )
    except RHIntegrationError:
        return "I couldn't save that just now. Please reply DONE again in a few minutes."
    patient.exercise_prompted_at = None
    session.flush()
    append(session, kind=AuditKind.TRIAGE, actor_phone=patient.phone_e164, person_id=patient.id,
           payload={"decision": "exercise_done_logged", "logged": int(result.get("logged") or 0)})
    reason = result.get("reason")
    if reason == "no_programme":
        return "You don't have an active exercise plan right now, so there's nothing to log."
    if reason == "locked":
        return (
            "Tracking your progress for this plan is part of Flex. You can turn it on from your "
            "dashboard; ask me for your dashboard link."
        )
    if result.get("already_done"):
        return "You've already logged today's exercises. Well done!"
    text = "Well done! I've logged today's exercises." if item is None else f"Well done! I've logged exercise {item}."
    if pain is not None and pain >= 7:
        text += (
            f" Pain of {pain}/10 is high, so I've let your physiotherapist know. Please stop any exercise "
            "that makes it worse, and seek medical care if the pain is severe or you feel unwell."
        )
    elif pain is not None:
        text += f" I've noted pain of {pain}/10 for your physio."
    return text + "\n\nHow are you getting on? Type *CHECK IN* to tell your physio about your pain and progress."


def set_reminders(session: Session, patient: Patient, *, on: bool, at: str | None = None) -> str:
    if not on:
        patient.exercise_reminders = REMINDERS_PAUSED
        session.flush()
        return "Okay, I've stopped your exercise reminders. Reply START any time to turn them back on."
    rh_patient_id = _rh_patient(session, patient)
    allowed = reminders_allowed(patient, rh_patient_id) if rh_patient_id else None
    if allowed is None:
        return "I can't set up reminders right now. Please try again in a few minutes."
    if not allowed:
        return (
            "Daily exercise reminders on WhatsApp come with Flex Max. You can see your exercises any "
            "time by asking me for \"my exercises\", and turn on Flex Max from your dashboard."
        )
    patient.exercise_reminders = REMINDERS_ON
    if at:
        patient.exercise_reminder_time = at
    when = _time_label(patient.exercise_reminder_time or DEFAULT_TIME)
    session.flush()
    return (
        f"Done. I'll remind you about your exercises every day at {when} (Lagos time). "
        "Reply PAUSE to stop, or \"remind me at 7am\" to change the time."
    )


def parse_time(match: re.Match) -> str | None:
    hour, minute = int(match.group("hour")), int(match.group("minute") or 0)
    ampm = (match.group("ampm") or "").replace(".", "").lower()
    if minute > 59:
        return None
    if ampm:
        if not 1 <= hour <= 12:
            return None
        hour = hour % 12 + (12 if ampm == "pm" else 0)
    elif hour > 23:
        return None
    return f"{hour:02d}:{minute:02d}"


def reminder_command(session: Session, patient: Patient, user_text: str) -> str | None:
    """STOP / PAUSE / START / "remind me at 7am". None when the text isn't one of these."""
    at = REMIND_AT_RE.fullmatch(user_text or "")
    if at:
        if not at.group("ampm") and 1 <= int(at.group("hour")) <= 12:
            hour = int(at.group("hour"))
            minute = f":{at.group('minute')}" if at.group("minute") else ""
            return f"Did you mean {hour}{minute}am or {hour}{minute}pm? Reply REMIND ME AT {hour}{minute}AM or {hour}{minute}PM."
        hhmm = parse_time(at)
        if hhmm is None:
            return "I didn't catch that time. Try \"remind me at 7am\" or \"remind me at 6:30pm\"."
        return set_reminders(session, patient, on=True, at=hhmm)
    bare = (user_text or "").strip(" .!").casefold()
    if PAUSE_RE.fullmatch(user_text or ""):
        # A bare "stop" only means the reminders when they're on; otherwise it's ordinary chat
        if bare in _BARE_PAUSE and patient.exercise_reminders != REMINDERS_ON:
            return None
        return set_reminders(session, patient, on=False)
    if START_RE.fullmatch(user_text or ""):
        if bare in _BARE_START and patient.exercise_reminders != REMINDERS_PAUSED:
            return None
        return set_reminders(session, patient, on=True)
    return None


_BARE_PAUSE = {"stop", "pause", "unsubscribe"}
_BARE_START = {"start", "resume"}


def done_command(session: Session, patient: Patient, user_text: str) -> str | None:
    """DONE after a reminder or the plan. None when it isn't an exercise log."""
    match = DONE_RE.fullmatch(user_text or "")
    if not match:
        return None
    prompted = patient.exercise_prompted_at
    if prompted is None or datetime.now(timezone.utc) - prompted > _DONE_WINDOW:
        return None
    item = int(match.group("item")) if match.group("item") else None
    pain = int(match.group("pain")) if match.group("pain") else None
    return log_done(session, patient, item, pain)


def reminder_text(patient: Patient, programme: dict) -> str:
    first = _clean((patient.name or "").split(" ")[0], 30)
    hello = f", {first}" if first and first != "Patient" else ""
    lines = [f"⏰ *Time for today's exercises*{hello}", _byline(programme), ""]
    for number, item in enumerate(exercise_items(programme), 1):
        dose = _dose(item)
        lines.append(f"{number}. {_clean(item.get('name'), 60) or 'Exercise'}{_side(item)}{f' · {dose}' if dose else ''}")
    lines += ["", "Reply *DONE* when you've finished, or tell me if anything hurts. Reply *PAUSE* to stop these reminders."]
    return "\n".join(lines)


def process_exercise_reminders_once(*, now: datetime | None = None, session: Session | None = None, sender=None) -> int:
    """Send today's reminder to each patient whose chosen time has passed. Safe to run often."""
    from app.conversation.interactive import reply_buttons
    from app.db import SessionLocal
    from app.queue.tasks import send_whatsapp_interactive, send_whatsapp_text

    own = session is None
    db = session or SessionLocal()
    current = _now_lagos(now)
    today: date = current.date()
    sent = 0
    try:
        due = db.scalars(
            select(Patient).where(
                Patient.exercise_reminders == REMINDERS_ON,
                or_(Patient.exercise_reminder_last_sent_on.is_(None), Patient.exercise_reminder_last_sent_on < today),
            ).with_for_update(skip_locked=True).limit(50)
        ).all()
        for patient in due:
            hour, minute = (int(x) for x in (patient.exercise_reminder_time or DEFAULT_TIME).split(":"))
            if (current.hour, current.minute) < (hour, minute):
                continue
            patient.exercise_reminder_last_sent_on = today  # once a day, even if the checks below say no
            rh_patient_id = _rh_patient(db, patient)
            if not rh_patient_id or reminders_allowed(patient, rh_patient_id) is False:
                continue
            data = fetch_programmes(patient, rh_patient_id) or {}
            programmes = [p for p in data.get("programmes") or [] if isinstance(p, dict) and exercise_items(p)]
            if not programmes:
                continue
            programme = programmes[0]
            done = {i for i in programme.get("done_today") or [] if isinstance(i, int)}
            if all(item.get("index") in done for item in exercise_items(programme)):
                continue  # already done today: no nagging
            try:
                buttons = reply_buttons(("DONE", "Done ✅"), ("my exercises", "Show details"), ("PAUSE", "Pause reminders"))
                (sender or send_whatsapp_interactive)(patient.phone_e164, reminder_text(patient, programme), buttons, text_sender=send_whatsapp_text)
            except Exception:
                logger.exception("exercise reminder delivery failed")
                continue
            patient.exercise_prompted_at = datetime.now(timezone.utc)
            append(db, kind=AuditKind.TRIAGE, actor_phone="joy-worker", person_id=patient.id,
                   payload={"event": "exercise_reminder_sent"})
            sent += 1
        if own:
            db.commit()
        return sent
    except Exception:
        if own:
            db.rollback()
        raise
    finally:
        if own:
            db.close()
