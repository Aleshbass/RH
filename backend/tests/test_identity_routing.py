from uuid import uuid4

from sqlalchemy import select

from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.identity.unknown_sender import begin_unknown
from app.models.admin import Admin
from app.models.family_member import FamilyMember
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import Identity, PermissionTier, Persona


def test_family_view_only_cannot_pay():
    identity = Identity(
        persona=Persona.FAMILY,
        person_id=uuid4(),
        phone_e164="+2348000000001",
        linked_patient_id=uuid4(),
        permission_tier=PermissionTier.VIEW_ONLY,
    )
    assert authorize(identity, "pay") is False
    assert authorize(identity, "view_progress") is True


def test_unknown_phone_resolves_none(db_session):
    assert resolve(db_session, "+2348000000999") is None


def test_resolve_admin(db_session):
    admin = Admin(phone_e164="+2348000001001")
    db_session.add(admin)
    db_session.flush()
    identity = resolve(db_session, "+2348000001001")
    assert identity is not None
    assert identity.persona == Persona.ADMIN
    assert identity.person_id == admin.id
    assert identity.phone_e164 == "+2348000001001"


def test_resolve_partner(db_session):
    partner = Partner(phone_e164="+2348000001002")
    db_session.add(partner)
    db_session.flush()
    identity = resolve(db_session, "+2348000001002")
    assert identity is not None
    assert identity.persona == Persona.PARTNER
    assert identity.person_id == partner.id


def test_resolve_physio(db_session):
    physio = Physiotherapist(phone_e164="+2348000001003")
    db_session.add(physio)
    db_session.flush()
    identity = resolve(db_session, "+2348000001003")
    assert identity is not None
    assert identity.persona == Persona.PHYSIO
    assert identity.person_id == physio.id


def test_resolve_family_includes_patient_and_tier(db_session):
    patient = Patient(phone_e164="+2348000001004")
    db_session.add(patient)
    db_session.flush()
    family = FamilyMember(
        phone_e164="+2348000001005",
        patient_id=patient.id,
        permission_tier=PermissionTier.FULL_ACCESS,
    )
    db_session.add(family)
    db_session.flush()
    identity = resolve(db_session, "+2348000001005")
    assert identity is not None
    assert identity.persona == Persona.FAMILY
    assert identity.person_id == family.id
    assert identity.linked_patient_id == patient.id
    assert identity.permission_tier == PermissionTier.FULL_ACCESS


def test_resolve_patient(db_session):
    patient = Patient(phone_e164="+2348000001006")
    db_session.add(patient)
    db_session.flush()
    identity = resolve(db_session, "+2348000001006")
    assert identity is not None
    assert identity.persona == Persona.PATIENT
    assert identity.person_id == patient.id
    assert identity.linked_patient_id is None
    assert identity.permission_tier is None


def test_admin_wins_over_patient_same_phone(db_session):
    phone = "+2348000001007"
    admin = Admin(phone_e164=phone)
    db_session.add(admin)
    db_session.flush()
    db_session.add(Patient(phone_e164=phone))
    db_session.flush()
    identity = resolve(db_session, phone)
    assert identity is not None
    assert identity.persona == Persona.ADMIN
    assert identity.person_id == admin.id


def test_patient_may_triage_book_pay():
    identity = Identity(
        persona=Persona.PATIENT,
        person_id=uuid4(),
        phone_e164="+2348000002001",
    )
    assert authorize(identity, "triage") is True
    assert authorize(identity, "book") is True
    assert authorize(identity, "pay") is True
    assert authorize(identity, "admin") is False


def test_family_full_access_may_book_and_pay():
    identity = Identity(
        persona=Persona.FAMILY,
        person_id=uuid4(),
        phone_e164="+2348000002002",
        linked_patient_id=uuid4(),
        permission_tier=PermissionTier.FULL_ACCESS,
    )
    assert authorize(identity, "view_progress") is True
    assert authorize(identity, "book") is True
    assert authorize(identity, "pay") is True
    assert authorize(identity, "triage") is False


def test_physio_may_onboard():
    identity = Identity(
        persona=Persona.PHYSIO,
        person_id=uuid4(),
        phone_e164="+2348000002003",
    )
    assert authorize(identity, "physio_onboard") is True
    assert authorize(identity, "pay") is False


def test_admin_may_admin():
    identity = Identity(
        persona=Persona.ADMIN,
        person_id=uuid4(),
        phone_e164="+2348000002004",
    )
    assert authorize(identity, "admin") is True
    assert authorize(identity, "triage") is False


def test_partner_may_refer():
    identity = Identity(
        persona=Persona.PARTNER,
        person_id=uuid4(),
        phone_e164="+2348000002005",
    )
    assert authorize(identity, "partner_refer") is True
    assert authorize(identity, "admin") is False


def test_begin_unknown_grouped_question_stores_no_persona(db_session):
    phone = "+2348000003001"
    text = begin_unknown(db_session, phone)
    assert isinstance(text, str)
    lowered = text.lower()
    assert "physio" in lowered
    assert "family" in lowered
    assert text.count("?") == 1
    assert resolve(db_session, phone) is None
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is None
    assert db_session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone)) is None


def test_lifting_hobby_does_not_auto_create_patient(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000000198"
    handle_turn(db_session, phone, "I enjoy lifting weights", fake_llm)
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is None
    assert resolve(db_session, phone) is None


def test_physio_intent_does_not_auto_create_patient(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000000199"
    result = handle_turn(db_session, phone, "I dey apply as a therapist", fake_llm)
    identity = resolve(db_session, phone)
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is None
    assert identity is None or identity.persona == Persona.PHYSIO
    if identity is None:
        assert "physiotherapy" in result.reply_text.lower() or "physio" in result.reply_text.lower()


def test_physio_claim_provisions_physiotherapist_not_patient(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000000210"
    result = handle_turn(db_session, phone, "I am a physiotherapist", fake_llm)
    identity = resolve(db_session, phone)
    assert identity is not None
    assert identity.persona == Persona.PHYSIO
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is None
    physio = db_session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone))
    assert physio is not None
    assert physio.onboarding_status == "collecting"
    assert "later" not in result.reply_text.lower()
    lower = result.reply_text.lower()
    assert "mrtb" in lower or "credential" in lower or "specialty" in lower
