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
THIRTY_MINUTES_BEFORE = "thirty_minutes_before"
AT_APPOINTMENT_START = "at_appointment_start"


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
    attendance_instruction = "Please join now." if reminder.service_mode == "online" else "Please arrive now."
    early_instruction = "Please join a few minutes early." if reminder.service_mode == "online" else "Please arrive a few minutes early."
    if reminder.reminder_kind == AT_APPOINTMENT_START:
        return (
            f"Your {mode}appointment with {reminder.provider_name} starts now. "
            f"Your booking code is {reminder.rh_booking_id}. "
            f"{attendance_instruction}"
        )
    return (
        f"Reminder: your {mode}appointment with {reminder.provider_name} starts in 30 minutes "
        f"at {format_lagos_appointment_time(reminder.session_start)}. "
        f"Your booking code is {reminder.rh_booking_id}. "
        f"{early_instruction}"
    )


def appointment_rescheduled_text(
    *, provider_name: str, session_start: datetime, duration_minutes: int, service_mode: str, booking_code: str,
) -> str:
    mode = "online " if service_mode == "online" else ""
    return (
        f"Your {mode}appointment with {provider_name} has been rescheduled to "
        f"{format_lagos_appointment_time(session_start)} and will last {format_duration(duration_minutes)}. "
        f"Your booking code is: {booking_code}. Your secure joining link remains the same."
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
) -> list[AppointmentReminder]:
    """Create/update the 30-minute and appointment-start reminders for an RH booking.

    The schedule lives in Postgres, rather than a process timer, so a worker
    restart cannot lose a patient reminder.
    """
    existing = {
        reminder.reminder_kind: reminder
        for reminder in session.scalars(
            select(AppointmentReminder).where(AppointmentReminder.rh_booking_id == rh_booking_id)
        ).all()
    }
    now = datetime.now(timezone.utc)
    reminders: list[AppointmentReminder] = []
    for kind, reminder_at in (
        (THIRTY_MINUTES_BEFORE, session_start - REMINDER_LEAD),
        (AT_APPOINTMENT_START, session_start),
    ):
        reminder = existing.get(kind)
        if reminder is None:
            # A booking made less than 30 minutes before its start cannot get a
            # truthful 30-minute reminder; it still receives the start-time one.
            reminder = AppointmentReminder(
                rh_booking_id=rh_booking_id,
                reminder_kind=kind,
                patient_id=patient.id,
                phone_e164=patient.phone_e164,
                email=email,
                provider_name=provider_name,
                service_mode=service_mode,
                session_start=session_start,
                reminder_at=reminder_at,
                duration_minutes=duration_minutes,
                status="skipped" if kind == THIRTY_MINUTES_BEFORE and reminder_at <= now else "pending",
            )
            session.add(reminder)
        elif reminder.status != "sent":
            reminder.phone_e164 = patient.phone_e164
            reminder.email = email
            reminder.provider_name = provider_name
            reminder.service_mode = service_mode
            reminder.session_start = session_start
            reminder.reminder_at = reminder_at
            reminder.duration_minutes = duration_minutes
        elif reminder.session_start != session_start:
            # A moved appointment needs fresh notifications at its new times;
            # the previous delivery remains visible in the audit log.
            reminder.phone_e164 = patient.phone_e164
            reminder.email = email
            reminder.provider_name = provider_name
            reminder.service_mode = service_mode
            reminder.session_start = session_start
            reminder.reminder_at = reminder_at
            reminder.duration_minutes = duration_minutes
            reminder.status = "skipped" if kind == THIRTY_MINUTES_BEFORE and reminder_at <= now else "pending"
            reminder.whatsapp_sent_at = None
            reminder.email_sent_at = None
            reminder.sent_at = None
        reminders.append(reminder)
    return reminders
