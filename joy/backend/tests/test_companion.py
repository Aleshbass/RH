"""Joy for patients already in care (app/conversation/companion.py, RH convex/joyConnect.ts).

These tests need no database: the connect message, the greeting menu and the WhatsApp texts for
RH's programme.sent and appointment.scheduled events.
"""

from types import SimpleNamespace

from app.api.internal.rh_events import appointment_scheduled_text, programme_sent_text
from app.conversation.companion import BTN_BOOK, BTN_EXERCISES, BTN_MESSAGE, companion_greeting, connect_code


def test_the_connect_message_from_the_link_is_read():
    assert connect_code("Hi Joy, connect me: K7P3XQ2M") == "K7P3XQ2M"
    assert connect_code("hi joy connect me k7p3 xq2m") == "K7P3XQ2M"
    assert connect_code("JOIN K7P3XQ2M") == "K7P3XQ2M"
    assert connect_code("connect me: k7p3-xq2m") == "K7P3XQ2M"


def test_ordinary_messages_are_not_connect_codes():
    assert connect_code("Hi Joy") is None
    assert connect_code("I want to join the video call now") is None
    assert connect_code("can you connect me to a physio near me please") is None
    assert connect_code("connect me: AB") is None


def _summary(**overrides):
    summary = {
        "has_physio": True,
        "first_name": "Ada",
        "physio_name": "Bisi Okafor",
        "clinic_name": None,
        "programme": {"title": "Knee programme", "items": 5, "done_today": 2, "finished_today": False, "locked": False},
        "next_appointment": None,
    }
    summary.update(overrides)
    return summary


def _button_ids(interactive):
    return [b["reply"]["id"] for b in interactive["action"]["buttons"]]


def test_a_patient_in_care_is_greeted_with_their_physio_and_todays_exercises():
    text, buttons = companion_greeting(SimpleNamespace(name="Patient"), _summary())
    assert text.startswith("Hi Ada 👋")
    assert "Bisi Okafor looks after you" in text
    assert "*Knee programme*: 2 of 5 done today." in text
    assert _button_ids(buttons) == [BTN_EXERCISES, BTN_BOOK, BTN_MESSAGE]


def test_connecting_says_so_and_names_the_clinic():
    text, _ = companion_greeting(SimpleNamespace(name=None), _summary(clinic_name="Lighthouse Physio", programme=None), connected=True)
    assert text.startswith("You're connected, Ada ✅")
    assert "Bisi Okafor (Lighthouse Physio) looks after you" in text
    assert "done today" not in text


def test_a_finished_day_is_celebrated_and_the_next_visit_shown():
    start = 1_800_000_000_000  # a fixed time
    text, _ = companion_greeting(
        SimpleNamespace(name="Ada"),
        _summary(
            programme={"title": "Knee", "items": 5, "done_today": 5, "finished_today": True, "locked": False},
            next_appointment={"start_time": start, "online": True},
        ),
    )
    assert "Today's exercises are done and sent to Bisi Okafor" in text
    assert "📅 Next visit:" in text and "(video call)" in text


def test_a_new_programme_message_offers_the_exercises_and_a_reminder():
    text = programme_sent_text({"sender_name": "Bisi Okafor", "title": "Knee programme", "change": "new"}, reminders_on=False)
    assert text.startswith("🏋️ Bisi Okafor sent you a new home programme: *Knee programme*.")
    assert "Reply *my exercises*" in text
    assert "remind me at 7am" in text


def test_no_reminder_offer_when_reminders_are_already_on():
    text = programme_sent_text({"sender_name": "Bisi", "title": "Knee", "change": "added", "what": "2 exercises"}, reminders_on=True)
    assert "added 2 exercises to *Knee*" in text
    assert "remind me" not in text


def test_a_booked_visit_is_sent_with_its_time_and_payment_note():
    text = appointment_scheduled_text({
        "physio_name": "Bisi Okafor", "start_time": 1_800_000_000_000, "online": False, "visits": 3, "pay_to_confirm": True,
    })
    assert text.startswith("📅 Bisi Okafor booked your next visit for ")
    assert "That's the first of 3 visits." in text
    assert "pay within 24 hours" in text.lower()
