"""Booking for someone they care for, a new person on a saved number, and the under-18 rule.

Nov 2026 audit: "No, someone else" wiped the saved person and wrote the new person's details over
their Rehabify record; "messaging for someone else" was invited but never handled; children could
book themselves. Database-backed (the self-referral flow), with RH faked as in test_self_referral.
"""
import pytest

from app.models.patient import Patient
from app.models.rh_identity_mapping import RHIdentityMapping
from app.triage.self_referral import SR_KEY
from tests.test_joy_feedback import known_patient  # noqa: F401
from tests.test_self_referral import STORY, _turn, new_patient, rh  # noqa: F401


@pytest.fixture
def cared_rh(rh):
    """RH that makes the managed profile."""
    original = rh.operational_mutation

    def operational_mutation(op, *, actor, data, idempotency_key):
        if op == "patient_add_cared_for":
            rh.calls.append((op, data))
            return {"patient_id": "rh-child-1", "reused": False}
        return original(op, actor=actor, data=data, idempotency_key=idempotency_key)

    rh.operational_mutation = operational_mutation
    return rh


def _front(db_session, identity, who="I'm not Simidara"):
    """The hello, then consent: for a saved number, "I'm not Simidara" asks who it's for."""
    _turn(db_session, identity, STORY, "Hi")
    _turn(db_session, identity, STORY, who)
    return _turn(db_session, identity, STORY, "I agree")


def _sr(db_session, identity):
    from sqlalchemy import select

    from app.models.conversation import Conversation

    conversation = db_session.scalar(select(Conversation).where(Conversation.person_id == identity.person_id))
    return (conversation.booking_context or {}).get(SR_KEY) or {}


def test_someone_else_never_wipes_the_saved_person(db_session, known_patient, cared_rh):  # noqa: F811
    who = _front(db_session, known_patient)
    assert "Who would you like to book for?" in who.reply_text
    patient = db_session.get(Patient, known_patient.person_id)
    assert (patient.name, patient.age, patient.city) == ("Simidara", 25, "Ibadan")
    assert not [call for call in cared_rh.calls if call[0] == "patient_update_profile"]


def test_a_new_person_on_a_saved_number_goes_to_the_care_team(db_session, known_patient, cared_rh, monkeypatch):  # noqa: F811
    alerts = []
    monkeypatch.setattr("app.admin.escalation_router.route_escalation", lambda session, kind, payload: alerts.append(kind))
    _front(db_session, known_patient)
    reply = _turn(db_session, known_patient, STORY, "new person")
    assert "care team" in reply.reply_text and alerts == ["callback"]
    assert db_session.get(Patient, known_patient.person_id).name == "Simidara"


def test_booking_for_a_child_needs_a_guardian_and_makes_their_own_profile(db_session, known_patient, cared_rh):  # noqa: F811
    _front(db_session, known_patient)
    assert "first name" in _turn(db_session, known_patient, STORY, "Someone I care for").reply_text
    _turn(db_session, known_patient, STORY, "Tobi")
    guardian = _turn(db_session, known_patient, STORY, "9")
    assert "parent or legal guardian" in guardian.reply_text
    assert "city and country" in _turn(db_session, known_patient, STORY, "Yes").reply_text
    _turn(db_session, known_patient, STORY, "same as me")
    created = [data for op, data in cared_rh.calls if op == "patient_add_cared_for"]
    assert created and created[0]["first_name"] == "Tobi" and created[0]["age_years"] == 9
    assert created[0]["guardian_confirmed"] is True
    # The caregiver's own record is untouched; the child's events reach this chat
    assert db_session.get(Patient, known_patient.person_id).name == "Simidara"
    mapping = db_session.query(RHIdentityMapping).filter_by(rh_record_id="rh-child-1").one()
    assert mapping.joy_person_id == known_patient.person_id
    assert _sr(db_session, known_patient)["subject"]["rh_patient_id"] == "rh-child-1"


def test_a_non_guardian_cannot_book_a_child(db_session, known_patient, cared_rh):  # noqa: F811
    _front(db_session, known_patient)
    _turn(db_session, known_patient, STORY, "Someone I care for")
    _turn(db_session, known_patient, STORY, "Tobi")
    _turn(db_session, known_patient, STORY, "9")
    refused = _turn(db_session, known_patient, STORY, "No")
    assert "parent or legal guardian needs to agree" in refused.reply_text
    assert not [call for call in cared_rh.calls if call[0] == "patient_add_cared_for"]


def test_it_is_for_my_mum_switches_to_booking_for_them(db_session, new_patient, cared_rh):  # noqa: F811
    # The hello asks who it's for: their own name first, then the person they book for
    asked = _front(db_session, new_patient, who="It's for my mum")
    assert asked.reply_text == "What's your first name?"
    reply = _turn(db_session, new_patient, STORY, "Bola")
    assert "What's their first name?" in reply.reply_text
    assert _sr(db_session, new_patient)["subject"]["relationship"] == "mum"


def test_an_under_18_booking_for_themselves_needs_a_parent(db_session, new_patient, cared_rh):  # noqa: F811
    _front(db_session, new_patient, who="Kemi, for myself")
    asked = _turn(db_session, new_patient, STORY, "15, Yaba Lagos")
    assert "under 18" in asked.reply_text
    wait = _turn(db_session, new_patient, STORY, "Not now")
    assert "parent or guardian needs to agree" in wait.reply_text
    _turn(db_session, new_patient, STORY, "I'm the parent or guardian")
    _turn(db_session, new_patient, STORY, "Mrs Adeyemi")
    guardian = _sr(db_session, new_patient).get("guardian") or {}
    assert guardian.get("name") == "Mrs Adeyemi" and guardian.get("confirmed_at")
