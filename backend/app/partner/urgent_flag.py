from uuid import UUID

from sqlalchemy.orm import Session

from app.models.patient import Patient


def flag_urgent(session: Session, patient_id: UUID, partner_id: UUID) -> Patient | None:
    patient = session.get(Patient, patient_id)
    if patient is None:
        return None
    if patient.referred_by_partner_id != partner_id:
        return None
    patient.urgent = True
    session.flush()
    return patient
