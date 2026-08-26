from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.internal.auth import require_internal_key
from app.db import get_session
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.referral_fee import ReferralFee

router = APIRouter(dependencies=[Depends(require_internal_key)])


def _patient_row(patient: Patient) -> dict:
    return {
        "id": str(patient.id),
        "phone_e164": patient.phone_e164,
        "name": patient.name,
        "referred_by_partner_id": str(patient.referred_by_partner_id)
        if patient.referred_by_partner_id
        else None,
        "urgent": patient.urgent,
        "created_at": patient.created_at.isoformat() if patient.created_at else None,
    }


def _fee_row(fee: ReferralFee) -> dict:
    return {
        "id": str(fee.id),
        "patient_id": str(fee.patient_id),
        "booking_id": str(fee.booking_id),
        "amount_kobo": fee.amount_kobo,
        "created_at": fee.created_at.isoformat() if fee.created_at else None,
    }


@router.get("/api/internal/partners/{partner_id}/referrals")
def list_partner_referrals(
    partner_id: UUID,
    session: Session = Depends(get_session),
) -> dict:
    partner = session.get(Partner, partner_id)
    if partner is None:
        raise HTTPException(status_code=404, detail="partner not found")
    patients = session.scalars(
        select(Patient)
        .where(Patient.referred_by_partner_id == partner_id)
        .order_by(Patient.created_at.asc(), Patient.id.asc())
    ).all()
    fees = session.scalars(
        select(ReferralFee)
        .where(ReferralFee.partner_id == partner_id)
        .order_by(ReferralFee.created_at.asc(), ReferralFee.id.asc())
    ).all()
    return {
        "patients": [_patient_row(row) for row in patients],
        "fees": [_fee_row(row) for row in fees],
    }
