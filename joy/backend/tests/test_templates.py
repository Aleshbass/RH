"""After the 24-hour window, each kind of message goes out on its own approved template (16 Nov 2026)."""
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.queue import tasks
from app.queue import templates as t

START = datetime(2026, 11, 20, 9, 0, tzinfo=timezone.utc)  # 10:00 AM in Lagos


@pytest.fixture
def sent(monkeypatch):
    out = []
    settings = SimpleNamespace(
        disable_whatsapp_delivery=False, joy_environment="production", whatsapp_access_token="t",
        whatsapp_phone_number_id="1", whatsapp_update_template="joy_booking_update", whatsapp_update_template_language="en",
    )
    monkeypatch.setattr(tasks, "get_settings", lambda: settings)
    monkeypatch.setattr(tasks, "_post_message", lambda settings, message: out.append(message) or "wamid.1")
    monkeypatch.setattr(tasks, "_remember_outbound", lambda *a: None)
    monkeypatch.setattr(tasks, "_localized", lambda phone, text: text)
    return out


def window(monkeypatch, open_: bool):
    monkeypatch.setattr(tasks, "_in_service_window", lambda phone: open_)


def test_inside_the_window_it_is_plain_text(monkeypatch, sent):
    window(monkeypatch, True)
    tasks.send_whatsapp_text("+2348030000000", "Hello", template=t.booking_confirmed("online", "Ada Obi", START))
    assert sent[0]["type"] == "text"


def test_after_24_hours_the_visit_reminder_has_the_join_button(monkeypatch, sent):
    window(monkeypatch, False)
    template = t.visit_reminder("online", "Ada Obi", START, "https://physioaroundme.com/v/ab12cd")
    tasks.send_whatsapp_text("+2348030000000", "Reminder…", template=template)
    message = sent[0]["template"]
    assert message["name"] == "joy_visit_reminder_online"
    assert [p["text"] for p in message["components"][0]["parameters"]] == ["online consultation", "Ada Obi", "Fri 20 Nov, 10:00 AM"]
    assert message["components"][1] == {"type": "button", "sub_type": "url", "index": "0", "parameters": [{"type": "text", "text": "ab12cd"}]}


def test_payment_reminder_has_the_pay_button():
    template = t.payment_pending("Ada Obi", int(START.timestamp() * 1000), 600_000, "https://checkout.paystack.com/xyz789abc")
    assert template["name"] == "joy_payment_pending" and template["button"] == "xyz789abc"
    assert template["body"][2] == "₦6,000"


@pytest.mark.parametrize("url", ["", "https://evil.example/pay", "https://checkout.paystack.com/"])
def test_no_pay_button_without_a_real_checkout_link(url):
    assert t.payment_pending("Ada", int(START.timestamp() * 1000), 600_000, url) is None


def test_without_its_own_template_the_generic_one_carries_the_text(monkeypatch, sent):
    window(monkeypatch, False)
    tasks.send_whatsapp_text("+2348030000000", "Line one\nLine two", template=t.visit_reminder("online", "Ada", START, None))
    message = sent[0]["template"]
    assert message["name"] == "joy_booking_update"
    assert message["components"][0]["parameters"][0]["text"] == "Line one Line two"


def test_a_translated_chat_keeps_the_generic_template(monkeypatch, sent):
    window(monkeypatch, False)
    monkeypatch.setattr(tasks, "_localized", lambda phone, text: "Ẹ káàrọ̀")
    tasks.send_whatsapp_text("+2348030000000", "Good morning", template=t.exercise_reminder(["Heel slides"]))
    assert sent[0]["template"]["name"] == "joy_booking_update"


def test_home_visit_and_clinic_reminders_say_where():
    assert t.visit_reminder("home_visit", "Ada", START, None)["body"][3] == "your home"
    assert t.visit_reminder("clinic", "Ada", START, None)["body"][0] == "clinic visit"


def test_physio_message_needs_the_physio_name():
    assert t.physio_message(None, "Do the exercises twice") is None
    assert t.physio_message("Ada Obi", "Do the\nexercises twice")["body"] == ["Ada Obi", "Do the exercises twice"]


def test_a_queued_message_keeps_its_template(monkeypatch):
    pushed = []
    monkeypatch.setattr(tasks, "_redis", lambda: SimpleNamespace(lpush=lambda key, value: pushed.append((key, value))))
    tasks.enqueue_booking_confirmed("+234", "b1", "Confirmed", template=t.booking_confirmed("online", "Ada", START))
    assert '"joy_booking_confirmed"' in pushed[0][1]
