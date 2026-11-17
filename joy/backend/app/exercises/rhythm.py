"""Recovery companion daily rhythm (Mary's Joy coordination spec, "Daily rhythm" and escalation
thresholds), on top of the daily exercise reminder (app/exercises/programme.py).

For a patient who turned daily reminders on, and whose plan allows daily Joy support (Flex Max,
or covered: RH patient_recovery_plan), checked by the worker about once a minute:

- Evening: one gentle nudge after 7 PM when today's exercises aren't done.
- 2 days with no exercise: a kind check-in, "Is anything making the exercises hard?"
- 3 days with no exercise: the physio is told (a message in their chat), and the patient is too.
- Sunday evening: a weekly progress message: active days, the pain trend, and one encouraging line
  from the plan's goal.

Each message goes at most once (a Redis key per patient and day, gap or week), only between 10 AM
and 9 PM Lagos time. Nothing is sent when Rehabify can't say whether daily support is allowed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.patient import Patient

logger = logging.getLogger(__name__)

LAGOS = ZoneInfo("Africa/Lagos")
DAY_MS = 86_400_000
EVENING_HOUR = 19
QUIET_BEFORE, QUIET_AFTER = 10, 21
_KEY_TTL = 14 * 86_400


def _first(patient: Patient) -> str:
    name = (patient.name or "").split(" ")[0].strip()
    return "" if name.casefold() in {"", "patient"} else name


def evening_text() -> str:
    return "Still time for today's exercises if you can. Even one helps. 💪"


def two_day_text(first: str, physio: str) -> str:
    hello = f"Hi {first}, " if first else "Hi, "
    return f"{hello}I haven't seen any exercises logged for 2 days. Is anything making them hard? I can let {physio} know."


def three_day_text(physio: str) -> str:
    return (
        f"I've let {physio} know you haven't done your exercises for a few days, so they can check in with you. "
        "They're here whenever you're ready: reply *my exercises*."
    )


def weekly_text(programme: dict) -> str:
    days = int(programme.get("active_days_last_7") or 0)
    lines = [f"📈 Your week with *{programme.get('title') or 'your programme'}*: exercises on {days} of the last 7 days."]
    now, before = programme.get("pain_last_7"), programme.get("pain_prev_7")
    if isinstance(now, (int, float)):
        if isinstance(before, (int, float)) and before != now:
            trend = "down" if now < before else "up"
            lines.append(f"Average pain {now:g}/10, {trend} from {before:g} the week before.")
        else:
            lines.append(f"Average pain {now:g}/10.")
    goals = programme.get("goals")
    goal = goals[0] if isinstance(goals, list) and goals else goals if isinstance(goals, str) else None
    if isinstance(goal, str) and goal.strip():
        lines.append(f"Keep going: you're working towards \"{' '.join(goal.split())[:120]}\".")
    else:
        lines.append("Keep going: every session counts.")
    return "\n".join(lines)


def _once(client, key: str) -> bool:
    """True the first time a key is claimed (SET NX), so each message goes at most once."""
    try:
        return bool(client.set(key, "1", nx=True, ex=_KEY_TTL))
    except Exception:
        logger.warning("joy_rhythm_redis_unavailable", exc_info=True)
        return False


def process_recovery_rhythm_once(*, now: datetime | None = None, session: Session | None = None,
                                 redis_client=None, send=None, send_buttons=None, tell_physio=None) -> int:
    """Send whatever rhythm message is due for each patient with daily reminders on."""
    from app.conversation.companion import BTN_EXERCISES, BTN_MESSAGE
    from app.conversation.interactive import reply_buttons
    from app.db import SessionLocal
    from app.exercises.programme import _actor, _rh_patient, exercise_items, fetch_programmes, note_care_message, reminders_allowed
    from app.queue.tasks import _redis, send_whatsapp_interactive, send_whatsapp_text

    current = (now or datetime.now(timezone.utc)).astimezone(LAGOS)
    if not (QUIET_BEFORE <= current.hour < QUIET_AFTER):
        return 0
    today = current.date()
    client = redis_client or _redis()
    text_sender = send or send_whatsapp_text
    button_sender = send_buttons or (lambda phone, text, buttons: send_whatsapp_interactive(phone, text, buttons, text_sender=text_sender))
    sent = 0
    db = session or SessionLocal()
    try:
        patients = db.scalars(select(Patient).where(Patient.exercise_reminders == "on").limit(500)).all()
        for patient in patients:
            try:
                rh_patient_id = _rh_patient(db, patient)
                if not rh_patient_id or reminders_allowed(patient, rh_patient_id) is not True:
                    continue  # no daily support, or Rehabify couldn't say: nothing goes
                data = fetch_programmes(patient, rh_patient_id) or {}
                programme = next((p for p in data.get("programmes") or [] if isinstance(p, dict) and exercise_items(p)), None)
                if programme is None:
                    continue
                physio = (programme.get("sender_name") or "your physio").strip()
                now_ms = current.timestamp() * 1000
                last = programme.get("last_active_at") or programme.get("sent_at")
                idle_days = (now_ms - last) / DAY_MS if isinstance(last, (int, float)) else 0
                done = {i for i in programme.get("done_today") or [] if isinstance(i, int)}
                all_done = all(item.get("index") in done for item in exercise_items(programme))
                pid = str(patient.id)
                sent_before = sent
                if idle_days >= 3 and _once(client, f"joy:rhythm:idle3:{pid}:{int(last)}"):
                    if tell_physio is not None:
                        tell_physio(patient, rh_patient_id)
                    else:
                        from app.integrations.rh_client import configured_rh_client

                        first = _first(patient) or "Your patient"
                        configured_rh_client().message_physio(
                            patient_id=rh_patient_id, actor=_actor(patient, rh_patient_id),
                            message=f"⚠️ (Sent by Joy) {first} hasn't logged any exercises for 3 days. You may want to check in with them.",
                        )
                    text_sender(patient.phone_e164, three_day_text(physio))
                    sent += 1
                elif 2 <= idle_days < 3 and _once(client, f"joy:rhythm:idle2:{pid}:{int(last)}"):
                    button_sender(patient.phone_e164, two_day_text(_first(patient), physio),
                                  reply_buttons((BTN_MESSAGE, "Tell my physio"), ("i'm fine", "I'm fine")))
                    sent += 1
                elif (
                    current.hour >= EVENING_HOUR and not all_done
                    and patient.exercise_reminder_last_sent_on == today
                    and _once(client, f"joy:rhythm:evening:{pid}:{today.isoformat()}")
                ):
                    button_sender(patient.phone_e164, evening_text(), reply_buttons(("DONE", "Done ✅"), (BTN_EXERCISES, "Show details")))
                    sent += 1
                elif (
                    current.weekday() == 6 and current.hour >= 18
                    and isinstance(programme.get("sent_at"), (int, float)) and now_ms - programme["sent_at"] >= 6 * DAY_MS
                    and _once(client, f"joy:rhythm:week:{pid}:{today.isocalendar()[0]}-{today.isocalendar()[1]}")
                ):
                    text_sender(patient.phone_e164, weekly_text(programme))
                    sent += 1
                if sent > sent_before:
                    note_care_message(patient, rh_patient_id)
            except Exception:
                logger.exception("joy_rhythm_patient_failed")
        if session is None:
            db.commit()
    finally:
        if session is None:
            db.close()
    return sent
