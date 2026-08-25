from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.family_member import FamilyMember
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import Identity, Persona


def resolve(session: Session, phone_e164: str) -> Identity | None:
    admin = session.scalar(select(Admin).where(Admin.phone_e164 == phone_e164))
    if admin is not None:
        return Identity(persona=Persona.ADMIN, person_id=admin.id, phone_e164=phone_e164)

    partner = session.scalar(select(Partner).where(Partner.phone_e164 == phone_e164))
    if partner is not None:
        return Identity(persona=Persona.PARTNER, person_id=partner.id, phone_e164=phone_e164)

    physio = session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone_e164))
    if physio is not None:
        return Identity(persona=Persona.PHYSIO, person_id=physio.id, phone_e164=phone_e164)

    family = session.scalar(
        select(FamilyMember).where(
            FamilyMember.phone_e164 == phone_e164,
            FamilyMember.revoked_at.is_(None),
        )
    )
    if family is not None:
        return Identity(
            persona=Persona.FAMILY,
            person_id=family.id,
            phone_e164=phone_e164,
            linked_patient_id=family.patient_id,
            permission_tier=family.permission_tier,
        )

    patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone_e164))
    if patient is not None:
        return Identity(persona=Persona.PATIENT, person_id=patient.id, phone_e164=phone_e164)

    return None
