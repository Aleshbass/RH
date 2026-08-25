from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.family.access import add_family, revoke, set_tier
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.models.family_member import FamilyMember
from app.models.patient import Patient
from app.models.types import PermissionTier, Persona


@pytest.fixture
def patient(db_session) -> Patient:
    row = Patient(
        phone_e164="+2348000004101",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_view_only_cannot_pay(db_session, patient):
    member = add_family(db_session, patient.id, "+2348110000001", PermissionTier.VIEW_ONLY)
    identity = resolve(db_session, "+2348110000001")
    assert identity.persona == Persona.FAMILY
    assert identity.linked_patient_id == patient.id
    assert authorize(identity, "pay") is False
    assert authorize(identity, "view_progress") is True


def test_revoke_stops_resolve(db_session, patient):
    add_family(db_session, patient.id, "+2348110000002", PermissionTier.FULL_ACCESS)
    revoke(db_session, patient.id, "+2348110000002")
    assert resolve(db_session, "+2348110000002") is None


def test_add_normalizes_nigerian_local_number(db_session, patient):
    member = add_family(db_session, patient.id, "08110000004", PermissionTier.VIEW_ONLY)
    assert member.phone_e164 == "+2348110000004"
    identity = resolve(db_session, "+2348110000004")
    assert identity is not None
    assert identity.persona == Persona.FAMILY


def test_duplicate_add_updates_tier(db_session, patient):
    first = add_family(db_session, patient.id, "+2348110000003", PermissionTier.VIEW_ONLY)
    second = add_family(db_session, patient.id, "+2348110000003", PermissionTier.FULL_ACCESS)
    assert first.id == second.id
    assert second.permission_tier == PermissionTier.FULL_ACCESS
    count = db_session.scalar(
        select(func.count()).select_from(FamilyMember).where(
            FamilyMember.phone_e164 == "+2348110000003"
        )
    )
    assert count == 1
    identity = resolve(db_session, "+2348110000003")
    assert identity is not None
    assert authorize(identity, "pay") is True


def test_set_tier_grants_full_access(db_session, patient):
    add_family(db_session, patient.id, "+2348110000007", PermissionTier.VIEW_ONLY)
    set_tier(db_session, patient.id, "+2348110000007", PermissionTier.FULL_ACCESS)
    identity = resolve(db_session, "+2348110000007")
    assert identity is not None
    assert identity.permission_tier == PermissionTier.FULL_ACCESS
    assert authorize(identity, "pay") is True


def test_revoke_keeps_row(db_session, patient):
    member = add_family(db_session, patient.id, "+2348110000008", PermissionTier.FULL_ACCESS)
    revoke(db_session, patient.id, "+2348110000008")
    db_session.refresh(member)
    assert member.revoked_at is not None
    stored = db_session.scalar(
        select(FamilyMember).where(FamilyMember.phone_e164 == "+2348110000008")
    )
    assert stored is not None
    assert stored.id == member.id


def test_readd_after_revoke_clears_revoked(db_session, patient):
    add_family(db_session, patient.id, "+2348110000009", PermissionTier.VIEW_ONLY)
    revoke(db_session, patient.id, "+2348110000009")
    member = add_family(db_session, patient.id, "+2348110000009", PermissionTier.FULL_ACCESS)
    assert member.revoked_at is None
    identity = resolve(db_session, "+2348110000009")
    assert identity is not None
    assert identity.persona == Persona.FAMILY
    assert authorize(identity, "pay") is True


def test_patient_add_defaults_view_only(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(db_session, patient.phone_e164, "add +2348110000005", fake_llm)
    identity = resolve(db_session, "+2348110000005")
    assert identity is not None
    assert identity.persona == Persona.FAMILY
    assert identity.permission_tier == PermissionTier.VIEW_ONLY
    assert identity.linked_patient_id == patient.id
    assert "later" not in result.reply_text.lower()
    assert authorize(identity, "pay") is False
    assert authorize(identity, "view_progress") is True


def test_patient_add_full_access_and_revoke_via_turn(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    added = handle_turn(
        db_session, patient.phone_e164, "add +2348110000006 full access", fake_llm
    )
    identity = resolve(db_session, "+2348110000006")
    assert identity is not None
    assert identity.permission_tier == PermissionTier.FULL_ACCESS
    assert authorize(identity, "pay") is True
    assert "later" not in added.reply_text.lower()

    handle_turn(db_session, patient.phone_e164, "revoke +2348110000006", fake_llm)
    assert resolve(db_session, "+2348110000006") is None
    row = db_session.scalar(
        select(FamilyMember).where(FamilyMember.phone_e164 == "+2348110000006")
    )
    assert row is not None
    assert row.revoked_at is not None


def test_family_sender_stays_on_later_path(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    add_family(db_session, patient.id, "+2348110000010", PermissionTier.VIEW_ONLY)
    result = handle_turn(db_session, "+2348110000010", "how is recovery", fake_llm)
    assert "later" in result.reply_text.lower()


def test_family_permissions_wraps_identity_authorize():
    from uuid import uuid4

    from app.family.permissions import authorize as family_authorize
    from app.identity.permissions import authorize as identity_authorize
    from app.models.types import Identity

    identity = Identity(
        persona=Persona.FAMILY,
        person_id=uuid4(),
        phone_e164="+2348110000099",
        linked_patient_id=uuid4(),
        permission_tier=PermissionTier.VIEW_ONLY,
    )
    assert family_authorize(identity, "pay") is False
    assert family_authorize(identity, "view_progress") is True
    assert family_authorize(identity, "pay") is identity_authorize(identity, "pay")
    assert family_authorize(identity, "view_progress") is identity_authorize(
        identity, "view_progress"
    )


def test_no_redeemable_codes_and_no_secret_leaks():
    root = Path(__file__).resolve().parents[1] / "app" / "family"
    text = "\n".join(path.read_text() for path in sorted(root.glob("*.py")))
    lowered = text.lower()
    assert "redeem" not in lowered
    assert "one-time" not in lowered
    assert "paystack" not in lowered
    assert "sk_live" not in lowered
    assert "sk_test" not in lowered
