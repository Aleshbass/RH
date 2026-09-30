from datetime import datetime, timezone

from app.booking.appointment_reminders import (
    appointment_confirmation_text,
    format_lagos_appointment_time,
)


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
