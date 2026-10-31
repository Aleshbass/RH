from __future__ import annotations

import re
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.availability_slot import AvailabilitySlot
from app.models.booking import Booking
from app.models.conversation import Conversation
from app.models.types import BookingStatus

_DAY_ALIAS = {
    "mon": 0,
    "monday": 0,
    "tue": 1,
    "tues": 1,
    "tuesday": 1,
    "wed": 2,
    "wednesday": 2,
    "thu": 3,
    "thur": 3,
    "thurs": 3,
    "thursday": 3,
    "fri": 4,
    "friday": 4,
    "sat": 5,
    "saturday": 5,
    "sun": 6,
    "sunday": 6,
}
_DAY_NAMES = (
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
)
_DAY = (
    r"mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|"
    r"thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?"
)
_RANGE_RE = re.compile(rf"(?i)\b({_DAY})\s*(?:-|to)\s*({_DAY})\b")
_SINGLE_RE = re.compile(rf"(?i)\b({_DAY})\b")
_HOURS_RE = re.compile(
    r"(?i)(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?"
)
_CONFIRM_RE = re.compile(r"^\s*(yes|yeah|yep)\b", re.IGNORECASE)
_SCHEDULE_INTENT_RE = re.compile(
    r"(?i)\b(free|available|availability|hours|schedule|calendar)\b"
)

PENDING_WINDOWS_KEY = "pending_availability_windows"
_LOOKAHEAD_DAYS = 21
_SLOT_HOURS = 1
_LAGOS = ZoneInfo("Africa/Lagos")


@dataclass(frozen=True)
class WeeklyWindow:
    weekday: int
    start_hhmm: str
    end_hhmm: str


def parse_availability(text: str) -> list[WeeklyWindow]:
    hours = _parse_hours(text or "")
    days = _parse_days(text or "")
    if hours is None or not days:
        return []
    start_hhmm, end_hhmm = hours
    return [
        WeeklyWindow(weekday=day, start_hhmm=start_hhmm, end_hhmm=end_hhmm) for day in days
    ]


def write_slots(session: Session, physio_id: UUID, windows: list[WeeklyWindow]) -> None:
    session.execute(delete(AvailabilitySlot).where(AvailabilitySlot.physio_id == physio_id))
    for window in windows:
        session.add(
            AvailabilitySlot(
                physio_id=physio_id,
                weekday=window.weekday,
                start_hhmm=window.start_hhmm,
                end_hhmm=window.end_hhmm,
            )
        )
    session.flush()


def next_open_slot(session: Session, physio_id: UUID, *, now: datetime | None = None) -> datetime | None:
    windows = session.scalars(
        select(AvailabilitySlot).where(AvailabilitySlot.physio_id == physio_id)
    ).all()
    if not windows:
        return None

    occupied = [
        _as_utc(row.slot_start)
        for row in session.scalars(
            select(Booking).where(
                Booking.physio_id == physio_id,
                Booking.status == BookingStatus.CONFIRMED,
                Booking.slot_start.is_not(None),
            )
        ).all()
        if row.slot_start is not None
    ]

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(_LAGOS)
    duration = timedelta(hours=_SLOT_HOURS)
    for offset in range(_LOOKAHEAD_DAYS + 1):
        day = current.date() + timedelta(days=offset)
        weekday = day.weekday()
        for window in windows:
            if window.weekday != weekday:
                continue
            start = datetime.combine(day, _hhmm_time(window.start_hhmm), tzinfo=_LAGOS)
            end = datetime.combine(day, _hhmm_time(window.end_hhmm), tzinfo=_LAGOS)
            cursor = start
            while cursor < end:
                if cursor >= current and not _overlaps(cursor, duration, occupied):
                    return cursor
                cursor += duration
    return None


def recap_windows(windows: list[WeeklyWindow]) -> str:
    return _format_windows(windows)


def apply_availability_turn(
    session: Session,
    physio_id: UUID,
    text: str,
    conversation: Conversation,
) -> str | None:
    parsed = parse_availability(text)
    if parsed and _is_schedule_intent(text):
        _set_pending(conversation, parsed)
        schedule = _format_windows(parsed)
        return (
            f"I heard {schedule}. Reply yes to save that on your calendar."
        )

    pending = _pending_windows(conversation)
    if pending and _CONFIRM_RE.search(text or ""):
        write_slots(session, physio_id, pending)
        _clear_pending(conversation)
        schedule = _format_windows(pending)
        return f"Saved. You're free {schedule}."

    if pending:
        _clear_pending(conversation)

    return None


def _is_schedule_intent(text: str) -> bool:
    return bool(_SCHEDULE_INTENT_RE.search(text or ""))


def _parse_days(text: str) -> list[int]:
    ranged = _RANGE_RE.search(text)
    if ranged is not None:
        start = _day_index(ranged.group(1))
        end = _day_index(ranged.group(2))
        if start <= end:
            return list(range(start, end + 1))
        return list(range(start, 7)) + list(range(0, end + 1))

    days: list[int] = []
    for match in _SINGLE_RE.finditer(text):
        day = _day_index(match.group(1))
        if day not in days:
            days.append(day)
    return days


def _parse_hours(text: str) -> tuple[str, str] | None:
    match = _HOURS_RE.search(text)
    if match is None:
        return None
    start_hour = int(match.group(1))
    start_minute = int(match.group(2) or 0)
    start_mer = (match.group(3) or "").lower()
    end_hour = int(match.group(4))
    end_minute = int(match.group(5) or 0)
    end_mer = (match.group(6) or "").lower()
    start = _to_minutes(start_hour, start_minute, start_mer, is_end=False, other=None)
    end = _to_minutes(end_hour, end_minute, end_mer, is_end=True, other=start)
    return _fmt_hhmm(start), _fmt_hhmm(end)


def _to_minutes(
    hour: int, minute: int, meridiem: str, *, is_end: bool, other: int | None
) -> int:
    hour = hour % 24
    if meridiem == "pm" and hour != 12:
        hour += 12
    elif meridiem == "am" and hour == 12:
        hour = 0
    elif not meridiem and is_end and other is not None:
        start_hour = other // 60
        if hour <= start_hour and hour < 12:
            hour += 12
    return hour * 60 + minute


def _fmt_hhmm(total_minutes: int) -> str:
    hour, minute = divmod(total_minutes, 60)
    hour = hour % 24
    return f"{hour:02d}:{minute:02d}"


def _day_index(token: str) -> int:
    key = token.lower()
    if key in _DAY_ALIAS:
        return _DAY_ALIAS[key]
    for alias, value in _DAY_ALIAS.items():
        if key.startswith(alias[:3]):
            return value
    raise ValueError(f"unknown weekday {token!r}")


def _format_windows(windows: list[WeeklyWindow]) -> str:
    if not windows:
        return ""
    days = [window.weekday for window in windows]
    names = [_DAY_NAMES[day] for day in days]
    start = windows[0].start_hhmm
    end = windows[0].end_hhmm
    consecutive = days == list(range(days[0], days[-1] + 1))
    if consecutive and len(names) > 1:
        day_part = f"{names[0]} to {names[-1]}"
    elif len(names) == 1:
        day_part = names[0]
    else:
        day_part = ", ".join(names[:-1]) + f" and {names[-1]}"
    return f"{day_part}, {start} to {end}"


def _pending_windows(conversation: Conversation) -> list[WeeklyWindow]:
    raw = (conversation.booking_context or {}).get(PENDING_WINDOWS_KEY) or []
    out: list[WeeklyWindow] = []
    for item in raw:
        out.append(
            WeeklyWindow(
                weekday=int(item["weekday"]),
                start_hhmm=str(item["start_hhmm"]),
                end_hhmm=str(item["end_hhmm"]),
            )
        )
    return out


def _set_pending(conversation: Conversation, windows: list[WeeklyWindow]) -> None:
    ctx = dict(conversation.booking_context or {})
    ctx[PENDING_WINDOWS_KEY] = [asdict(window) for window in windows]
    conversation.booking_context = ctx


def _clear_pending(conversation: Conversation) -> None:
    ctx = dict(conversation.booking_context or {})
    ctx.pop(PENDING_WINDOWS_KEY, None)
    conversation.booking_context = ctx or None


def _hhmm_time(value: str):
    hour_s, minute_s = value.split(":")
    return datetime.min.replace(hour=int(hour_s), minute=int(minute_s)).time()


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _overlaps(start: datetime, duration: timedelta, occupied: list[datetime]) -> bool:
    end = start + duration
    for taken in occupied:
        if start <= taken < end:
            return True
    return False
