import pytest

from app.models.physiotherapist import Physiotherapist
from app.models.types import Persona


@pytest.fixture
def physio(db_session):
    row = Physiotherapist(phone_e164="+2348000005001")
    db_session.add(row)
    db_session.flush()
    return row


def test_submitted_sets_48h_deadline(db_session, physio):
    from app.physio.onboarding import apply_onboarding_turn
    apply_onboarding_turn(db_session, physio, "MRTB 12345, specialties neuro and msk", media=["https://files/cred.jpg"])
    db_session.refresh(physio)
    assert physio.onboarding_status == "submitted"
    assert physio.verification_due_at is not None
    delta = physio.verification_due_at - physio.credentials_submitted_at
    assert 47 * 3600 <= delta.total_seconds() <= 49 * 3600


def test_complete_message_does_not_ask_one_field_at_a_time(db_session, physio):
    from app.physio.onboarding import apply_onboarding_turn

    reply = apply_onboarding_turn(
        db_session,
        physio,
        "MRTB 12345, specialties neuro and msk",
        media=["https://files/cred.jpg"],
    )
    db_session.refresh(physio)
    assert physio.mrtb_number == "12345"
    assert "neuro" in physio.specialty_tags
    assert "msk" in physio.specialty_tags
    assert physio.credential_urls == ["https://files/cred.jpg"]
    lower = reply.lower()
    assert "mrtb" not in lower or "submitted" in lower
    assert "?" not in reply


def test_reply_confirms_48h_sla(db_session, physio):
    from app.physio.onboarding import apply_onboarding_turn

    reply = apply_onboarding_turn(
        db_session,
        physio,
        "MRTB 12345, specialties neuro and msk",
        media=["https://files/cred.jpg"],
    )
    lower = reply.lower()
    assert "submitted" in lower
    assert "48" in lower
    assert "verification" in lower


def test_partial_message_groups_leftover_fields(db_session, physio):
    from app.physio.onboarding import apply_onboarding_turn

    reply = apply_onboarding_turn(db_session, physio, "MRTB 12345", media=None)
    db_session.refresh(physio)
    assert physio.onboarding_status == "collecting"
    assert physio.mrtb_number == "12345"
    assert physio.credentials_submitted_at is None
    lower = reply.lower()
    assert "specialty" in lower or "specialt" in lower
    assert "credential" in lower or "photo" in lower or "document" in lower
    assert lower.count("?") == 1


def test_second_turn_completes_without_reasking_mrtb(db_session, physio):
    from app.physio.onboarding import apply_onboarding_turn

    apply_onboarding_turn(db_session, physio, "MRTB 12345", media=None)
    reply = apply_onboarding_turn(
        db_session,
        physio,
        "specialties neuro and msk",
        media=["https://files/cred.jpg"],
    )
    db_session.refresh(physio)
    assert physio.onboarding_status == "submitted"
    assert physio.mrtb_number == "12345"
    assert "submitted" in reply.lower()
    assert "48" in reply.lower()
    assert "mrtb" not in reply.lower() or "submitted" in reply.lower()


def test_submitted_tells_status_without_approving(db_session, physio):
    from app.physio.onboarding import apply_onboarding_turn

    apply_onboarding_turn(
        db_session,
        physio,
        "MRTB 12345, specialties neuro and msk",
        media=["https://files/cred.jpg"],
    )
    reply = apply_onboarding_turn(db_session, physio, "am I verified yet?", media=None)
    db_session.refresh(physio)
    assert physio.onboarding_status == "submitted"
    assert physio.verified is False
    lower = reply.lower()
    assert "verified" not in lower or "not yet" in lower or "within 48" in lower or "pending" in lower or "submitted" in lower
    assert "approved" not in lower
    assert "48" in lower


def test_unknown_physio_claim_creates_row_and_onboards(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.identity.resolver import resolve
    from sqlalchemy import select
    from app.models.patient import Patient

    phone = "+2348000005201"
    result = handle_turn(
        db_session,
        phone,
        "I am a physiotherapist. MRTB 12345, specialties neuro and msk",
        fake_llm,
        media=["https://files/cred.jpg"],
    )
    identity = resolve(db_session, phone)
    assert identity is not None
    assert identity.persona == Persona.PHYSIO
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is None
    physio = db_session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone))
    assert physio is not None
    assert physio.onboarding_status == "submitted"
    assert "48" in result.reply_text.lower()
    assert "submitted" in result.reply_text.lower()
