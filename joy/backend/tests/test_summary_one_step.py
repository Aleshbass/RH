"""The summary is one step: "Yes" goes straight to the safety check, anything else is a correction.

Before Nov 2026 Joy asked "Is that correct? Reply Yes or No", then "Is there anything else…? Reply
Yes or No", then the safety check. These run the summary state machine (_reply_after_extract) on
unsaved records with a stand-in session, so they need no database.
"""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest

import app.conversation  # noqa: F401  (Joy's import order)
from app.conversation import turn_handler
from app.conversation.interactive import interactive_for
from app.conversation.state_manager import ConversationState
from app.conversation.turn_handler import (
    _AWAITING_ADDITIONAL_DETAILS,
    _AWAITING_SAFETY_SCREEN,
    _AWAITING_SUMMARY_CONFIRMATION,
    _AWAITING_SUMMARY_CORRECTION,
    _COLLECTING_ADDITIONAL_DETAILS,
    _MAX_SUMMARY_REPEATS,
    _SUMMARY_ROUNDS_KEY,
    _TRIAGE_FLOW_KEY,
    _can_skip_model_for_safety_reply,
    _defer_amber_until_summary_is_complete,
    _is_bare_summary_confirmation,
    _is_bare_summary_rejection,
    _reply_after_extract,
    _summary_change,
)
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.types import (
    ConditionArea,
    ConversationStage,
    ExtractedTriage,
    Identity,
    PatientPhase,
    Persona,
    SafetyResult,
    TurnResult,
)
from app.safety.protocol_runtime import NO, schedule_questions


class _Session:
    """Just enough of a SQLAlchemy session for the summary steps: get, add and flush."""

    def __init__(self, *rows):
        self.rows = {(type(row), row.id): row for row in rows}

    def get(self, model, key):
        return self.rows.get((model, key))

    def add(self, row):
        pass

    def flush(self):
        pass

    def scalar(self, *args, **kwargs):
        return None


KNEE = ExtractedTriage(
    body_location="left knee", onset="4 days", symptoms=["swelling"],
    condition_area=ConditionArea.MSK,
)


def _cleared(extracted: ExtractedTriage) -> ExtractedTriage:
    questions = schedule_questions(extracted, limit=100)
    return extracted.model_copy(update={
        "safety_answers": {q.id: NO for q in questions},
        "safety_question_order": [q.id for q in questions],
    })


def _patient_at(flow_state: str | None, before: ExtractedTriage = KNEE, **context):
    patient = Patient(id=uuid4(), phone_e164="+2348000009001", name="Ada")
    booking_context = {**({_TRIAGE_FLOW_KEY: flow_state} if flow_state else {}), **context}
    conversation = Conversation(
        id=uuid4(), person_id=patient.id, persona=Persona.PATIENT, booking_context=booking_context,
    )
    state = ConversationState(
        phase=PatientPhase.POST_TRIAGE, stage=ConversationStage.TRIAGE_SUMMARY, last_known_language="en",
        summary_text=None, recent_messages=[], extracted=before, known_facts={},
        conversation_id=conversation.id, booking_context=dict(booking_context),
    )
    identity = Identity(persona=Persona.PATIENT, person_id=patient.id, phone_e164=patient.phone_e164)
    return _Session(patient, conversation), state, conversation, identity


def _turn(flow_state, text, *, before=KNEE, after=None, **context):
    session, state, conversation, identity = _patient_at(flow_state, before, **context)
    reply, phase = _reply_after_extract(
        session, state, text, "", after if after is not None else before, PatientPhase.POST_TRIAGE, identity,
    )
    return reply, phase, conversation


@pytest.fixture(autouse=True)
def _policy(monkeypatch):
    """An approved booking policy from RH, so the GREEN route can be followed to its end."""
    document = SimpleNamespace(
        policy_id="p1", version="2026-10-28", url="https://example.test/policy", content_sha256="x",
        effective_at=None, acceptance_text="I accept", language="en", is_approved=True,
    )
    monkeypatch.setattr(turn_handler, "configured_rh_client", lambda: SimpleNamespace(current_policy=lambda **_: document))


# ---- the first summary --------------------------------------------------------------------------

def test_the_story_is_summarised_once_with_one_way_to_confirm_or_change():
    reply, phase, conversation = _turn(None, "my left knee hurts")
    assert phase == PatientPhase.POST_TRIAGE
    assert "left knee" in reply
    assert "Reply *Yes* if that’s right, or tell me anything to change or add." in reply
    assert "anything else" not in reply.lower() and "reply yes or no" not in reply.lower()
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SUMMARY_CONFIRMATION
    assert conversation.booking_context[_SUMMARY_ROUNDS_KEY] == 0
    # The tap-to-answer buttons still fit: Yes / Change something
    buttons = interactive_for(conversation)["action"]["buttons"]
    assert [b["reply"]["id"] for b in buttons] == ["yes", "no"]


# ---- Yes ----------------------------------------------------------------------------------------

@pytest.mark.parametrize("text", ["Yes", "yes that's correct", "Yh this is right", "ok", "That’s right", "nothing to change"])
def test_yes_goes_straight_to_the_safety_check(text):
    reply, phase, conversation = _turn(_AWAITING_SUMMARY_CONFIRMATION, text)
    assert phase == PatientPhase.MID_TRIAGE
    assert reply.startswith("Great, thanks.")
    assert "One quick safety check" in reply
    assert "anything else" not in reply.lower()
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SAFETY_SCREEN


def test_yes_with_nothing_left_to_screen_goes_on_to_the_consultation():
    cleared = _cleared(KNEE)
    reply, phase, conversation = _turn(_AWAITING_SUMMARY_CONFIRMATION, "Yes", before=cleared)
    assert phase == PatientPhase.POST_TRIAGE
    assert "initial consultation with a clinician" in reply
    assert "https://example.test/policy" in reply
    assert conversation.booking_substate == "awaiting_policy_acceptance"


def test_an_amber_result_after_yes_is_returned_as_the_finished_turn(monkeypatch):
    """It used to come back as a TurnResult in place of reply text and crash the turn."""
    amber = SafetyResult(fired=False, rule_ids=["X"], reason_plain_language="", action="specialist_review", risk_level="AMBER")
    finished = TurnResult(reply_text="specialist review", language="en", phase="post_triage", blocked_by_safety=True)
    monkeypatch.setattr(turn_handler, "evaluate", lambda extracted: amber)
    monkeypatch.setattr(turn_handler, "_amber_specialist_reply", lambda *args, **kwargs: finished)
    reply, _, _ = _turn(_AWAITING_SUMMARY_CONFIRMATION, "Yes", before=_cleared(KNEE))
    assert reply is finished


def test_a_summary_yes_is_never_a_safety_answer():
    assert _can_skip_model_for_safety_reply(KNEE, "Yes", safety_screen_active=False) is False
    assert _can_skip_model_for_safety_reply(KNEE, "No", safety_screen_active=False) is False


def test_amber_still_waits_for_the_summary_to_be_finished():
    for flow in (None, _AWAITING_SUMMARY_CONFIRMATION, _AWAITING_SUMMARY_CORRECTION):
        context = {_TRIAGE_FLOW_KEY: flow} if flow else {}
        assert _defer_amber_until_summary_is_complete(context, "yes") is True
    assert _defer_amber_until_summary_is_complete({_TRIAGE_FLOW_KEY: _AWAITING_SAFETY_SCREEN}, "yes") is False


# ---- No / corrections ---------------------------------------------------------------------------

@pytest.mark.parametrize("text", ["No", "no", "Change something", "That's not right", "not correct"])
def test_a_plain_no_asks_what_to_change(text):
    reply, _, conversation = _turn(_AWAITING_SUMMARY_CONFIRMATION, text)
    assert reply == "No problem. What should I change or add?"
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SUMMARY_CORRECTION


def test_a_corrected_fact_is_shown_back_for_a_yes():
    after = KNEE.model_copy(update={"body_location": "right knee"})
    reply, phase, conversation = _turn(_AWAITING_SUMMARY_CORRECTION, "It's my right knee, not the left", after=after)
    assert phase == PatientPhase.POST_TRIAGE
    assert reply.startswith("Thanks, I’ve updated that.")
    assert "right knee" in reply and "tell me anything to change or add" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SUMMARY_CONFIRMATION
    assert conversation.booking_context[_SUMMARY_ROUNDS_KEY] == 1


def test_a_correction_typed_straight_after_the_summary_is_shown_back_too():
    after = KNEE.model_copy(update={"onset": "2 weeks"})
    reply, _, conversation = _turn(_AWAITING_SUMMARY_CONFIRMATION, "Actually it started 2 weeks ago", after=after)
    assert reply.startswith("Thanks, I’ve updated that.") and "2 weeks" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SUMMARY_CONFIRMATION


def test_extra_detail_is_noted_and_joy_carries_on():
    after = KNEE.model_copy(update={"aggravating": ["climbing stairs"]})
    reply, phase, conversation = _turn(_AWAITING_SUMMARY_CONFIRMATION, "It hurts more on the stairs", after=after)
    assert phase == PatientPhase.MID_TRIAGE
    assert reply.startswith("Thanks, I’ve added that.")
    assert "One quick safety check" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SAFETY_SCREEN


def test_after_an_explicit_no_extra_detail_is_shown_back():
    after = KNEE.model_copy(update={"previous_treatment": ["ibuprofen"]})
    reply, _, conversation = _turn(_AWAITING_SUMMARY_CORRECTION, "I forgot, I took ibuprofen", after=after)
    assert reply.startswith("Thanks, I’ve updated that.") and "ibuprofen" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SUMMARY_CONFIRMATION


@pytest.mark.parametrize("text", ["nothing", "No", "it's fine", "Yes"])
def test_nothing_to_change_after_no_carries_on(text):
    reply, _, conversation = _turn(_AWAITING_SUMMARY_CORRECTION, text)
    assert "One quick safety check" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SAFETY_SCREEN


def test_corrections_never_loop_forever():
    after = KNEE.model_copy(update={"body_location": "right knee"})
    reply, _, conversation = _turn(
        _AWAITING_SUMMARY_CONFIRMATION, "no wait, the right one", after=after,
        **{_SUMMARY_ROUNDS_KEY: _MAX_SUMMARY_REPEATS},
    )
    assert "One quick safety check" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SAFETY_SCREEN


def test_a_question_at_the_summary_gets_the_summary_question_again():
    reply, _, conversation = _turn(_AWAITING_SUMMARY_CONFIRMATION, "How much does it cost?")
    assert "is my summary above right?" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SUMMARY_CONFIRMATION


# ---- conversations that were mid-way when the flow changed --------------------------------------

def test_an_old_anything_else_question_still_completes():
    reply, _, conversation = _turn(_AWAITING_ADDITIONAL_DETAILS, "No")
    assert "One quick safety check" in reply
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SAFETY_SCREEN

    reply, _, conversation = _turn(_AWAITING_ADDITIONAL_DETAILS, "Yes")
    assert reply == "Please tell me anything else you think is important."
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _COLLECTING_ADDITIONAL_DETAILS

    reply, _, conversation = _turn(_COLLECTING_ADDITIONAL_DETAILS, "It clicks when I bend it")
    assert reply.startswith("Thanks, I’ve added that.")
    assert conversation.booking_context[_TRIAGE_FLOW_KEY] == _AWAITING_SAFETY_SCREEN


# ---- the pure checks ----------------------------------------------------------------------------

def test_summary_change_tells_a_correction_from_extra_detail():
    assert _summary_change(KNEE, KNEE) == "none"
    assert _summary_change(KNEE, KNEE.model_copy(update={"body_location": "Left  Knee"})) == "none"
    assert _summary_change(KNEE, KNEE.model_copy(update={"body_location": "right knee"})) == "material"
    assert _summary_change(KNEE, KNEE.model_copy(update={"onset": "2 weeks"})) == "material"
    # Words added to what was shown ("swelling" -> "swelling and clicking", "4 days ago, after a fall")
    # or a new line are additions, not corrections
    assert _summary_change(KNEE, KNEE.model_copy(update={"symptoms": ["swelling", "clicking"]})) == "detail"
    assert _summary_change(KNEE, KNEE.model_copy(update={"mechanism": "a fall"})) == "detail"
    assert _summary_change(KNEE, KNEE.model_copy(update={"previous_treatment": ["ice"]})) == "detail"
    # A fact the summary doesn't show changes nothing the patient saw
    assert _summary_change(KNEE, KNEE.model_copy(update={"severity": 7})) == "none"


@pytest.mark.parametrize("text", ["Yes", "yes.", "Yep", "ok", "Yes that's right", "Correct", "nothing", "That’s all"])
def test_bare_confirmations(text):
    assert _is_bare_summary_confirmation(text)


@pytest.mark.parametrize("text", [
    "yes but it's my right knee", "Yes and it started after football", "it's ok when I rest but hurts on walking",
    "No", "not right", "",
])
def test_not_bare_confirmations(text):
    assert not _is_bare_summary_confirmation(text)


def test_bare_rejections_do_not_swallow_a_correction():
    assert _is_bare_summary_rejection("No") and _is_bare_summary_rejection("No, change something")
    assert not _is_bare_summary_rejection("No, it's my right knee")
