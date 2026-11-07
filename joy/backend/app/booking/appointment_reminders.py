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
    booking_code: str | None, meeting_url: str | None = None, receipt_url: str | None = None,
) -> str:
    mode = "online " if service_mode == "online" else ""
    how = {"online": "💻 Online video call", "home_visit": "🏠 Home visit"}.get(service_mode, "🏥 Clinic visit")
    details = [
        f"📅 {format_lagos_appointment_time(session_start)} ({format_duration(duration_minutes)})",
        f"🩺 {provider_name}",
        how,
    ]
    if booking_code:
        details.append(f"🔖 Booking code: {booking_code}")
    if receipt_url:
        details.append(f"🧾 Receipt: {receipt_url}")
    lines = [
        f"✅ Your {mode}appointment is booked.",
        "\n".join(details),
    ]
    if meeting_url:
        # Every booking has a /v/<code> page, but only online visits have a call to join.
        lines.append(f"Join securely here: {meeting_url}" if service_mode == "online" else f"Your booking details: {meeting_url}")
    lines.append(
        "Before your appointment:\n"
        "• Wear comfortable clothing\n"
        "• Have any scans, reports or a list of your medicines ready\n"
        f"• {_early_instruction(service_mode)}\n"
        "• Reply *RESCHEDULE* if you need to change the time"
    )
    lines.append("Missed appointments are not refundable. Looking forward to supporting your recovery!")
    return "\n\n".join(lines)


def _early_instruction(service_mode: str) -> str:
    if service_mode == "online":
        return "Please join a few minutes early."
    if service_mode == "home_visit":
        return "Please be ready a few minutes before your physiotherapist arrives."
    return "Please arrive a few minutes early."


def appointment_reminder_text(reminder: AppointmentReminder) -> str:
    mode = "online " if reminder.service_mode == "online" else ""
    attendance_instruction = (
        "Please join now." if reminder.service_mode == "online"
        else "Your physiotherapist is on the way." if reminder.service_mode == "home_visit"
        else "Please arrive now."
    )
    early_instruction = _early_instruction(reminder.service_mode)
    if reminder.reminder_kind == AT_APPOINTMENT_START:
        text = (
            f"Your {mode}appointment with {reminder.provider_name} starts now. "
            f"{attendance_instruction}"
        )
    else:
        text = (
        f"Reminder: your {mode}appointment with {reminder.provider_name} starts in 30 minutes "
        f"at {format_lagos_appointment_time(reminder.session_start)}. "
        f"{early_instruction}"
        )
    if reminder.booking_code:
        text += f" Your booking code is {reminder.booking_code}."
    if reminder.meeting_url:
        text += f" Join here: {reminder.meeting_url}" if reminder.service_mode == "online" else f" Booking details: {reminder.meeting_url}"
    return text


def appointment_rescheduled_text(
    *, provider_name: str, session_start: datetime, duration_minutes: int, service_mode: str, booking_code: str | None,
    meeting_url: str | None = None,
) -> str:
    mode = "online " if service_mode == "online" else ""
    return (
        f"Your {mode}appointment with {provider_name} has been rescheduled to "
        f"{format_lagos_appointment_time(session_start)} and will last {format_duration(duration_minutes)}. "
        + (f" Your booking code is: {booking_code}." if booking_code else "")
        + _rescheduled_link_text(service_mode, meeting_url)
    )


def _rescheduled_link_text(service_mode: str, meeting_url: str | None) -> str:
    if service_mode == "online":
        return f" Join securely here: {meeting_url}" if meeting_url else " Your secure joining link remains the same."
    return f" Booking details: {meeting_url}" if meeting_url else ""


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
    booking_code: str | None = None,
    meeting_url: str | None = None,
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
                booking_code=booking_code,
                meeting_url=meeting_url,
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
            reminder.booking_code = booking_code
            reminder.meeting_url = meeting_url
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
            reminder.booking_code = booking_code
            reminder.meeting_url = meeting_url
            reminder.status = "skipped" if kind == THIRTY_MINUTES_BEFORE and reminder_at <= now else "pending"
            reminder.whatsapp_sent_at = None
            reminder.email_sent_at = None
            reminder.sent_at = None
        reminders.append(reminder)
    return reminders
