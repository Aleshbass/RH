"""A patient asking for a person ("call me", "talk to someone"): the care team is alerted once,
the patient is told someone will call, and the booking step they were on is left as it was."""

import pytest

from app.conversation.human_request import CALLBACK_KEY, is_human_request


@pytest.mark.parametrize("text", [
    "Call me", "Please can someone call me", "I want to talk to a real person", "speak with customer care",
    "HUMAN", "abeg call me", "Can the physio call me before the visit?", "can I speak to someone please",
])
def test_requests_for_a_person_are_recognised(text):
    assert is_human_request(text)


@pytest.mark.parametrize("text", [
    "Don't call me", "Don’t call me, text me", "no need to call me", "my knee hurts",
    "what do you call this exercise", "I called my doctor", "video call link?",
])
def test_other_messages_are_not(text):
    assert not is_human_request(text)


@pytest.fixture
def alerts(monkeypatch):
    sent = {"rh": [], "admins": [], "journey": []}

    class _RH:
        def operational_mutation(self, operation, *, actor, data, idempotency_key):
            sent["rh"].append((operation, data))
            return {"accepted": True, "notified": 2}

    monkeypatch.setattr("app.integrations.rh_client.configured_rh_client", lambda: _RH())
    monkeypatch.setattr("app.booking.booking_flow._rh_patient_id", lambda session, patient: "rh-pat-1")
    monkeypatch.setattr("app.admin.escalation_router.route_escalation", lambda session, kind, payload: sent["admins"].append((kind, payload)))
    monkeypatch.setattr("app.booking.intake.journey", lambda pid, stage, event_id, **kw: sent["journey"].append(stage))
    return sent


def test_call_me_alerts_the_care_team_once_and_keeps_the_booking_step(db_session, patient_identity, fake_llm, alerts):
    from app.conversation.state_manager import load
    from app.conversation.turn_handler import handle_turn
    from app.models.conversation import Conversation

    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_substate = "rh_awaiting_payment"
    conversation.booking_context = {"authorization_url": "https://checkout.paystack.com/x"}
    db_session.flush()

    first = handle_turn(db_session, patient_identity.phone_e164, "Can someone call me please", fake_llm)
    assert f"asked our care team to call you on {patient_identity.phone_e164}" in first.reply_text
    assert "112" in first.reply_text
    assert alerts["rh"] == [("patient_request_callback", {"patient_id": "rh-pat-1", "text": "Can someone call me please"})]
    assert alerts["admins"][0][0] == "callback" and alerts["journey"] == ["handed_to_human"]
    assert conversation.booking_substate == "rh_awaiting_payment"
    assert CALLBACK_KEY in conversation.booking_context
    assert conversation.booking_context["authorization_url"] == "https://checkout.paystack.com/x"

    second = handle_turn(db_session, patient_identity.phone_e164, "call me", fake_llm)
    assert second.reply_text.startswith("I've already asked our care team")
    assert len(alerts["rh"]) == 1  # no second alert within 2 hours


def test_warning_signs_go_to_the_safety_engine_not_the_callback(db_session, patient_identity, fake_llm, alerts):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(db_session, patient_identity.phone_e164, "call me now I have crushing chest pain", fake_llm)
    assert "asked our care team to call you" not in result.reply_text
    assert alerts["rh"] == []
