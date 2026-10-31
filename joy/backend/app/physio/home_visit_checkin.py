from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.booking.state import mark_completed
from app.models.booking import Booking
from app.models.types import BookingStatus

_CHECKIN_RE = re.compile(r"(?i)\bcheck[\s-]?in\b|\barrived\b|\bi(?:'m| am) here\b")
_COORDS_RE = re.compile(r"(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)")
_COMPLETE_RE = re.compile(r"(?i)^\s*(done|complete(?:d)?|finished)\s*[.!?]?\s*$")


def checkin(session: Session, booking_id: UUID | str, lat: float, lng: float) -> Booking:
    booking = _require_confirmed(session, booking_id, action="check-in")
    booking.checkin_at = datetime.now(timezone.utc)
    booking.checkin_lat = lat
    booking.checkin_lng = lng
    session.flush()
    return booking


def complete(session: Session, booking_id: UUID | str) -> Booking:
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise ValueError(f"booking not found: {booking_id}")
    if booking.status != BookingStatus.CONFIRMED:
        raise ValueError("complete requires confirmed")
    booking.completed_at = datetime.now(timezone.utc)
    mark_completed(booking)
    from app.partner.fee_confirmation import confirm_first_session_fee

    confirm_first_session_fee(session, booking.id)
    return booking


def apply_checkin_turn(
    session: Session,
    physio_id: UUID,
    text: str,
    location: tuple[float, float] | None = None,
) -> str | None:
    booking = _latest_confirmed_booking(session, physio_id)
    if location is not None:
        if booking is None or booking.mode != "home_visit":
            return None
        lat, lng = location
        checkin(session, booking.id, lat, lng)
        return f"Checked in at {lat}, {lng}."
    if _COMPLETE_RE.search(text or ""):
        if booking is None:
            return None
        complete(session, booking.id)
        return "Session marked complete."
    if _CHECKIN_RE.search(text or ""):
        if booking is None:
            return None
        coords = _COORDS_RE.search(text or "")
        if coords is None:
            return "Send your check-in with location, for example: check in 6.5244 3.3792"
        lat = float(coords.group(1))
        lng = float(coords.group(2))
        checkin(session, booking.id, lat, lng)
        return f"Checked in at {lat}, {lng}."
    return None


def _require_confirmed(session: Session, booking_id: UUID | str, *, action: str) -> Booking:
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise ValueError(f"booking not found: {booking_id}")
    if booking.status != BookingStatus.CONFIRMED:
        raise ValueError(f"{action} requires confirmed")
    return booking


def _latest_confirmed_booking(session: Session, physio_id: UUID) -> Booking | None:
    return session.scalar(
        select(Booking)
        .where(
            Booking.physio_id == physio_id,
            Booking.status == BookingStatus.CONFIRMED,
        )
        .order_by(Booking.created_at.desc())
    )
