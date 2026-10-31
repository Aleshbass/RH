from uuid import UUID

from sqlalchemy.orm import Session

from app.audit.logger import append
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.types import AuditKind


def flag_urgent(session: Session, patient_id: UUID, partner_id: UUID) -> Patient | None:
    patient = session.get(Patient, patient_id)
    if patient is None:
        return None
    if patient.referred_by_partner_id != partner_id:
        return None
    partner = session.get(Partner, partner_id)
    if partner is None:
        return None
    patient.urgent = True
    append(
        session,
        kind=AuditKind.IDENTITY,
        actor_phone=partner.phone_e164,
        person_id=patient.id,
        payload={
            "decision": "flag_urgent",
            "partner_id": str(partner_id),
            "patient_id": str(patient.id),
        },
    )
    session.flush()
    return patient
