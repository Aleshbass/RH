"""A referral code sent from a different WhatsApp number than the one on the referral."""

import pytest

from app.integrations.rh_client import PatientResolution, RHReferralContext
from app.models.conversation import Conversation
from app.conversation.state_manager import load

REFERRAL = {"referral_id": "r1", "tracking_code": "RHB-1234567890", "patient": {"display_name": "Ada Okonkwo"}, "location": {}}


class _FakeRH:
    def __init__(self):
        self.names = []

    def resolve_patient(self, phone, joy_person_id, actor, *, name=None, email=None):
        return PatientResolution(resolution="EXISTING", patient_id="rh-pat-1")

    def resolve_referral_context(self, tracking_code, *, phone, joy_person_id, actor, confirm_name=None):
        self.names.append(confirm_name)
        if confirm_name and "okonkwo" in confirm_name.casefold():
            return RHReferralContext(resolution="MATCH", referral=REFERRAL)
        return RHReferralContext(resolution="MISMATCH")


@pytest.fixture
def rh(monkeypatch):
    fake = _FakeRH()
    monkeypatch.setattr("app.conversation.turn_handler.configured_rh_client", lambda: fake)
    return fake


def _pending(db_session, patient_identity):
    state = load(db_session, patient_identity)
    return (db_session.get(Conversation, state.conversation_id).booking_context or {}).get("referral_name_check")


def test_a_code_from_another_number_asks_for_the_name_then_links(db_session, patient_identity, fake_llm, rh):
    from app.conversation.turn_handler import handle_turn

    first = handle_turn(db_session, patient_identity.phone_e164, "START RHB-1234567890", fake_llm)
    assert "set up for a different WhatsApp number" in first.reply_text
    assert _pending(db_session, patient_identity) == {"code": "RHB-1234567890", "attempts": 0}

    handle_turn(db_session, patient_identity.phone_e164, "Ada Okonkwo", fake_llm)
    assert rh.names == [None, "Ada Okonkwo"]
    assert _pending(db_session, patient_identity) is None
    state = load(db_session, patient_identity)
    assert db_session.get(Conversation, state.conversation_id).booking_context["rh_referral"]["referral_id"] == "r1"


def test_two_wrong_names_then_support(db_session, patient_identity, fake_llm, rh):
    from app.conversation.turn_handler import handle_turn

    handle_turn(db_session, patient_identity.phone_e164, "START RHB-1234567890", fake_llm)
    second = handle_turn(db_session, patient_identity.phone_e164, "Bola Smith", fake_llm)
    assert "doesn't match" in second.reply_text
    third = handle_turn(db_session, patient_identity.phone_e164, "Bola Smithe", fake_llm)
    assert "hello@myrehabifyhealth.com" in third.reply_text
    assert _pending(db_session, patient_identity) is None


def test_telling_the_story_instead_drops_the_name_check(db_session, patient_identity, fake_llm, rh):
    from app.conversation.turn_handler import handle_turn

    handle_turn(db_session, patient_identity.phone_e164, "START RHB-1234567890", fake_llm)
    fake_llm.reply = "Tell me more about the knee."
    handle_turn(db_session, patient_identity.phone_e164, "my knee has been swelling since last week", fake_llm)
    assert _pending(db_session, patient_identity) is None
    assert rh.names == [None]  # no name was sent to Rehabify
