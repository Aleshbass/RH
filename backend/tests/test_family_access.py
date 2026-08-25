from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.family.access import add_family, parse_family_intent, revoke, set_tier
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


def test_self_add(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    with pytest.raises(ValueError):
        add_family(db_session, patient.id, patient.phone_e164, PermissionTier.VIEW_ONLY)

    assert (
        db_session.scalar(
            select(FamilyMember).where(FamilyMember.phone_e164 == patient.phone_e164)
        )
        is None
    )
    identity = resolve(db_session, patient.phone_e164)
    assert identity is not None
    assert identity.persona == Persona.PATIENT
    assert identity.person_id == patient.id

    result = handle_turn(
        db_session, patient.phone_e164, f"add {patient.phone_e164}", fake_llm
    )
    identity = resolve(db_session, patient.phone_e164)
    assert identity.persona == Persona.PATIENT
    assert identity.person_id == patient.id
    lower = result.reply_text.lower()
    assert "later" not in lower
    assert any(token in lower for token in ("already", "own", "cannot", "can't", "patient"))


def test_add_existing_patient(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    other = Patient(
        phone_e164="+2348110000021",
        name="Bisi Adeyemi",
        age=40,
        location="Abuja",
    )
    db_session.add(other)
    db_session.flush()

    with pytest.raises(ValueError):
        add_family(db_session, patient.id, other.phone_e164, PermissionTier.VIEW_ONLY)

    assert (
        db_session.scalar(
            select(FamilyMember).where(FamilyMember.phone_e164 == other.phone_e164)
        )
        is None
    )
    other_identity = resolve(db_session, other.phone_e164)
    assert other_identity is not None
    assert other_identity.persona == Persona.PATIENT
    assert other_identity.person_id == other.id

    result = handle_turn(
        db_session, patient.phone_e164, f"add {other.phone_e164}", fake_llm
    )
    other_identity = resolve(db_session, other.phone_e164)
    assert other_identity.persona == Persona.PATIENT
    assert other_identity.person_id == other.id
    lower = result.reply_text.lower()
    assert "later" not in lower
    assert any(token in lower for token in ("already", "cannot", "can't", "patient"))


def test_family_intent_requires_command_shape():
    assert parse_family_intent("add +2348110000023")[0] == "add"
    assert parse_family_intent("add +2348110000023 view-only")[0] == "add"
    adjacent_full = parse_family_intent("add +2348110000023 full")
    assert adjacent_full[0] == "add"
    assert adjacent_full[2] == PermissionTier.FULL_ACCESS
    assert parse_family_intent("revoke +2348110000023")[0] == "revoke"
    assert parse_family_intent("Add my mum +2348110000023")[0] == "add"
    assert parse_family_intent("Add my dad +2348110000023")[0] == "add"
    assert parse_family_intent("Add my sister +2348110000023")[0] == "add"
    assert parse_family_intent("register family +2348110000023")[0] == "add"
    assert parse_family_intent("remove family access +2348110000023")[0] == "revoke"
    mum_full = parse_family_intent("Add my mum +2348110000023 she feels full")
    assert mum_full[0] == "add"
    assert mum_full[2] is None

    assert parse_family_intent("register +2348110000023") is None
    assert parse_family_intent("remove +2348110000023") is None
    assert parse_family_intent("I need to register +2348110000023") is None
    assert parse_family_intent("please remove +2348110000023") is None
    assert parse_family_intent("chest pain please add ice and call +2348110000023") is None
    assert parse_family_intent(
        "Add ice and call +2348110000023 if the chest pain continues"
    ) is None
    assert parse_family_intent(
        "Make ice packs and call +2348110000023 if you feel full"
    ) is None
    assert parse_family_intent("Set a reminder and call +2348110000023") is None
    assert parse_family_intent(
        "Add ice for my mum and call +2348110000023 if the chest pain continues"
    ) is None


def test_uncertain_family_parse_falls_through_to_safety(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    text = "chest pain please add ice and call +2348110000020"
    assert parse_family_intent(text) is None
    result = handle_turn(db_session, patient.phone_e164, text, fake_llm)
    assert result.blocked_by_safety is True
    assert result.safety is not None
    assert result.safety.fired is True
    assert resolve(db_session, "+2348110000020") is None
    assert "book" not in result.reply_text.lower()


def test_leading_add_ice_with_phone_still_hits_safety(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    text = "Add ice and call +2348110000026 if the chest pain continues"
    assert parse_family_intent(text) is None
    result = handle_turn(db_session, patient.phone_e164, text, fake_llm)
    assert result.blocked_by_safety is True
    assert result.safety is not None
    assert result.safety.fired is True
    assert resolve(db_session, "+2348110000026") is None
    assert "book" not in result.reply_text.lower()


def test_distant_mum_with_phone_still_hits_safety(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    text = "Add ice for my mum and call +2348110000027 if the chest pain continues"
    assert parse_family_intent(text) is None
    result = handle_turn(db_session, patient.phone_e164, text, fake_llm)
    assert result.blocked_by_safety is True
    assert result.safety is not None
    assert result.safety.fired is True
    assert resolve(db_session, "+2348110000027") is None
    assert (
        db_session.scalar(
            select(FamilyMember).where(FamilyMember.phone_e164 == "+2348110000027")
        )
        is None
    )
    assert "book" not in result.reply_text.lower()


def test_bound_family_add_blocked_when_safety_fires(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    text = "Add my mum +2348110000028 if the chest pain continues"
    parsed = parse_family_intent(text)
    assert parsed is not None
    assert parsed[0] == "add"
    result = handle_turn(db_session, patient.phone_e164, text, fake_llm)
    assert result.blocked_by_safety is True
    assert result.safety is not None
    assert result.safety.fired is True
    assert resolve(db_session, "+2348110000028") is None
    assert (
        db_session.scalar(
            select(FamilyMember).where(FamilyMember.phone_e164 == "+2348110000028")
        )
        is None
    )
    assert "book" not in result.reply_text.lower()


def test_give_full_access_already_linked_replies_in_band(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    other = Patient(
        phone_e164="+2348110000022",
        name="Chidi Okeke",
        age=41,
        location="Enugu",
    )
    db_session.add(other)
    db_session.flush()
    add_family(db_session, other.id, "+2348110000025", PermissionTier.VIEW_ONLY)

    result = handle_turn(
        db_session,
        patient.phone_e164,
        "give +2348110000025 full access",
        fake_llm,
    )
    identity = resolve(db_session, "+2348110000025")
    assert identity is not None
    assert identity.persona == Persona.FAMILY
    assert identity.linked_patient_id == other.id
    assert identity.permission_tier == PermissionTier.VIEW_ONLY
    lower = result.reply_text.lower()
    assert "already" in lower or "linked" in lower
    assert "later" not in lower
