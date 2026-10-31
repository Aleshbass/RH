from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.booking import Booking
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.referral_fee import ReferralFee
from app.models.types import AuditKind, BookingStatus
from app.partner.referral import send_partner_notice

FIRST_SESSION_FEE_KOBO = 200000

_FEE_NOTICE = (
    "The ₦2,000 referral fee for {name} is confirmed. Their first session is complete."
)


def confirm_first_session_fee(session: Session, booking_id: UUID | str) -> ReferralFee | None:
    booking = session.get(Booking, booking_id)
    if booking is None:
        return None
    if booking.status != BookingStatus.COMPLETED:
        return None
    if not booking.paystack_reference:
        return None
    patient = session.get(Patient, booking.patient_id)
    if patient is None or patient.referred_by_partner_id is None:
        return None
    existing = session.scalar(
        select(ReferralFee).where(ReferralFee.patient_id == patient.id)
    )
    if existing is not None:
        return None
    partner = session.get(Partner, patient.referred_by_partner_id)
    if partner is None:
        return None
    fee = ReferralFee(
        patient_id=patient.id,
        partner_id=partner.id,
        booking_id=booking.id,
        amount_kobo=FIRST_SESSION_FEE_KOBO,
    )
    session.add(fee)
    session.flush()
    append(
        session,
        kind=AuditKind.REFERRAL_FEE,
        actor_phone=partner.phone_e164,
        person_id=patient.id,
        payload={
            "decision": "confirmed",
            "referral_fee_id": str(fee.id),
            "partner_id": str(partner.id),
            "booking_id": str(booking.id),
            "amount_kobo": FIRST_SESSION_FEE_KOBO,
        },
    )
    name = (patient.name or "").strip() or patient.phone_e164
    send_partner_notice(session, partner, _FEE_NOTICE.format(name=name))
    return fee
