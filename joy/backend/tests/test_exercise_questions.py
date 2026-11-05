"""Questions about an exercise: answered only from the physio's plan, otherwise sent to the physio."""

from datetime import datetime, timezone

import pytest

PROGRAMME = {
    "programmes": [{
        "programme_id": "prog1", "sender_name": "Ada Obi",
        "items": [
            {"index": 0, "name": "Glute bridge", "sets": 3, "reps": 10, "frequency": "Daily",
             "steps": ["Lie on your back", "Lift your hips"], "note": "Squeeze at the top",
             "image_url": "https://cdn.example/bridge.webp"},
            {"index": 1, "name": "Calf raise", "sets": 2, "reps": 15, "note": ""},
            {"index": 2, "kind": "education", "name": "Back pain leaflet"},
        ],
    }],
}


@pytest.fixture
def plan(monkeypatch):
    asked = []

    class _RH:
        def operational_mutation(self, operation, *, actor, data, idempotency_key):
            asked.append((operation, data))
            return {"sent": True, "physio_name": "Ada Obi"}

    monkeypatch.setattr("app.integrations.rh_client.configured_rh_client", lambda: _RH())
    monkeypatch.setattr("app.exercises.questions._rh_patient", lambda session, patient: "rh-pat-1")
    monkeypatch.setattr("app.exercises.questions.fetch_programmes", lambda patient, rh_id: PROGRAMME)
    return asked


def _patient(db_session, patient_identity, *, prompted=True):
    from app.models.patient import Patient

    patient = db_session.get(Patient, patient_identity.person_id)
    patient.exercise_prompted_at = datetime.now(timezone.utc) if prompted else None
    db_session.flush()
    return patient


def test_how_to_do_an_exercise_by_name_sends_its_picture_and_steps(db_session, patient_identity, plan):
    from app.exercises.questions import exercise_question_turn

    reply, after = exercise_question_turn(db_session, _patient(db_session, patient_identity), "How do I do the bridge?")
    assert reply == "Here's how to do *Glute bridge* 👇"
    assert after[0]["image_url"] == "https://cdn.example/bridge.webp"
    assert "Lift your hips" in after[0]["caption"] and "Squeeze at the top" in after[0]["caption"]
    assert plan == []


def test_dose_question_by_number_quotes_the_physio(db_session, patient_identity, plan):
    from app.exercises.questions import exercise_question_turn

    reply, after = exercise_question_turn(db_session, _patient(db_session, patient_identity), "how many reps for exercise 2?")
    assert reply.startswith("*2. Calf raise*\n2 sets × 15")
    assert "ask them first" in reply and after == []


def test_anything_else_goes_to_the_physio(db_session, patient_identity, plan):
    from app.exercises.questions import exercise_question_turn

    reply, _ = exercise_question_turn(db_session, _patient(db_session, patient_identity), "Can I do the first exercise twice a day?")
    assert reply.startswith("That's one for your physio, so I've sent your question to Ada Obi (about Glute bridge).")
    assert plan == [("patient_ask_physio", {"patient_id": "rh-pat-1", "question": "Can I do the first exercise twice a day?", "exercise": "Glute bridge"})]


def test_an_exercise_that_hurts_goes_to_the_physio_with_the_safety_line(db_session, patient_identity, plan):
    from app.exercises.questions import exercise_question_turn

    reply, _ = exercise_question_turn(db_session, _patient(db_session, patient_identity), "exercise 2 hurts my knee a bit")
    assert "sent your question to Ada Obi (about Calf raise)" in reply
    assert "stop it for now" in reply


@pytest.mark.parametrize("text", [
    "my knee hurts when I climb stairs",      # no exercise mentioned, plan not shown recently
    "How do I pay?",
    "thanks",
])
def test_other_messages_are_left_alone(db_session, patient_identity, plan, text):
    from app.exercises.questions import exercise_question_turn

    assert exercise_question_turn(db_session, _patient(db_session, patient_identity, prompted=False), text) is None
    assert plan == []


def test_a_plan_shown_recently_lets_a_name_alone_match(db_session, patient_identity, plan):
    from app.exercises.questions import exercise_question_turn

    patient = _patient(db_session, patient_identity)
    reply, _ = exercise_question_turn(db_session, patient, "is the calf one supposed to feel tight?")
    assert "(about Calf raise)" in reply
    assert exercise_question_turn(db_session, patient, "is it going to rain today?") is None


def test_whole_turn_sends_the_picture_after_the_reply(db_session, patient_identity, fake_llm, plan):
    from app.conversation.turn_handler import handle_turn

    _patient(db_session, patient_identity)
    result = handle_turn(db_session, patient_identity.phone_e164, "how do I do exercise 1?", fake_llm)
    assert result.reply_text == "Here's how to do *Glute bridge* 👇"
    assert result.after and result.after[0]["image_url"].endswith("bridge.webp")
