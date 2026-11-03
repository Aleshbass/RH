"""The physio's intake and the tracking timeline, and referral codes from a new number."""

import uuid

import pytest

from app.booking import intake
from app.conversation.state_manager import load
from app.integrations.rh_client import RHIntegrationError
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.triage_session import TriageSession
from app.models.types import ExtractedTriage

POLICY = {"version": "2026-10-28", "acceptance_message_id": "wamid.accept.1"}


class _FakeRH:
    def __init__(self, fail=False):
        self.fail = fail
        self.intakes = []
        self.journeys = []

    def upsert_intake(self, payload):
        if self.fail:
            raise RHIntegrationError("DEPENDENCY_UNAVAILABLE", "down", retryable=True)
        self.intakes.append(payload)
        return {"intake_id": "i1"}

    def record_journey_event(self, **kwargs):
        if self.fail:
            raise RHIntegrationError("DEPENDENCY_UNAVAILABLE", "down", retryable=True)
        self.journeys.append(kwargs)
        return {}


@pytest.fixture
def story(db_session, patient_identity):
    state = load(db_session, patient_identity)
    triage = db_session.get(TriageSession, state.triage_session_id)
    triage.extracted = ExtractedTriage(
        main_complaint="Lower back pain", body_region="lower back", onset="after lifting a bag",
        duration="3 weeks", severity=6, aggravating=["sitting"], relieving=["walking"],
        comorbidities=["high blood pressure"], goals="Sit through church",
        safety_answers={"bladder_bowel_change": "no", "saddle_anesthesia": "no"},
    ).model_dump(mode="json")
    db_session.flush()
    conversation = db_session.get(Conversation, state.conversation_id)
    patient = db_session.get(Patient, patient_identity.person_id)
    return conversation, patient, triage


def test_the_intake_carries_the_story_and_the_safety_answers(story):
    conversation, patient, triage = story
    payload = intake.intake_payload(patient, conversation, triage, rh_patient_id="rh-1", booking_id="b-1", policy=POLICY)
    assert payload["patient_id"] == "rh-1" and payload["booking_id"] == "b-1"
    assert payload["assessment_id"] == str(triage.id) and payload["assessment_revision"] == 1
    assert payload["chief_complaint"] == "Lower back pain" and payload["pain_score"] == 6
    assert payload["duration"] == "3 weeks" and payload["aggravating_factors"] == ["sitting"]
    assert payload["medical_history"] == "high blood pressure"
    assert {"question": "bladder bowel change", "answer": "no", "flagged": False} in payload["red_flags"]
    assert payload["consent"]["share_with_clinician"] is True and payload["consent"]["policy_version"] == "2026-10-28"
    assert payload["clinician_summary"]


def test_send_intake_reaches_rehabify_and_never_blocks_a_booking(db_session, story, monkeypatch):
    conversation, patient, _ = story
    fake = _FakeRH()
    monkeypatch.setattr(intake, "configured_rh_client", lambda: fake)
    assert intake.send_intake(db_session, conversation, patient, rh_patient_id="rh-1", booking_id="b-1", policy=POLICY) is True
    assert fake.intakes[0]["booking_id"] == "b-1"
    fake.fail = True
    assert intake.send_intake(db_session, conversation, patient, rh_patient_id="rh-1", booking_id="b-1", policy=POLICY) is False


def test_journey_events_are_best_effort(monkeypatch):
    fake = _FakeRH()
    monkeypatch.setattr(intake, "configured_rh_client", lambda: fake)
    intake.journey("rh-1", "matches_shown", "matches-c1-online")
    assert fake.journeys == [{"patient_id": "rh-1", "stage": "matches_shown", "event_id": "matches-c1-online", "booking_id": None}]
    fake.fail = True
    intake.journey("rh-1", "payment_link_sent", "pay-1")  # no exception
    intake.journey(None, "matches_shown", "x")  # no patient yet: nothing to send


class _NoModel:
    def complete(self, prompt, user_text):
        raise AssertionError("the model should not decide this")


@pytest.mark.parametrize("text", ["START RHB-1234567890", "Hello, my doctor sent me. rhb - 1234567890"])
def test_a_referral_code_from_a_new_number_starts_a_patient(db_session, text):
    from app.identity.unknown_sender import resolve_unknown_sender

    decision = resolve_unknown_sender(db_session, f"+234805{uuid.uuid4().int % 10**7:07d}", text, _NoModel())
    assert decision.intent == "patient" and decision.identity is not None


def test_hi_from_a_new_number_needs_no_model(db_session):
    from app.identity.unknown_sender import resolve_unknown_sender

    decision = resolve_unknown_sender(db_session, f"+234805{uuid.uuid4().int % 10**7:07d}", "Hi", _NoModel())
    assert decision.intent == "patient"
