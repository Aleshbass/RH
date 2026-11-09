"""When the patient is free: the "When are you free?" step (Joy coordination spec, step 9).

[Today or tomorrow] [This week] [Choose a day]. "Choose a day" lists the next 7 days, and typed
answers work too ("Monday", "tomorrow", "10 Nov"). Each answer becomes a window RH's matching
searches (convex/joyMatching.ts): physios free inside it, from 2 hours from now at the earliest.
Urgent patients skip the question and see today or tomorrow only.
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass
from datetime import date, datetime, time, timedelta, timezone

LAGOS = timezone(timedelta(hours=1))
# RH needs 2 hours' notice plus a margin (convex/joyMatching.ts NOTICE_MS)
_NOTICE = timedelta(hours=2, minutes=5)
_DAYS_AHEAD = 7

TIMING_TEXT = "When are you free for your video consultation?"
DAY_TEXT = "Which day suits you? Tap *Choose a day*, or type one, like *Monday*."
TIMING_SOON, TIMING_WEEK, TIMING_CHOOSE = "today or tomorrow", "this week", "choose a day"

_WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
_MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")


@dataclass(frozen=True)
class Window:
    within_hours: int
    label: str  # "today or tomorrow", "this week", "on Monday 10 November"
    not_before_ms: int | None = None
    kind: str = "soon"  # soon | week | day

    def as_dict(self) -> dict:
        return asdict(self)


def window_from(data: object) -> Window | None:
    if not isinstance(data, dict):
        return None
    try:
        return Window(
            within_hours=int(data["within_hours"]), label=str(data["label"]),
            not_before_ms=int(data["not_before_ms"]) if data.get("not_before_ms") is not None else None,
            kind=str(data.get("kind") or "soon"),
        )
    except (KeyError, TypeError, ValueError):
        return None


def timing_buttons() -> dict:
    from app.conversation.interactive import reply_buttons

    return reply_buttons((TIMING_SOON, "Today or tomorrow"), (TIMING_WEEK, "This week"), (TIMING_CHOOSE, "Choose a day"))


def _now(now: datetime | None) -> datetime:
    return (now or datetime.now(timezone.utc)).astimezone(LAGOS)


def _hours_until(end: datetime, now: datetime) -> int:
    return max(3, math.ceil((end - now).total_seconds() / 3600))


def _end_of(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), time(0, 0), tzinfo=LAGOS)


def soon_window(now: datetime | None = None) -> Window:
    current = _now(now)
    return Window(_hours_until(_end_of(current.date() + timedelta(days=1)), current), "today or tomorrow", None, "soon")


def week_window(now: datetime | None = None) -> Window:
    return Window(_DAYS_AHEAD * 24, "in the next 7 days", None, "week")


def day_label(day: date, now: datetime | None = None) -> str:
    today = _now(now).date()
    if day == today:
        return "today"
    if day == today + timedelta(days=1):
        return "tomorrow"
    return f"on {day.strftime('%A')} {day.day} {day.strftime('%B')}"


def day_window(day: date, now: datetime | None = None) -> Window | None:
    """That day only, or None when it has no bookable time left (or is too far ahead)."""
    current = _now(now)
    if day < current.date() or day > current.date() + timedelta(days=_DAYS_AHEAD):
        return None
    end = _end_of(day)
    if end <= current + _NOTICE:
        return None
    start = datetime.combine(day, time(0, 0), tzinfo=LAGOS)
    not_before = int(start.timestamp() * 1000) if start > current else None
    return Window(_hours_until(end, current), day_label(day, current), not_before, "day")


def day_rows(now: datetime | None = None) -> list[tuple[str, str, str | None]]:
    """The next 7 days for the "Choose a day" list (titles fit WhatsApp's 24 characters)."""
    current = _now(now)
    rows = []
    for offset in range(_DAYS_AHEAD):
        day = current.date() + timedelta(days=offset)
        if day_window(day, current) is None:
            continue
        title = f"{day.strftime('%a')} {day.day} {day.strftime('%b')}"
        note = "Today" if offset == 0 else "Tomorrow" if offset == 1 else None
        rows.append((f"day:{day.isoformat()}", title, note))
    return rows


def day_menu(now: datetime | None = None) -> dict:
    from app.conversation.interactive import list_menu

    return list_menu("Choose a day", day_rows(now), section="Next 7 days")


def _norm(text: str | None) -> str:
    return " ".join((text or "").casefold().replace("’", "'").split()).strip(" .!?")


def parse_timing(text: str | None, now: datetime | None = None, *, days_shown: list[str] | None = None) -> str | date | None:
    """"soon" | "week" | "choose" | a date | None (not understood)."""
    current = _now(now)
    plain = _norm(text)
    if not plain:
        return None
    if plain.startswith("day:"):
        try:
            return date.fromisoformat(plain[4:])
        except ValueError:
            return None
    if days_shown and plain.isdigit() and 1 <= int(plain) <= len(days_shown):
        try:
            return date.fromisoformat(days_shown[int(plain) - 1][4:])
        except ValueError:
            return None
    if plain in {TIMING_CHOOSE, "choose day", "pick a day", "a day", "another day", "different day", "change day",
                 "change the day", "other day", "specific day", "choose"}:
        return "choose"
    if plain in {TIMING_SOON, "soon", "asap", "as soon as possible", "earliest", "now", "today/tomorrow",
                 "today or tmrw", "1", "the earliest"}:
        return "soon"
    if plain in {TIMING_WEEK, "week", "this week", "next 7 days", "any time", "anytime", "whenever", "any day",
                 "next week", "within the week", "2"}:
        return "week"
    if plain == "3":
        return "choose"
    if re.search(r"\btoday\b", plain) and not re.search(r"\btomorrow\b", plain):
        return current.date()
    if re.search(r"\b(?:tomorrow|tmrw|tomoro|tommorow|tomorow)\b", plain):
        return current.date() + timedelta(days=1)
    for index, name in enumerate(_WEEKDAYS):
        if re.search(rf"\b(?:{name}|{name[:3]})\b", plain):
            ahead = (index - current.weekday()) % 7
            if ahead == 0 and _end_of(current.date()) <= current + _NOTICE:
                ahead = 7  # "Monday" late on a Monday means next Monday
            return current.date() + timedelta(days=ahead)
    found = re.search(r"\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([a-z]{3})[a-z]*\b|\b([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b", plain)
    if found:
        day_text = found.group(1) or found.group(4)
        month_text = found.group(2) or found.group(3)
        if month_text in _MONTHS:
            month = _MONTHS.index(month_text) + 1
            year = current.year + (1 if month < current.month else 0)
            try:
                return date(year, month, int(day_text))
            except ValueError:
                return None
    if re.search(r"\b(?:this|next) week\b|\bweekend\b", plain):
        return "week"
    return None


def window_for(choice: str | date, now: datetime | None = None) -> Window | None:
    if choice == "soon":
        return soon_window(now)
    if choice == "week":
        return week_window(now)
    if isinstance(choice, date):
        return day_window(choice, now)
    return None
