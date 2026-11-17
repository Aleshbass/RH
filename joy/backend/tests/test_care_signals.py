"""In-care escalations (Joy coordination spec): a fall or new injury, "I'm worried", and high pain."""
import pytest

from app.conversation.care_signals import care_signal


@pytest.mark.parametrize("text,kind", [
    ("I fell this morning", "fall"),
    ("I slipped in the bathroom", "fall"),
    ("I had a fall yesterday", "fall"),
    ("I twisted my ankle at work", "fall"),
    ("I think it's a new injury", "fall"),
    ("I'm worried about my knee", "worry"),
    ("I am really scared", "worry"),
    ("something is not right", "worry"),
    ("I dey fear small", "worry"),
])
def test_signals(text, kind):
    assert care_signal(text) == kind


@pytest.mark.parametrize("text", ["I haven't fallen", "my knee feels better", "done", "how many sets?", "no new injury"])
def test_not_signals(text):
    assert care_signal(text) is None


@pytest.fixture
def in_care(monkeypatch, db_session):
    from app.conversation import turn_handler

    summary = {"has_physio": True, "first_name": "Ada", "physio_name": "Bisi Okafor", "clinic_name": None,
               "care_type": "rehabify_care", "programme": None, "next_appointment": None}
    monkeypatch.setattr(turn_handler, "in_care", lambda *a, **k: summary)
    sent = []

    class RH:
        def message_physio(self, *, patient_id, message, actor):
            sent.append(message)
            return {"sent": True}

    monkeypatch.setattr("app.integrations.rh_client.configured_rh_client", lambda: RH())
    monkeypatch.setattr("app.booking.booking_flow._rh_patient_id", lambda session, patient: "rh-1")
    return sent


def test_a_fall_stops_the_exercises_and_tells_the_physio(db_session, patient_identity, in_care):
    from app.conversation.turn_handler import handle_turn
    from tests.fakes import FakeLLM

    result = handle_turn(db_session, patient_identity.phone_e164, "I fell on the stairs this morning", FakeLLM(reply="Okay."))
    assert result.reply_text.startswith("Please stop the exercises for now.")
    assert "112" in result.reply_text and "Bisi Okafor" in result.reply_text
    assert in_care and "a fall or new injury" in in_care[0]


def test_worried_tells_the_physio_right_away(db_session, patient_identity, in_care):
    from app.conversation.turn_handler import handle_turn
    from tests.fakes import FakeLLM

    result = handle_turn(db_session, patient_identity.phone_e164, "I'm worried about my knee", FakeLLM(reply="Okay."))
    assert result.reply_text.startswith("I've told Bisi Okafor right away.")
    assert in_care and "worried" in in_care[0]
