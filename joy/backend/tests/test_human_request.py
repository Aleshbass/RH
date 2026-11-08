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


@pytest.mark.parametrize("text", [
    # Plain and Nigerian English
    "talk to a human", "I want to speak to someone", "Let me talk to a human being", "Can I talk to an agent",
    "I need to speak with your customer care", "customer care number pls", "I need a human",
    "I’d like to speak to a person", "Please put me through to someone", "Can I get someone on the phone",
    "is there a human I can talk to", "please contact me", "Can I call you?", "what is your phone number",
    "I want a real person not a bot", "I need help from a real person", "real person please",
    "connect me with an agent", "transfer me to a human agent", "Let me speak to your manager",
    # Pidgin
    "Abeg make una call me", "I wan talk to person", "I wan yarn with una person",
    "abeg connect me to una customer care", "I dey find person wey I fit talk to", "Make somebody call me abeg",
    "Let me speak to your oga",
])
def test_every_way_of_asking_for_a_person_is_recognised(text):
    assert is_human_request(text)


@pytest.mark.parametrize("text", [
    "you don't need to call me", "I talked to a physio last year", "I spoke to my doctor",
    "My doctor told me to contact you", "it feels like a real pressure in my knee",
    # A question about Joy is answered honestly, nobody is alerted
    "are you a real person?", "Are you a bot?",
])
def test_these_are_not_requests_for_a_person(text):
    assert not is_human_request(text)


@pytest.mark.parametrize("text", [
    "are you a real person?", "Are you a bot?", "is this a robot", "Am I talking to a real person?",
    "Hi Joy, are you human?", "You be human?", "na robot I dey talk to?",
])
def test_are_you_a_bot_questions(text):
    from app.conversation.human_request import is_bot_question

    assert is_bot_question(text)


def test_the_admin_alert_says_who_is_asking():
    from app.admin.escalation_router import _admin_text

    patient = _admin_text("callback", {"phone": "+2348000000001", "patient_id": "rh-1", "text": "call me"})
    assert patient.startswith("Patient rh-1 asked on WhatsApp to speak to someone. Call +2348000000001.")
    physio = _admin_text("callback", {"phone": "+2348000000002", "role": "physiotherapist", "person_id": "p-9"})
    assert physio.startswith("Physio p-9 asked on WhatsApp to speak to someone. Call +2348000000002.")


class _Session:
    def get(self, model, key):
        return None

    def add(self, row):
        pass

    def flush(self):
        pass


def test_a_physio_request_alerts_the_team_without_the_patient_emergency_line(monkeypatch):
    from uuid import uuid4

    import app.conversation  # noqa: F401  (Joy's import order)
    from app.conversation.human_request import human_request_reply
    from app.models.conversation import Conversation
    from app.models.types import Identity, Persona

    sent = []
    monkeypatch.setattr("app.admin.escalation_router.route_escalation", lambda session, kind, payload: sent.append((kind, payload)))
    identity = Identity(persona=Persona.PHYSIO, person_id=uuid4(), phone_e164="+2348000000003")
    conversation = Conversation(id=uuid4(), person_id=identity.person_id, persona=Persona.PHYSIO, booking_context={})

    first = human_request_reply(_Session(), identity, conversation, "I want to speak to someone")
    assert first == "Of course. I've asked our team to call you on +2348000000003. Someone will reach out as soon as they can."
    assert sent[0][0] == "callback" and sent[0][1]["role"] == "physiotherapist"
    assert CALLBACK_KEY in conversation.booking_context

    again = human_request_reply(_Session(), identity, conversation, "call me")
    assert again.startswith("I've already asked our team") and len(sent) == 1


def test_a_patient_reply_is_short_and_keeps_the_emergency_line(monkeypatch):
    from uuid import uuid4

    import app.conversation  # noqa: F401  (Joy's import order)
    from app.conversation.human_request import human_request_reply
    from app.models.types import Identity, Persona

    sent = []
    monkeypatch.setattr("app.admin.escalation_router.route_escalation", lambda session, kind, payload: sent.append(kind))
    identity = Identity(persona=Persona.PATIENT, person_id=uuid4(), phone_e164="+2348000000004")
    reply = human_request_reply(_Session(), identity, None, "talk to a human")
    assert reply.startswith("Of course. I've asked our care team to call you on +2348000000004.")
    assert reply.endswith("If it's an emergency, call 112 or go to the nearest hospital now.")
    assert reply.count("\n\n") == 1 and sent == ["callback"]


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
