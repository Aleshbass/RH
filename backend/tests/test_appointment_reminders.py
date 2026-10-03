from datetime import datetime, timezone
from types import SimpleNamespace

from app.booking.appointment_reminders import (
    AT_APPOINTMENT_START,
    appointment_confirmation_text,
    appointment_reminder_text,
    appointment_rescheduled_text,
    format_lagos_appointment_time,
)
from app.booking.booking_flow import _treatment_option, treatment_options_prompt


def test_confirmation_text_has_provider_lagos_time_duration_and_link():
    start = datetime(2026, 10, 1, 11, 0, tzinfo=timezone.utc)

    text = appointment_confirmation_text(
        provider_name="Test Chidi Nwosu",
        session_start=start,
        duration_minutes=60,
        service_mode="online",
        booking_code="w97a9h3h9yp13q18pbezxjb3ss8fdspj",
        meeting_url="https://rehabifyhealth.com/video-call/joy-123",
    )

    assert format_lagos_appointment_time(start) == "1st Oct at 12pm WAT"
    assert "Test Chidi Nwosu" in text
    assert "1st Oct at 12pm WAT" in text
    assert "1 hour" in text
    assert "w97a9h3h9yp13q18pbezxjb3ss8fdspj" in text
    assert "https://rehabifyhealth.com/video-call/joy-123" in text
    assert "not refundable" in text


def test_treatment_options_default_help_to_quick_consultation():
    prompt = treatment_options_prompt("Low back pain for 3 weeks.")
    assert "Quick Initial Consultation" in prompt
    assert "₦6,000" in prompt
    assert "Full Virtual Consultation" in prompt
    assert "₦15,000" in prompt
    assert _treatment_option("help me choose") == "quick_initial"
    assert _treatment_option("2") == "full_virtual"
    assert _treatment_option("3") == "home_visit"


def test_start_time_reminder_says_the_appointment_starts_now():
    reminder = SimpleNamespace(
        reminder_kind=AT_APPOINTMENT_START,
        service_mode="online",
        provider_name="Test Ada Okafor",
        rh_booking_id="JOY-TEST-123",
    )

    text = appointment_reminder_text(reminder)

    assert "starts now" in text
    assert "Test Ada Okafor" in text
    assert "JOY-TEST-123" in text


def test_rescheduled_message_has_the_new_appointment_details():
    text = appointment_rescheduled_text(
        provider_name="Test Ada Okafor",
        session_start=datetime(2026, 10, 1, 11, 0, tzinfo=timezone.utc),
        duration_minutes=20,
        service_mode="online",
        booking_code="JOY-TEST-123",
    )

    assert "rescheduled" in text
    assert "1st Oct at 12pm WAT" in text
    assert "20 minutes" in text
