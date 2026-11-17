"""Joy's approved UTILITY WhatsApp templates (Meta approved them on 16 Nov 2026).

WhatsApp delivers free text only within 24 hours of the patient's last message. After that,
only an approved template goes through. Each builder below returns the template for one kind
of message: {"name", "body": [the {{n}} values], "button": the URL suffix, if any}. It returns
None when it can't fill the template truthfully. The message then goes out on the generic
WHATSAPP_UPDATE_TEMPLATE with the whole text as {{1}} (app/queue/tasks.py send_whatsapp_text).

The templates are English only. A chat Joy translates keeps the generic template, which carries
the translated text.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

_LAGOS = ZoneInfo("Africa/Lagos")
JOIN_PREFIX = "https://physioaroundme.com/v/"  # joy_visit_reminder_online's button URL
PAY_PREFIX = "https://checkout.paystack.com/"  # joy_payment_pending's button URL
_SUFFIX_RE = re.compile(r"[A-Za-z0-9_-]{3,100}")


def _value(text: object, limit: int = 200) -> str | None:
    """A template value: one line, never empty (Meta rejects empty or multi-line values)."""
    flat = " ".join(str(text or "").split())
    return flat[:limit] if flat else None


def when_text(start: datetime | int | float) -> str:
    """'Mon 17 Nov, 10:00 AM' in Lagos time (the templates add "(Lagos time)" themselves)."""
    moment = start if isinstance(start, datetime) else datetime.fromtimestamp(float(start) / 1000, timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    local = moment.astimezone(_LAGOS)
    return f"{local.strftime('%a')} {local.day} {local.strftime('%b')}, {local.strftime('%I:%M %p').lstrip('0')}"


def _kind(service_mode: str | None) -> str:
    return {"online": "online consultation", "home_visit": "home visit", "clinic": "clinic visit"}.get(service_mode or "", "appointment")


def visit_reminder(service_mode: str | None, provider: str | None, session_start: datetime, meeting_url: str | None) -> dict | None:
    """The day-before, 30-minute and start reminders: with the Join button for a video call."""
    who = _value(provider, 80) or "your physiotherapist"
    when = when_text(session_start)
    if service_mode == "online":
        url = (meeting_url or "").strip()
        code = url[len(JOIN_PREFIX):] if url.startswith(JOIN_PREFIX) else ""
        if not _SUFFIX_RE.fullmatch(code):
            return None  # no joining link to put on the button: the generic template carries the text
        return {"name": "joy_visit_reminder_online", "body": ["online consultation", who, when], "button": code}
    place = {"home_visit": "your home", "clinic": "the clinic"}.get(service_mode or "", "the agreed place")
    return {"name": "joy_visit_reminder", "body": [_kind(service_mode), who, when, place]}


def payment_pending(provider: str | None, start: int | float | None, amount_kobo: object, url: str | None) -> dict | None:
    """A held time waiting for payment, with the Pay now button."""
    link = (url or "").strip()
    code = link[len(PAY_PREFIX):] if link.startswith(PAY_PREFIX) else ""
    if not _SUFFIX_RE.fullmatch(code) or not isinstance(start, (int, float)):
        return None
    if not isinstance(amount_kobo, (int, float)) or amount_kobo <= 0:
        return None
    amount = f"₦{int(amount_kobo) // 100:,}"
    return {"name": "joy_payment_pending", "body": [_value(provider, 80) or "your physiotherapist", when_text(start), amount], "button": code}


def booking_confirmed(service_mode: str | None, provider: str | None, session_start: datetime) -> dict:
    return {"name": "joy_booking_confirmed", "body": [_kind(service_mode), _value(provider, 80) or "your physiotherapist", when_text(session_start)]}


def physio_message(physio_name: str | None, message: str | None) -> dict | None:
    name, text = _value(physio_name, 80), _value(message, 700)
    if not name or not text:
        return None
    return {"name": "joy_physio_message", "body": [name, text]}


def exercise_reminder(names: list[str]) -> dict | None:
    joined = ", ".join(value for value in (_value(name, 60) for name in names) if value)
    if not joined:
        return None
    if len(joined) > 400:
        joined = joined[:399].rstrip(", ") + "…"
    return {"name": "joy_exercise_reminder", "body": [joined]}
