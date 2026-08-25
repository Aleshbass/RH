from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, object_session

from app.models.booking import Booking
from app.models.types import BookingStatus

_WEBHOOK_SOURCE = "paystack_webhook"
_CONFIRMABLE = frozenset({BookingStatus.AWAITING_PAYMENT, BookingStatus.PROCESSING})
_CANCELLABLE = frozenset(
    {
        BookingStatus.DRAFT,
        BookingStatus.AWAITING_PAYMENT,
        BookingStatus.PROCESSING,
        BookingStatus.CONFIRMED,
    }
)
_ACTIVE = frozenset(
    {
        BookingStatus.DRAFT,
        BookingStatus.AWAITING_PAYMENT,
        BookingStatus.PROCESSING,
        BookingStatus.CONFIRMED,
    }
)


def get_active_booking(session: Session, patient_id: UUID) -> Booking | None:
    return session.scalar(
        select(Booking).where(
            Booking.patient_id == patient_id,
            Booking.status.in_(list(_ACTIVE)),
        )
    )


def create_draft(
    session: Session,
    patient_id: UUID,
    physio_id: UUID,
    mode: str,
    *,
    slot_start: datetime | None = None,
    amount_kobo: int,
) -> Booking:
    if get_active_booking(session, patient_id) is not None:
        raise RuntimeError("patient already has an active booking")
    booking = Booking(
        patient_id=patient_id,
        physio_id=physio_id,
        mode=mode,
        slot_start=slot_start,
        status=BookingStatus.DRAFT,
        amount_kobo=amount_kobo,
    )
    session.add(booking)
    session.flush()
    return booking


def mark_awaiting_payment(booking: Booking, reference: str) -> None:
    if booking.status != BookingStatus.DRAFT:
        raise RuntimeError(
            f"cannot mark awaiting_payment from status {booking.status}"
        )
    booking.status = BookingStatus.AWAITING_PAYMENT
    booking.paystack_reference = reference
    _flush(booking)


def mark_processing(booking: Booking) -> None:
    if booking.status != BookingStatus.AWAITING_PAYMENT:
        raise RuntimeError(f"cannot mark processing from status {booking.status}")
    booking.status = BookingStatus.PROCESSING
    _flush(booking)


def advance_to_confirmed(session: Session, booking_id: UUID | str, *, source: str) -> None:
    if source != _WEBHOOK_SOURCE:
        raise RuntimeError("booking status advances on webhooks only")
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise RuntimeError(f"booking not found: {booking_id}")
    if booking.status not in _CONFIRMABLE:
        raise RuntimeError(f"cannot confirm booking in status {booking.status}")
    booking.status = BookingStatus.CONFIRMED
    session.flush()


def cancel(booking: Booking) -> None:
    if booking.status not in _CANCELLABLE:
        raise RuntimeError(f"cannot cancel booking in status {booking.status}")
    booking.status = BookingStatus.CANCELLED
    _flush(booking)


def _flush(booking: Booking) -> None:
    session = object_session(booking)
    if session is not None:
        session.flush()
