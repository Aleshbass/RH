from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.internal.auth import require_internal_key
from app.db import get_session
from app.models.booking import Booking
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import BookingStatus

router = APIRouter(dependencies=[Depends(require_internal_key)])

_PAID = frozenset({BookingStatus.CONFIRMED, BookingStatus.COMPLETED})


@router.get("/api/internal/receipts/{booking_id}")
def get_receipt(booking_id: UUID, session: Session = Depends(get_session)) -> dict:
    booking = session.get(Booking, booking_id)
    if booking is None or booking.status not in _PAID:
        raise HTTPException(status_code=404, detail="receipt not found")
    patient = session.get(Patient, booking.patient_id)
    physio = session.get(Physiotherapist, booking.physio_id)
    paid_at = booking.confirmed_at or booking.completed_at or booking.created_at
    return {
        "amount_kobo": booking.amount_kobo,
        "paid_at": paid_at.isoformat() if paid_at else None,
        "patient_name": (patient.name if patient is not None else None) or "",
        "physio_name": (physio.phone_e164 if physio is not None else None) or "",
        "reference": booking.paystack_reference,
    }
