"""Switching roles safely (app/identity/role_switch.py and the turn handler's role checks).

A tester typed "I'm a physio" once and was then asked for an MRTB number on every message with no
way out. The first tests here need no database (unsaved records and a stand-in session); the
scenarios at the end go through handle_turn and need Postgres (CI).
"""

from __future__ import annotations

from uuid import uuid4

import pytest

import app.conversation  # noqa: F401  (Joy's import order)
from app.conversation import turn_handler
from app.conversation.state_manager import ConversationState
from app.identity.role_switch import (
    PHYSIO_LOCKED_REPLY,
    PHYSIO_SIGNUP_REPLY,
    PHYSIO_SIGNUP_URL,
    ROLE_CHECK_KEY,
    ROLE_QUESTION,
    STAY_PHYSIO_PREFIX,
    SWITCHED_PREFIX,
    SWITCHED_WELCOME,
    carries_patient_story,
    is_onboarding_content,
    is_patient_statement,
    is_restart_request,
    is_switchable_physio,
    patient_says_physio,
    role_choice,
)
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import ConversationStage, ExtractedTriage, Identity, PatientPhase, Persona, TurnResult
from tests.fakes import FakeLLM


# ---- the words -----------------------------------------------------------------------------------

@pytest.mark.parametrize("text", [
    "I'm a patient", "I am a patient", "im a patient", "I’m not a physio", "I am not a physiotherapist",
    "Not a physio, I need help with my back", "I no be physio o", "I'm contacting you as a patient",
])
def test_patient_statements(text):
    assert is_patient_statement(text)


@pytest.mark.parametrize("text", [
    "I'm a physio", "My patient has knee pain", "I treat patients every day", "MRTB 12345", "patients",
])
def test_not_patient_statements(text):
    assert not is_patient_statement(text)


@pytest.mark.parametrize("text", ["start over", "Can I start again?", "wrong option", "I chose the wrong one", "restart"])
def test_restart_requests(text):
    assert is_restart_request(text)


def test_restart_words_inside_a_long_story_are_not_a_restart():
    story = "My knee pain started again last week after I restarted running and it is worse on the stairs now"
    assert not is_restart_request(story)


@pytest.mark.parametrize(("text", "choice"), [
    ("Patient", "patient"), ("patient.", "patient"), ("I'm a patient", "patient"), ("Yes", "patient"),
    ("Physio", "physio"), ("PT", "physio"), ("physiotherapist", "physio"), ("No", "physio"),
    ("my knee hurts", None), ("", None),
])
def test_role_choice(text, choice):
    assert role_choice(text) == choice


def test_a_story_after_the_role_words_is_carried_on():
    assert carries_patient_story("I'm a patient, my knee hurts")
    assert not carries_patient_story("I'm a patient")
    assert not carries_patient_story("I am not a physio")


def test_onboarding_content_is_never_a_role_question():
    assert is_onboarding_content("MRTB 12345", None)
    assert is_onboarding_content("I do neuro and msk", None)
    assert is_onboarding_content("", ["https://files/cred.jpg"])
    assert not is_onboarding_content("my back hurts", None)


@pytest.mark.parametrize("text", ["I'm a physio", "I am a physiotherapist", "PT", "pt", "I'm a therapist"])
def test_a_patient_saying_they_are_a_physio(text):
    assert patient_says_physio(text)


def test_a_physio_with_their_own_problem_is_still_a_patient_here():
    assert not patient_says_physio("I'm a physio and my back hurts")


# ---- who may be switched ------------------------------------------------------------------------

class _Session:
    """Just enough of a SQLAlchemy session for the role checks (counts come back as ``count``)."""

    def __init__(self, *rows, count: int = 0):
        self.rows = {(type(row), row.id): row for row in rows}
        self.count = count
        self.added: list = []

    def get(self, model, key):
        return self.rows.get((model, key))

    def add(self, row):
        self.added.append(row)
        if getattr(row, "id", None) is None and hasattr(row, "id"):
            row.id = uuid4()
        if hasattr(row, "id"):
            self.rows[(type(row), row.id)] = row

    def flush(self):
        pass

    def scalar(self, *args, **kwargs):
        return self.count or None


def _physio(**fields) -> Physiotherapist:
    values = {
        "id": uuid4(), "phone_e164": "+2348000009101", "onboarding_status": "collecting", "verified": False,
        "mrtb_number": None, "specialty_tags": [], "credential_urls": [],
    }
    values.update(fields)
    return Physiotherapist(**values)


def test_only_a_fresh_unverified_sign_up_can_be_switched():
    assert is_switchable_physio(_Session(), _physio())
    assert not is_switchable_physio(_Session(), _physio(verified=True))
    assert not is_switchable_physio(_Session(), _physio(onboarding_status="verified"))
    assert not is_switchable_physio(_Session(), _physio(onboarding_status="submitted", mrtb_number="123"))
    assert not is_switchable_physio(_Session(), _physio(mrtb_number="123"))
    assert not is_switchable_physio(_Session(count=1), _physio())  # has bookings or payouts


# ---- the physio side, turn by turn --------------------------------------------------------------

def _physio_chat(physio: Physiotherapist, *, count: int = 0, **context):
    conversation = Conversation(id=uuid4(), person_id=physio.id, persona=Persona.PHYSIO, booking_context=dict(context))
    session = _Session(physio, conversation, count=count)
    state = ConversationState(
        phase=PatientPhase.FIRST_CONTACT, stage=ConversationStage.STORY_CAPTURE, last_known_language="en",
        summary_text=None, recent_messages=[], extracted=ExtractedTriage(), known_facts={},
        conversation_id=conversation.id,
    )
    identity = Identity(persona=Persona.PHYSIO, person_id=physio.id, phone_e164=physio.phone_e164)
    return session, state, conversation, identity


def _role_turn(physio, text, *, media=None, count=0, **context):
    session, state, conversation, identity = _physio_chat(physio, count=count, **context)
    result = turn_handler._physio_role_switch_turn(
        session, identity, physio, state, conversation, text, media, "en", None, FakeLLM(),
    )
    return result, conversation, session


@pytest.fixture
def switch_calls(monkeypatch):
    """Record the switch instead of deleting rows, and the patient turn it carries on with."""
    calls = {"removed": [], "turns": []}

    def fake_handle_turn(session, phone, text, llm, wa_message_id=None, **kwargs):
        calls["turns"].append(text)
        return TurnResult(reply_text="Thanks. Here’s what I understood: knee.", language="en", phase="post_triage")

    def fake_load(session, identity):
        conversation = Conversation(id=uuid4(), person_id=identity.person_id, persona=identity.persona, booking_context={})
        session.rows[(Conversation, conversation.id)] = conversation
        return ConversationState(
            phase=PatientPhase.FIRST_CONTACT, stage=ConversationStage.STORY_CAPTURE, last_known_language=None,
            summary_text=None, recent_messages=[], extracted=ExtractedTriage(), known_facts={},
            conversation_id=conversation.id,
        )

    monkeypatch.setattr("app.ops.reset_phone.remove_physio_identity", lambda session, physio: calls["removed"].append(physio.id))
    monkeypatch.setattr(turn_handler, "handle_turn", fake_handle_turn)
    monkeypatch.setattr(turn_handler, "load", fake_load)
    return calls


def test_writing_like_a_patient_gets_asked_which_role(switch_calls):
    physio = _physio()
    result, conversation, _ = _role_turn(physio, "my lower back hurts when I bend")
    assert result.reply_text == ROLE_QUESTION
    assert [b["reply"]["id"] for b in result.interactive["action"]["buttons"]] == ["patient", "physio"]
    assert conversation.booking_context[ROLE_CHECK_KEY] == {"text": "my lower back hurts when I bend"}
    assert switch_calls["removed"] == []  # nothing changes until they answer


def test_patient_switches_and_carries_on_with_what_they_wrote(switch_calls):
    physio = _physio()
    result, _, session = _role_turn(physio, "Patient", **{ROLE_CHECK_KEY: {"text": "my lower back hurts when I bend"}})
    assert switch_calls["removed"] == [physio.id]
    assert switch_calls["turns"] == ["my lower back hurts when I bend"]
    assert result.reply_text.startswith(SWITCHED_PREFIX)
    assert any(isinstance(row, Patient) and row.phone_e164 == physio.phone_e164 for row in session.added)


def test_physio_keeps_the_sign_up_going(switch_calls):
    physio = _physio()
    result, conversation, _ = _role_turn(physio, "Physio", **{ROLE_CHECK_KEY: {"text": "my back hurts"}})
    assert result.reply_text.startswith(STAY_PHYSIO_PREFIX) and "MRTB" in result.reply_text
    assert ROLE_CHECK_KEY not in conversation.booking_context
    assert switch_calls["removed"] == []


def test_saying_i_am_a_patient_switches_at_once(switch_calls):
    physio = _physio()
    result, _, _ = _role_turn(physio, "I'm not a physio")
    assert switch_calls["removed"] == [physio.id] and switch_calls["turns"] == []
    assert result.reply_text == SWITCHED_WELCOME

    result, _, _ = _role_turn(_physio(), "I'm a patient, my knee hurts")
    assert switch_calls["turns"] == ["I'm a patient, my knee hurts"]
    assert result.reply_text.startswith(SWITCHED_PREFIX)


def test_safety_advice_from_the_carried_on_turn_leads_unprefixed(switch_calls, monkeypatch):
    urgent = TurnResult(reply_text="Please call 112 now.", language="en", phase="first_contact", blocked_by_safety=True)
    monkeypatch.setattr(turn_handler, "handle_turn", lambda *args, **kwargs: urgent)
    result, _, _ = _role_turn(_physio(), "patient", **{ROLE_CHECK_KEY: {"text": "I have chest pain"}})
    assert result is urgent


def test_warning_signs_get_the_urgent_line_before_the_role_question(switch_calls):
    result, conversation, _ = _role_turn(_physio(), "I have crushing chest pain")
    assert result.reply_text.startswith("If you or someone with you has these symptoms now, please call 112")
    assert result.reply_text.endswith(ROLE_QUESTION)
    assert conversation.booking_context[ROLE_CHECK_KEY]["text"] == "I have crushing chest pain"


def test_wrong_option_asks_which_role(switch_calls):
    result, conversation, _ = _role_turn(_physio(), "wrong option")
    assert result.reply_text == ROLE_QUESTION
    assert conversation.booking_context[ROLE_CHECK_KEY] == {"text": ""}


def test_sign_up_details_carry_on_as_a_physio(switch_calls):
    result, conversation, _ = _role_turn(_physio(), "MRTB 12345, I treat back pain", **{ROLE_CHECK_KEY: {"text": "x"}})
    assert result is None
    assert ROLE_CHECK_KEY not in conversation.booking_context


def test_call_me_is_left_to_the_callback(switch_calls):
    result, _, _ = _role_turn(_physio(), "please call me")
    assert result is None


@pytest.mark.parametrize("fields,count", [
    ({"verified": True, "onboarding_status": "verified"}, 0),
    ({"onboarding_status": "submitted", "mrtb_number": "12345"}, 0),
    ({}, 2),  # bookings or payouts
])
def test_an_established_physio_is_never_switched(switch_calls, fields, count):
    physio = _physio(**fields)
    result, _, _ = _role_turn(physio, "I'm a patient", count=count)
    assert result.reply_text == PHYSIO_LOCKED_REPLY
    result, _, _ = _role_turn(physio, "my back hurts", count=count)
    assert result is None
    assert switch_calls["removed"] == []


# ---- the patient side ---------------------------------------------------------------------------

def _patient_chat(*, extracted=ExtractedTriage(), substate=None, **patient_fields):
    patient = Patient(id=uuid4(), phone_e164="+2348000009102", **patient_fields)
    session = _Session(patient)
    state = ConversationState(
        phase=PatientPhase.FIRST_CONTACT, stage=ConversationStage.STORY_CAPTURE, last_known_language="en",
        summary_text=None, recent_messages=[], extracted=extracted, known_facts={},
        conversation_id=uuid4(), booking_substate=substate,
    )
    identity = Identity(persona=Persona.PATIENT, person_id=patient.id, phone_e164=patient.phone_e164)
    return session, state, identity


def test_a_new_patient_saying_physio_starts_physio_sign_up_and_keeps_the_patient_record():
    session, state, identity = _patient_chat()
    reply = turn_handler._patient_says_physio_reply(session, identity, state, "I'm a physiotherapist", None)
    assert "MRTB" in reply and "Reply *I'm a patient*" in reply
    physios = [row for row in session.added if isinstance(row, Physiotherapist)]
    assert len(physios) == 1 and physios[0].phone_e164 == identity.phone_e164
    assert session.get(Patient, identity.person_id) is not None  # kept, not deleted


def test_a_patient_with_a_story_or_booking_gets_the_sign_up_link_only():
    from app.models.types import ConditionArea

    story = ExtractedTriage(body_location="knee", onset="3 days", condition_area=ConditionArea.MSK)
    for kwargs in ({"extracted": story}, {"substate": "rh_awaiting_payment"}):
        session, state, identity = _patient_chat(**kwargs)
        reply = turn_handler._patient_says_physio_reply(session, identity, state, "I'm a physio", None)
        assert reply == PHYSIO_SIGNUP_REPLY and PHYSIO_SIGNUP_URL in reply
        assert not [row for row in session.added if isinstance(row, Physiotherapist)]


def test_pt_from_a_patient_never_creates_a_local_physio():
    session, state, identity = _patient_chat()
    assert turn_handler._patient_says_physio_reply(session, identity, state, "PT", None) == PHYSIO_SIGNUP_REPLY
    assert not session.added


# ---- whole conversations (need Postgres: CI) ----------------------------------------------------

def _new_phone() -> str:
    return f"+234809{uuid4().int % 10**7:07d}"


def test_tester_stuck_in_physio_sign_up_can_become_a_patient(db_session, fake_llm):
    from sqlalchemy import select

    from app.conversation.turn_handler import handle_turn
    from app.identity.resolver import resolve

    phone = _new_phone()
    first = handle_turn(db_session, phone, "I'm a physio", fake_llm)
    assert "mrtb" in first.reply_text.lower()

    asked = handle_turn(db_session, phone, "my knee hurts when I walk", fake_llm)
    assert asked.reply_text == ROLE_QUESTION

    switched = handle_turn(db_session, phone, "Patient", fake_llm)
    assert switched.reply_text.startswith(SWITCHED_PREFIX)
    assert "mrtb" not in switched.reply_text.lower()
    assert db_session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone)) is None
    assert resolve(db_session, phone).persona == Persona.PATIENT


def test_a_verified_physio_is_never_switched(db_session, fake_llm):
    from sqlalchemy import select

    from app.conversation.turn_handler import handle_turn

    phone = _new_phone()
    db_session.add(Physiotherapist(phone_e164=phone, verified=True, onboarding_status="verified", mrtb_number="1"))
    db_session.flush()
    result = handle_turn(db_session, phone, "I'm a patient", fake_llm)
    assert result.reply_text == PHYSIO_LOCKED_REPLY
    assert db_session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone)) is not None


def test_hello_then_physio_then_patient_round_trip_keeps_the_patient(db_session, fake_llm):
    from sqlalchemy import select

    from app.conversation.turn_handler import handle_turn
    from app.identity.resolver import resolve

    phone = _new_phone()
    handle_turn(db_session, phone, "Hi", fake_llm)
    patient = db_session.scalar(select(Patient).where(Patient.phone_e164 == phone))
    assert patient is not None

    to_physio = handle_turn(db_session, phone, "I'm a physiotherapist", fake_llm)
    assert "mrtb" in to_physio.reply_text.lower()
    assert resolve(db_session, phone).persona == Persona.PHYSIO

    back = handle_turn(db_session, phone, "I'm a patient", fake_llm)
    assert back.reply_text.startswith(SWITCHED_PREFIX)
    assert resolve(db_session, phone).person_id == patient.id


def test_pt_after_hello_gets_the_sign_up_link_when_rh_does_not_know_the_number(db_session, fake_llm, monkeypatch):
    """The welcome says "reply PT", but "Hi" has already made the number a patient."""
    from types import SimpleNamespace

    from sqlalchemy import select

    from app.conversation.turn_handler import handle_turn

    looked_up = []

    def resolve_physiotherapist(phone, actor):
        looked_up.append(phone)
        return SimpleNamespace(resolution="NO_MATCH", physiotherapist_id=None, rh_user_id=None)

    rh = SimpleNamespace(
        resolve_physiotherapist=resolve_physiotherapist,
        operational_query=lambda *args, **kwargs: {"resolution": "NOT_FOUND"},  # not a family member either
    )
    monkeypatch.setattr(turn_handler, "configured_rh_client", lambda: rh)
    phone = _new_phone()
    handle_turn(db_session, phone, "Hello", fake_llm)
    result = handle_turn(db_session, phone, "PT", fake_llm)
    assert looked_up == [phone]
    assert result.reply_text == PHYSIO_SIGNUP_REPLY
    assert db_session.scalar(select(Physiotherapist).where(Physiotherapist.phone_e164 == phone)) is None


def test_new_number_asking_for_a_human_is_called_back(db_session, fake_llm, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    alerts = []
    monkeypatch.setattr("app.admin.escalation_router.route_escalation", lambda session, kind, payload: alerts.append((kind, payload)))
    monkeypatch.setattr("app.booking.booking_flow._rh_patient_id", lambda session, patient: None)
    phone = _new_phone()
    result = handle_turn(db_session, phone, "abeg make una call me", fake_llm)
    assert f"call you on {phone}" in result.reply_text
    assert alerts and alerts[0][0] == "callback"


def test_physio_asking_for_a_human_alerts_the_team(db_session, fake_llm, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    alerts = []
    monkeypatch.setattr("app.admin.escalation_router.route_escalation", lambda session, kind, payload: alerts.append((kind, payload)))
    phone = _new_phone()
    db_session.add(Physiotherapist(phone_e164=phone, verified=True, onboarding_status="verified", mrtb_number="1"))
    db_session.flush()
    result = handle_turn(db_session, phone, "I want to speak to someone", fake_llm)
    assert result.reply_text.startswith("Of course. I've asked our team to call you")
    assert alerts[0][0] == "callback" and alerts[0][1]["role"] == Persona.PHYSIO.value


def test_summary_yes_reaches_the_safety_check_in_one_step(db_session, patient_identity, fake_llm):
    """New story -> one summary -> Yes -> safety check, end to end."""
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"body_location": "lower back", "onset": "2 weeks", "condition_area": "msk"}
    summary = handle_turn(db_session, patient_identity.phone_e164, "my lower back has hurt for 2 weeks", fake_llm)
    assert "tell me anything to change or add" in summary.reply_text
    fake_llm.extraction = {}
    after_yes = handle_turn(db_session, patient_identity.phone_e164, "Yes", fake_llm)
    assert "One quick safety check" in after_yes.reply_text
    assert "anything else" not in after_yes.reply_text.lower()
    assert after_yes.blocked_by_safety is False
