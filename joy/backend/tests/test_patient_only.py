"""Joy is for patients and their families (owner, 2026-11-07; JOY_PATIENT_ONLY).

Physios are never set up on WhatsApp and their commands point to the dashboard. They still
answer Joy's booking requests with "ACCEPT <booking ID>" / "REJECT <booking ID>".
"""
import uuid

import pytest
from sqlalchemy import func, select

from app.identity.unknown_sender import (
    PHYSIO_SIGN_UP_REPLY,
    PHYSIO_USE_DASHBOARD_REPLY,
    begin_unknown,
)
from app.models.physiotherapist import Physiotherapist
from app.models.rh_identity_mapping import RHIdentityMapping


class _FakeRH:
    def __init__(self):
        self.requests = []
        self.queries = []

    def resolve_physiotherapist(self, phone, actor):
        from app.integrations.rh_client import PhysiotherapistResolution

        return PhysiotherapistResolution(
            resolution="MATCH", physiotherapist_id="prof-po-1", rh_user_id="user-po-1",
            display_name="Tolu", capabilities=None,
        )

    def operational_query(self, operation, *, actor, data):
        self.queries.append(operation)
        if operation == "family_resolve":
            return {"resolution": "NONE"}
        return {"assigned_bookings": []}

    def _request(self, method, path, payload=None, idempotency_key=""):
        self.requests.append((method, path, payload))
        return {"recorded": True}


@pytest.fixture
def patient_only(monkeypatch):
    monkeypatch.setenv("JOY_PATIENT_ONLY", "true")
    fake = _FakeRH()
    monkeypatch.setattr("app.conversation.turn_handler.configured_rh_client", lambda: fake)
    return fake


def _phone() -> str:
    return f"+234807{uuid.uuid4().int % 10**7:07d}"


def _physio_count(db_session, phone) -> int:
    return db_session.scalar(select(func.count()).select_from(Physiotherapist).where(Physiotherapist.phone_e164 == phone))


def test_someone_saying_they_are_a_physio_is_sent_to_the_website(db_session, fake_llm, patient_only):
    from app.conversation.turn_handler import handle_turn

    phone = _phone()
    result = handle_turn(db_session, phone, "Hello, I am a physiotherapist and I want to join", fake_llm)
    assert result.reply_text == PHYSIO_SIGN_UP_REPLY
    assert "sign-up?as=physiotherapist" in result.reply_text
    assert _physio_count(db_session, phone) == 0


def test_pt_is_no_longer_a_physio_door(db_session, fake_llm, patient_only):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(db_session, _phone(), "PT", fake_llm)
    assert result.reply_text == PHYSIO_SIGN_UP_REPLY
    assert patient_only.requests == [] and patient_only.queries == []


def test_a_physio_already_on_joy_gets_the_dashboard_for_anything_else(db_session, fake_llm, patient_only):
    from app.conversation.turn_handler import handle_turn

    phone = _phone()
    db_session.add(Physiotherapist(phone_e164=phone))
    db_session.flush()
    for text in ("I'm available Monday 9am to 5pm", "WORK", "PT"):
        result = handle_turn(db_session, phone, text, fake_llm)
        assert result.reply_text == PHYSIO_USE_DASHBOARD_REPLY
    assert patient_only.queries == []


def test_a_physio_can_still_accept_a_booking(db_session, fake_llm, patient_only):
    from app.conversation.turn_handler import handle_turn

    phone = _phone()
    result = handle_turn(db_session, phone, "ACCEPT k57booking123", fake_llm)
    assert result.reply_text == "Booking response recorded by Rehabify."
    assert patient_only.requests[0][1] == "/api/v1/joy/bookings/k57booking123/respond"
    assert patient_only.requests[0][2]["response"] == "accept"
    assert "physio_work_summary" not in patient_only.queries
    mapping = db_session.scalar(select(RHIdentityMapping).where(RHIdentityMapping.rh_record_id == "prof-po-1"))
    assert mapping is not None


def test_the_welcome_and_unclear_question_dont_mention_physios(db_session, fake_llm, patient_only):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(db_session, _phone(), "Hi", fake_llm)
    assert "*PT*" not in result.reply_text and "physiotherapist, reply" not in result.reply_text
    assert "are you a physiotherapist" not in begin_unknown(db_session, _phone())


def test_off_by_default_physios_still_get_the_old_door(db_session, fake_llm, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    monkeypatch.delenv("JOY_PATIENT_ONLY", raising=False)
    assert "are you a physiotherapist" in begin_unknown(db_session, _phone())
    phone = _phone()
    handle_turn(db_session, phone, "Hello, I am a physiotherapist and I want to join", fake_llm)
    assert _physio_count(db_session, phone) == 1
