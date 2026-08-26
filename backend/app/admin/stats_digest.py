from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.booking import Booking
from app.models.physiotherapist import Physiotherapist
from app.models.types import BookingStatus

_REVENUE_STATUSES = (BookingStatus.CONFIRMED, BookingStatus.COMPLETED)


def digest(session: Session) -> str:
    bookings_count = session.scalar(
        select(func.count()).select_from(Booking).where(Booking.status.in_(_REVENUE_STATUSES))
    ) or 0
    revenue_kobo = session.scalar(
        select(func.coalesce(func.sum(Booking.amount_kobo), 0)).where(
            Booking.status.in_(_REVENUE_STATUSES)
        )
    ) or 0
    active_physios = session.scalar(
        select(func.count()).select_from(Physiotherapist).where(
            (Physiotherapist.verified.is_(True))
            | (Physiotherapist.onboarding_status == "verified")
        )
    ) or 0
    return (
        f"{bookings_count} bookings, revenue_kobo {int(revenue_kobo)}, "
        f"{int(active_physios)} active physios"
    )
