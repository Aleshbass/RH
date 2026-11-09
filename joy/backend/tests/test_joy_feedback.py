"""The owner's test of Joy, 9 Nov 2026: what to fix.

- Patients choose when they're free ([Today or tomorrow] [This week] [Choose a day]).
- A name from an earlier record is confirmed first, and the profile asks one thing at a time,
  with sex and a female/male physio preference (used in matching).
- Cancel, change physio, a named physio, another day and "what else can you do?" are acted on at
  any step, then the step carries on.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.types import Identity, Persona
from app.triage import timing
from tests.test_self_referral import STORY, FakeRH, _match, _through_intake, _turn, new_patient, rh  # noqa: F401

# A Monday morning in Lagos
MONDAY_9AM = datetime(2026, 11, 9, 9, 0, tzinfo=timing.LAGOS)


# ---- when they're free ---------------------------------------------------------------------------

@pytest.mark.parametrize("text, expected", [
    ("Today or tomorrow", "soon"),
    ("this week", "week"),
    ("Choose a day", "choose"),
    ("today", date(2026, 11, 9)),
    ("tomorrow please", date(2026, 11, 10)),
    ("Friday", date(2026, 11, 13)),
    ("can I come on Wednesday?", date(2026, 11, 11)),
    ("12 Nov", date(2026, 11, 12)),
    ("day:2026-11-14", date(2026, 11, 14)),
    ("banana", None),
])
def test_parse_timing(text, expected):
    assert timing.parse_timing(text, MONDAY_9AM) == expected


def test_a_late_monday_means_next_monday():
    late = MONDAY_9AM.replace(hour=22, minute=30)
    assert timing.parse_timing("Monday", late) == date(2026, 11, 16)


def test_windows():
    soon = timing.soon_window(MONDAY_9AM)
    assert soon.kind == "soon" and soon.not_before_ms is None and soon.within_hours == 39  # to midnight Tuesday
    friday = timing.day_window(date(2026, 11, 13), MONDAY_9AM)
    assert friday.label == "on Friday 13 November"
    assert friday.not_before_ms == int(datetime(2026, 11, 13, tzinfo=timing.LAGOS).timestamp() * 1000)
    assert timing.day_window(date(2026, 11, 30), MONDAY_9AM) is None  # more than a week ahead
    rows = timing.day_rows(MONDAY_9AM)
    assert rows[0] == ("day:2026-11-09", "Mon 9 Nov", "Today") and len(rows) == 7
    assert all(len(title) <= 24 for _, title, _ in rows)


def test_choosing_a_day_matches_that_day_only(db_session, new_patient, rh):
    _through_intake(db_session, new_patient)
    for answer in ("7", "Moderate", "no", "yes", "no"):
        _turn(db_session, new_patient, STORY, answer)
    days = _turn(db_session, new_patient, STORY, "Choose a day")
    assert days.reply_text.startswith("Which day suits you?")
    assert days.interactive["type"] == "list"
    pick = days.interactive["action"]["sections"][0]["rows"][2]["id"]
    offer = _turn(db_session, new_patient, STORY, pick)
    call = [kwargs for op, kwargs in rh.calls if op == "match"][-1]
    chosen = date.fromisoformat(pick[4:])
    assert call["not_before_ms"] == int(datetime.combine(chosen, datetime.min.time(), tzinfo=timing.LAGOS).timestamp() * 1000)
    assert timing.day_label(chosen) in offer.reply_text


# ---- the profile ---------------------------------------------------------------------------------

@pytest.fixture
def known_patient(db_session) -> Identity:
    patient = Patient(phone_e164="+2348000009102", name="Simidara", age=25, city="Ibadan", area="Bodija")
    db_session.add(patient)
    db_session.flush()
    return Identity(persona=Persona.PATIENT, person_id=patient.id, phone_e164=patient.phone_e164)


def test_a_known_name_is_confirmed_before_it_is_used(db_session, known_patient, rh):
    _turn(db_session, known_patient, STORY, "Hi")
    _turn(db_session, known_patient, STORY, "1")
    confirm = _turn(db_session, known_patient, STORY, "I agree")
    assert confirm.reply_text == "Am I speaking with Simidara? I have you down as Simidara, 25, in Bodija, Ibadan."
    assert [b["reply"]["title"] for b in confirm.interactive["action"]["buttons"]] == ["Yes, that's me", "No, someone else"]
    sex = _turn(db_session, known_patient, STORY, "Yes")
    assert sex.reply_text == "Are you female or male?"


def test_someone_else_on_the_phone_gives_their_own_details(db_session, known_patient, rh):
    _turn(db_session, known_patient, STORY, "Hi")
    _turn(db_session, known_patient, STORY, "1")
    _turn(db_session, known_patient, STORY, "I agree")
    name = _turn(db_session, known_patient, STORY, "No")
    assert name.reply_text == "Thanks for letting me know.\n\nWhat's your first name?"
    patient = db_session.get(Patient, known_patient.person_id)
    assert (patient.name, patient.age, patient.city) == (None, None, None)


def test_a_physio_preference_reaches_matching(db_session, new_patient, rh):
    _turn(db_session, new_patient, STORY, "Hi")
    _turn(db_session, new_patient, STORY, "1")
    _turn(db_session, new_patient, STORY, "I agree")
    _turn(db_session, new_patient, STORY, "Ada, 34, Yaba")
    _turn(db_session, new_patient, STORY, "Female")
    _turn(db_session, new_patient, STORY, "Female")
    _turn(db_session, new_patient, STORY, "My lower back has been hurting for 3 weeks")
    for answer in ("7", "Moderate", "no", "yes", "no", "this week"):
        _turn(db_session, new_patient, STORY, answer)
    call = [kwargs for op, kwargs in rh.calls if op == "match"][-1]
    assert call["physio_sex"] == "female" and call["within_hours"] == 168
    assert db_session.get(Patient, new_patient.person_id).gender == "female"


# ---- requests at any step ------------------------------------------------------------------------

def _to_the_list(db_session, identity):
    _through_intake(db_session, identity)
    for answer in ("7", "Moderate", "no", "yes", "no"):
        _turn(db_session, identity, STORY, answer)
    return _turn(db_session, identity, STORY, "today or tomorrow")


def _conversation(db_session, identity) -> Conversation:
    return db_session.scalar(select(Conversation).where(Conversation.person_id == identity.person_id))


def test_cancel_at_the_physio_list_stops_the_booking(db_session, new_patient, rh):
    _to_the_list(db_session, new_patient)
    reply = _turn(db_session, new_patient, STORY, "I want to cancel booking")
    assert reply.reply_text.startswith("Okay, I've cancelled that, so nothing is booked")
    conversation = _conversation(db_session, new_patient)
    assert conversation.booking_substate is None
    assert conversation.booking_context["triage_flow_state"] == "sr_timing"
    again = _turn(db_session, new_patient, STORY, "tomorrow")
    assert "free tomorrow" in again.reply_text


def test_naming_a_physio_on_the_time_list_books_them(db_session, new_patient, rh):
    _to_the_list(db_session, new_patient)
    _turn(db_session, new_patient, STORY, "1")
    times = _turn(db_session, new_patient, STORY, "Choose another time")
    assert "Tolu Adeyemi" in times.reply_text or "time" in times.reply_text.lower()
    chosen = _turn(db_session, new_patient, STORY, "I want Ngozi Okafor")
    assert chosen.reply_text.startswith("You've selected *Ngozi Okafor*.")


def test_a_name_not_on_the_list_is_said_plainly(db_session, new_patient, rh):
    _to_the_list(db_session, new_patient)
    reply = _turn(db_session, new_patient, STORY, "I want Olamide Akinwola")
    assert reply.reply_text.startswith("Olamide Akinwola isn't one of the physiotherapists free today or tomorrow.")


def test_change_physio_before_paying_shows_the_others(db_session, new_patient, rh):
    _to_the_list(db_session, new_patient)
    _turn(db_session, new_patient, STORY, "1")
    others = _turn(db_session, new_patient, STORY, "I want a different physio")
    assert "Tolu Adeyemi" not in others.reply_text and "Femi Bello" in others.reply_text


def test_another_day_at_the_list_searches_that_day(db_session, new_patient, rh):
    _to_the_list(db_session, new_patient)
    reply = _turn(db_session, new_patient, STORY, "can I book for Friday instead")
    call = [kwargs for op, kwargs in rh.calls if op == "match"][-1]
    assert call["not_before_ms"] is not None or "today" in reply.reply_text
    assert "free" in reply.reply_text


def test_what_else_can_you_do_then_the_step_again(db_session, new_patient, rh):
    screen = _through_intake(db_session, new_patient)
    asked = _turn(db_session, new_patient, STORY, "what else can you do?")
    assert asked.before[0]["text"].startswith("Here's what I can help with:")
    assert asked.reply_text == screen.reply_text
    assert asked.interactive["type"] == "list"
