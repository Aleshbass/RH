"""The recovery companion's daily rhythm (Joy coordination spec): evening nudge, 2- and 3-day
check-ins and the weekly progress message. No database needed."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import pytest

from app.exercises import rhythm

LAGOS = ZoneInfo("Africa/Lagos")
DAY = 86_400_000


class FakeRedis:
    def __init__(self):
        self.keys = set()

    def set(self, key, value, nx=False, ex=None):
        if nx and key in self.keys:
            return None
        self.keys.add(key)
        return True


class FakeSession:
    def __init__(self, patients):
        self.patients = patients

    def scalars(self, _query):
        return SimpleNamespace(all=lambda: self.patients)


def programme(now, **overrides):
    base = {
        "title": "Knee programme", "sender_name": "Bisi Okafor", "goals": ["Climb the stairs at work without pain"],
        "items": [{"index": 0, "kind": "exercise", "name": "Heel slides"}], "done_today": [],
        "sent_at": now - 10 * DAY, "last_active_at": now - 0.5 * DAY,
        "active_days_last_7": 5, "pain_last_7": 3, "pain_prev_7": 5,
    }
    base.update(overrides)
    return base


@pytest.fixture
def world(monkeypatch):
    out = {"text": [], "buttons": [], "physio": []}
    patient = SimpleNamespace(id="p1", name="Ada Obi", phone_e164="+2348030000000", exercise_reminders="on",
                              exercise_reminder_last_sent_on=None)
    state = {"programme": None, "allowed": True}
    from app.exercises import programme as prog

    monkeypatch.setattr(prog, "_rh_patient", lambda db, p: "rh-1")
    monkeypatch.setattr(prog, "reminders_allowed", lambda p, rh: state["allowed"])
    monkeypatch.setattr(prog, "fetch_programmes", lambda p, rh: {"programmes": [state["programme"]]})

    def run(at: datetime):
        return rhythm.process_recovery_rhythm_once(
            now=at, session=FakeSession([patient]), redis_client=redis,
            send=lambda phone, text: out["text"].append(text),
            send_buttons=lambda phone, text, buttons: out["buttons"].append(text),
            tell_physio=lambda p, rh: out["physio"].append(rh),
        )

    redis = FakeRedis()
    return SimpleNamespace(out=out, patient=patient, state=state, run=run)


def at(day: int, hour: int) -> datetime:
    return datetime(2026, 11, day, hour, 0, tzinfo=LAGOS)  # 22 Nov 2026 is a Sunday


def test_evening_nudge_once_when_not_done(world):
    now = at(18, 19)
    world.state["programme"] = programme(now.timestamp() * 1000)
    world.patient.exercise_reminder_last_sent_on = now.date()
    world.run(now)
    world.run(now + timedelta(minutes=5))
    assert world.out["buttons"] == [rhythm.evening_text()]


def test_two_days_idle_is_a_kind_check_in_and_three_days_tells_the_physio(world):
    now = at(18, 12)
    ms = now.timestamp() * 1000
    world.state["programme"] = programme(ms, last_active_at=ms - 2.2 * DAY)
    world.run(now)
    assert world.out["buttons"] and "Is anything making them hard?" in world.out["buttons"][0]
    world.state["programme"] = programme(ms, last_active_at=ms - 3.1 * DAY)
    world.run(now)
    assert world.out["physio"] == ["rh-1"] and "I've let Bisi Okafor know" in world.out["text"][0]


def test_weekly_progress_on_sunday_evening(world):
    now = at(22, 18)
    world.state["programme"] = programme(now.timestamp() * 1000)
    world.run(now)
    assert world.out["text"] and "exercises on 5 of the last 7 days" in world.out["text"][0]
    assert "down from 5" in world.out["text"][0] and "Climb the stairs" in world.out["text"][0]


def test_nothing_without_daily_support_or_at_night(world):
    now = at(18, 12)
    ms = now.timestamp() * 1000
    world.state["programme"] = programme(ms, last_active_at=ms - 2.5 * DAY)
    world.state["allowed"] = None  # Rehabify couldn't say
    world.run(now)
    world.state["allowed"] = True
    world.run(at(18, 23))
    assert not any(world.out.values())
