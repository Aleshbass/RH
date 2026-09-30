"""Patient-facing appointment wording and durable reminder scheduling."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.appointment_reminder import AppointmentReminder
from app.models.patient import Patient

LAGOS = ZoneInfo("Africa/Lagos")
REMINDER_LEAD = timedelta(minutes=30)


def appointment_start_from_ms(value: int | float) -> datetime:
    return datetime.fromtimestamp(float(value) / 1000, tz=timezone.utc)


def _ordinal(day: int) -> str:
    suffix = "th" if 10 <= day % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix}"


def format_lagos_appointment_time(session_start: datetime) -> str:
    local = session_start.astimezone(LAGOS)
    hour = local.hour % 12 or 12
    meridiem = "am" if local.hour < 12 else "pm"
    minute = "" if local.minute == 0 else f":{local.minute:02d}"
    return f"{_ordinal(local.day)} {local.strftime('%b')} at {hour}{minute}{meridiem} WAT"


def format_duration(duration_minutes: int) -> str:
    if duration_minutes == 60:
        return "1 hour"
    if duration_minutes % 60 == 0:
        hours = duration_minutes // 60
        return f"{hours} hours"
    return f"{duration_minutes} minutes"


def appointment_confirmation_text(
    *, provider_name: str, session_start: datetime, duration_minutes: int, service_mode: str,
    booking_code: str, meeting_url: str | None = None,
) -> str:
    mode = "online " if service_mode == "online" else ""
    lines = [
        f"Your {mode}appointment with {provider_name} is on "
        f"{format_lagos_appointment_time(session_start)} and will last {format_duration(duration_minutes)}.",
        f"Your booking code is: {booking_code}.",
    ]
    if meeting_url:
        lines.append(f"Join securely here: {meeting_url}")
    lines.extend([
        "Please join a few minutes early. Missed appointments are not refundable.",
        "Looking forward to supporting your recovery — see you then!",
    ])
    return "\n\n".join(lines)


def appointment_reminder_text(reminder: AppointmentReminder) -> str:
    mode = "online " if reminder.service_mode == "online" else ""
    return (
        f"Reminder: your {mode}appointment with {reminder.provider_name} starts in 30 minutes "
        f"at {format_lagos_appointment_time(reminder.session_start)}. "
        f"Your booking code is {reminder.rh_booking_id}. "
        "Please join or arrive a few minutes early."
    )


def schedule_appointment_reminder(
    session: Session,
    *,
    rh_booking_id: str,
    patient: Patient,
    email: str | None,
    provider_name: str,
    service_mode: str,
    session_start: datetime,
    duration_minutes: int,
) -> AppointmentReminder:
    """Create/update exactly one reminder for an RH booking.

    The schedule lives in Postgres, rather than a process timer, so a worker
    restart cannot lose a patient reminder.
    """
    reminder = session.scalar(
        select(AppointmentReminder).where(AppointmentReminder.rh_booking_id == rh_booking_id)
    )
    if reminder is None:
        reminder = AppointmentReminder(
            rh_booking_id=rh_booking_id,
            patient_id=patient.id,
            phone_e164=patient.phone_e164,
            email=email,
            provider_name=provider_name,
            service_mode=service_mode,
            session_start=session_start,
            reminder_at=session_start - REMINDER_LEAD,
            duration_minutes=duration_minutes,
            status="pending",
        )
        session.add(reminder)
        return reminder
    if reminder.status != "sent":
        reminder.phone_e164 = patient.phone_e164
        reminder.email = email
        reminder.provider_name = provider_name
        reminder.service_mode = service_mode
        reminder.session_start = session_start
        reminder.reminder_at = session_start - REMINDER_LEAD
        reminder.duration_minutes = duration_minutes
    return reminder
