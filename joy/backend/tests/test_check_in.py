"""Pain and progress check-ins on WhatsApp: four code-owned questions, then Rehabify alerts the physio."""

import pytest

from app.conversation.check_in import CHECK_IN_KEY, START_RE


@pytest.mark.parametrize("text", ["check in", "CHECK IN", "Check-in", "I want to check in", "pain update", "update my physio"])
def test_check_in_requests_are_recognised(text):
    assert START_RE.fullmatch(text)


@pytest.mark.parametrize("text", ["when do I check in for my appointment?", "my knee hurts", "DONE"])
def test_other_messages_do_not_start_one(text):
    assert not START_RE.fullmatch(text)


@pytest.fixture
def rh(monkeypatch):
    calls = []
    result = {"saved": True, "flagged": False, "has_physio": True}

    class _RH:
        def operational_mutation(self, operation, *, actor, data, idempotency_key):
            calls.append((operation, data))
            return dict(result)

    monkeypatch.setattr("app.integrations.rh_client.configured_rh_client", lambda: _RH())
    monkeypatch.setattr("app.booking.booking_flow._rh_patient_id", lambda session, patient: "rh-pat-1")
    return calls, result


def _turn(db_session, patient_identity, fake_llm, text):
    from app.conversation.turn_handler import handle_turn

    return handle_turn(db_session, patient_identity.phone_e164, text, fake_llm)


def test_a_full_check_in_reaches_the_physio(db_session, patient_identity, fake_llm, rh):
    calls, _ = rh
    first = _turn(db_session, patient_identity, fake_llm, "check in")
    assert first.reply_text.startswith("Let's do a quick check-in") and "0 (no pain) to 10" in first.reply_text

    retry = _turn(db_session, patient_identity, fake_llm, "about eleven")
    assert retry.reply_text.startswith("Please reply with a number from 0")

    second = _turn(db_session, patient_identity, fake_llm, "6")
    assert second.reply_text.startswith("2/4") and second.interactive["type"] == "button"

    third = _turn(db_session, patient_identity, fake_llm, "some")
    assert third.reply_text.startswith("3/4") and third.interactive["type"] == "list"

    fourth = _turn(db_session, patient_identity, fake_llm, "okay")
    assert fourth.reply_text.startswith("4/4")

    done = _turn(db_session, patient_identity, fake_llm, "The bridge exercise makes my back ache")
    assert done.reply_text == "Thanks, I've sent this to your physio. Keep going with your exercises!"
    assert calls == [("patient_check_in", {
        "patient_id": "rh-pat-1", "pain_score": 6, "exercises_done": "some", "mood": "okay",
        "note": "The bridge exercise makes my back ache",
    })]

    from app.conversation.state_manager import load
    from app.models.conversation import Conversation

    state = load(db_session, patient_identity)
    assert CHECK_IN_KEY not in (db_session.get(Conversation, state.conversation_id).booking_context or {})


def test_stop_ends_the_check_in_not_the_reminders(db_session, patient_identity, fake_llm, rh):
    calls, _ = rh
    _turn(db_session, patient_identity, fake_llm, "check in")
    stopped = _turn(db_session, patient_identity, fake_llm, "stop")
    assert stopped.reply_text.startswith("No problem, I've stopped the check-in")
    assert calls == []


def test_high_pain_and_no_physio_are_told_plainly(db_session, patient_identity, fake_llm, rh):
    calls, result = rh
    result.update(flagged=True, has_physio=False)
    for text in ("check in", "9", "none", "low"):
        _turn(db_session, patient_identity, fake_llm, text)
    done = _turn(db_session, patient_identity, fake_llm, "Nothing else")
    assert done.reply_text.startswith("Thanks, I've saved your check-in to your Rehabify record.")
    assert "call 112" in done.reply_text
    assert "note" not in calls[0][1]


def test_too_soon_is_explained(db_session, patient_identity, fake_llm, rh):
    _, result = rh
    result.update(saved=False, reason="too_soon")
    for text in ("check in", "3", "all", "great"):
        _turn(db_session, patient_identity, fake_llm, text)
    done = _turn(db_session, patient_identity, fake_llm, "no")
    assert done.reply_text.startswith("You checked in a few minutes ago")


def test_warning_signs_mid_check_in_go_to_the_safety_engine(db_session, patient_identity, fake_llm, rh):
    calls, _ = rh
    _turn(db_session, patient_identity, fake_llm, "check in")
    result = _turn(db_session, patient_identity, fake_llm, "I have crushing chest pain")
    assert not result.reply_text.startswith(("2/4", "Please reply with a number"))
    assert calls == []
