"""Visits changed on the website reach Joy, reminders follow them, and unpaid holds are nudged.

convex/joySync.ts sends appointment.rescheduled / appointment.cancelled for any website path, and
booking.payment_reminder / booking.hold_expired for Joy's held times. No database needed.
"""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.api.internal import rh_events as ev
from app.booking import appointment_reminders as ar

NOW = datetime.now(timezone.utc)


def ms(when: datetime) -> int:
    return int(when.timestamp() * 1000)


class FakeSession:
    """Just enough of a SQLAlchemy session for the reminder scheduler."""

    def __init__(self, rows=None):
        self.rows = list(rows or [])

    def scalars(self, _query):
        return SimpleNamespace(all=lambda: list(self.rows), __iter__=lambda: iter(self.rows))

    def add(self, row):
        self.rows.append(row)


PATIENT = SimpleNamespace(id="p1", phone_e164="+2348030000000")


@pytest.fixture
def sent(monkeypatch):
    out = []
    monkeypatch.setattr(ev, "enqueue_booking_confirmed", lambda phone, key, text, **k: out.append(text))
    monkeypatch.setattr(ev, "append", lambda *a, **k: None)
    monkeypatch.setattr(ev, "_appointment_email", lambda *a: None)
    monkeypatch.setattr(ev, "_patient_for_rh_id", lambda *a: PATIENT)
    return out


def test_three_reminder_points_and_a_late_booking_skips_the_day_before():
    session = FakeSession()
    rows = ar.schedule_appointment_reminder(
        session, rh_booking_id="appt-1", patient=PATIENT, email=None, provider_name="Ada Obi",
        service_mode="online", session_start=NOW + timedelta(hours=5), duration_minutes=20,
    )
    status = {r.reminder_kind: r.status for r in rows}
    assert status == {ar.DAY_BEFORE: "skipped", ar.THIRTY_MINUTES_BEFORE: "pending", ar.AT_APPOINTMENT_START: "pending"}


def test_a_moved_visit_brings_a_skipped_or_cancelled_reminder_back():
    session = FakeSession()
    rows = ar.schedule_appointment_reminder(
        session, rh_booking_id="appt-1", patient=PATIENT, email=None, provider_name="Ada Obi",
        service_mode="online", session_start=NOW + timedelta(hours=5), duration_minutes=20,
    )
    for row in rows:
        row.status = "cancelled" if row.reminder_kind != ar.DAY_BEFORE else row.status
    moved = ar.schedule_appointment_reminder(
        session, rh_booking_id="appt-1", patient=PATIENT, email=None, provider_name="Ada Obi",
        service_mode="online", session_start=NOW + timedelta(days=3), duration_minutes=20,
    )
    assert {r.reminder_kind: r.status for r in moved} == {
        ar.DAY_BEFORE: "pending", ar.THIRTY_MINUTES_BEFORE: "pending", ar.AT_APPOINTMENT_START: "pending",
    }


def test_day_before_text():
    reminder = SimpleNamespace(
        reminder_kind=ar.DAY_BEFORE, service_mode="online", provider_name="Ada Obi",
        session_start=NOW + timedelta(days=1), booking_code=None, meeting_url=None,
    )
    assert "in 24 hours" in ar.appointment_reminder_text(reminder)


def test_physio_cancelled_visit_is_told_kindly_and_reminders_stop(monkeypatch, sent):
    reminder = SimpleNamespace(status="pending")
    monkeypatch.setattr(ev, "_visit_reminders", lambda *a: [reminder])
    monkeypatch.setattr(ev, "_patient_conversation", lambda *a: None)
    ev._appointment_cancelled(None, {
        "patient_id": "u1", "appointment_id": "a1", "physio_name": "Ada Obi",
        "start_time": ms(NOW + timedelta(days=2)), "cancelled_by": "physiotherapist",
    })
    assert reminder.status == "cancelled"
    assert sent and "Ada Obi has had to cancel" in sent[0]


def test_a_joy_booking_already_cancelled_is_not_told_twice(monkeypatch, sent):
    monkeypatch.setattr(ev, "_visit_reminders", lambda *a: [])
    conversation = SimpleNamespace(booking_context={"rh_booking_id": "b1", "rh_booking_status": "cancelled"})
    monkeypatch.setattr(ev, "_patient_conversation", lambda *a: conversation)
    ev._appointment_cancelled(None, {"patient_id": "u1", "appointment_id": "a1", "booking_id": "b1", "cancelled_by": "patient"})
    assert not sent


def test_a_move_joy_already_knows_about_only_updates_reminders(monkeypatch, sent):
    start = NOW + timedelta(days=2)
    monkeypatch.setattr(ev, "_visit_reminders", lambda *a: [SimpleNamespace(session_start=start.replace(microsecond=0))])
    scheduled = []
    monkeypatch.setattr(ev, "_schedule_visit_reminders", lambda *a: scheduled.append(True))
    ev._appointment_rescheduled(None, {"patient_id": "u1", "appointment_id": "a1", "start_time": ms(start.replace(microsecond=0))})
    assert scheduled and not sent


def test_a_website_move_is_told(monkeypatch, sent):
    monkeypatch.setattr(ev, "_visit_reminders", lambda *a: [])
    monkeypatch.setattr(ev, "_schedule_visit_reminders", lambda *a: None)
    ev._appointment_rescheduled(None, {"patient_id": "u1", "appointment_id": "a1", "physio_name": "Ada Obi",
                                       "start_time": ms(NOW + timedelta(days=2)), "online": True})
    assert sent and "has moved to" in sent[0] and "online video call" in sent[0]


def chat(step, **ctx):
    return SimpleNamespace(booking_substate=step, booking_context={"rh_booking_id": "b1", **ctx})


def test_hold_reminder_resends_the_payment_link(monkeypatch, sent):
    monkeypatch.setattr(ev, "_patient_conversation", lambda *a: chat("rh_awaiting_payment", authorization_url="https://checkout.paystack.com/x"))
    ev._hold_nudge(None, {"booking_id": "b1", "patient_id": "u1", "physio_name": "Ada Obi",
                          "hold_expires_at": ms(NOW + timedelta(minutes=10))}, expired=False)
    assert sent and "https://checkout.paystack.com/x" in sent[0] and "held until" in sent[0]


def test_hold_reminder_before_the_link_asks_where_the_receipt_goes(monkeypatch, sent):
    monkeypatch.setattr(ev, "_patient_conversation", lambda *a: chat("rh_awaiting_payment_email"))
    ev._hold_nudge(None, {"booking_id": "b1", "patient_id": "u1"}, expired=False)
    assert sent and "WhatsApp is fine" in sent[0]


def test_expired_hold_says_nothing_was_charged(monkeypatch, sent):
    monkeypatch.setattr(ev, "_patient_conversation", lambda *a: chat("rh_awaiting_payment", authorization_url="https://x"))
    ev._hold_nudge(None, {"booking_id": "b1", "patient_id": "u1"}, expired=True)
    assert sent and "released" in sent[0] and "nothing was charged" in sent[0] and "*PAY*" in sent[0]


@pytest.mark.parametrize("ctx,step", [
    ({"rh_payment_status": "succeeded"}, "rh_awaiting_payment"),  # paid already
    ({}, "rh_awaiting_named_provider"),  # moved on to something else
])
def test_no_nudge_once_paid_or_moved_on(monkeypatch, sent, ctx, step):
    monkeypatch.setattr(ev, "_patient_conversation", lambda *a: chat(step, **ctx))
    ev._hold_nudge(None, {"booking_id": "b1", "patient_id": "u1"}, expired=False)
    assert not sent


def test_no_nudge_for_another_booking(monkeypatch, sent):
    monkeypatch.setattr(ev, "_patient_conversation", lambda *a: chat("rh_awaiting_payment"))
    ev._hold_nudge(None, {"booking_id": "other", "patient_id": "u1"}, expired=True)
    assert not sent
