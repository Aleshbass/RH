"""The physio's exercise plan on WhatsApp: showing it as sent, DONE logging, daily reminders."""

from datetime import datetime, timedelta, timezone

import pytest

from app.exercises import programme as ex
from app.models.patient import Patient
from app.models.rh_identity_mapping import RHIdentityMapping

PLAN = {
    "programme_id": "prog-1", "title": "Knee, week 1", "sender_name": "Tolu Ade", "note": None,
    "goals": ["Climb stairs without the rail"], "locked": False, "done_today": [],
    "items": [
        {"index": 0, "kind": "exercise", "name": "Quad sets", "sets": 3, "reps": 10, "hold_seconds": 5, "frequency": "Twice a day", "note": "Keep your heel on the floor", "side": "R",
         "image_url": "https://physioaroundme.com/exercise-library/v1/p/quad-sets-right.webp", "steps": ["Sit with your leg straight.", "Tighten the muscle on top of your thigh."]},
        {"index": 1, "kind": "education", "name": "Knee pain explained"},
        {"index": 2, "kind": "exercise", "name": "Straight leg raise", "sets": 2, "reps": 12, "hold_seconds": None, "frequency": None, "note": None, "side": None},
    ],
}


class _FakeRH:
    def __init__(self, *, allowed=True, programmes=None, log_result=None):
        self.allowed = allowed
        self.programmes = [PLAN] if programmes is None else programmes
        self.log_result = log_result or {"logged": 2, "programme_id": "prog-1", "already_done": False}
        self.calls = []

    def operational_query(self, operation, *, actor, data):
        self.calls.append((operation, data))
        if operation == "patient_programme":
            return {"care_plan_url": "https://physioaroundme.com/dashboard/patient/treatment-plans#today", "programmes": self.programmes}
        if operation == "patient_recovery_plan":
            return {"joy_reminders_allowed": self.allowed}
        raise AssertionError(operation)

    def operational_mutation(self, operation, *, actor, data, idempotency_key):
        self.calls.append((operation, data))
        return self.log_result


@pytest.fixture
def rh(db_session, patient_identity, monkeypatch):
    db_session.add(RHIdentityMapping(persona="patient", joy_person_id=patient_identity.person_id, rh_record_id="rh-pat-1"))
    db_session.flush()
    fake = _FakeRH()
    monkeypatch.setattr(ex, "configured_rh_client", lambda: fake)
    return fake


def test_the_plan_card_shows_only_what_the_physio_sent():
    text = ex.programme_text(PLAN, "https://example.test/plan")
    assert text.startswith("🏋️ *Your exercise plan*\n_From Tolu Ade · Knee, week 1_")
    assert "*1. Quad sets* (right)\n3 sets × 10 · hold 5 sec\n🕒 Twice a day\n💬 _Keep your heel on the floor_" in text
    assert "*2. Straight leg raise*\n2 sets × 12" in text
    assert "📖 *To read:* Knee pain explained" in text
    assert "🎯 *Your goals:* Climb stairs without the rail" in text
    assert "▶️ Watch them move: https://example.test/plan" in text


def test_picture_caption_has_the_library_steps_and_the_physio_note():
    caption = ex.image_caption(1, PLAN["items"][0])
    assert caption == (
        "*1. Quad sets* (right)\n3 sets × 10 · hold 5 sec · Twice a day\n\n*How to do it*\n"
        "1. Sit with your leg straight.\n2. Tighten the muscle on top of your thigh.\n\n"
        "💬 Your physio: _Keep your heel on the floor_"
    )


def test_asking_for_exercises_shows_the_plan_with_buttons(db_session, patient_identity, fake_llm, rh):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(db_session, patient_identity.phone_e164, "my exercises", fake_llm)
    assert "*1. Quad sets*" in result.reply_text
    # The card, then the one exercise with a picture, then the buttons at the bottom
    assert result.interactive is None
    picture, last = result.after
    assert picture["image_url"].endswith("quad-sets-right.webp") and picture["caption"].startswith("*1. Quad sets*")
    assert "Reply *DONE*" in last["text"]
    assert [b["reply"]["title"] for b in last["interactive"]["action"]["buttons"]] == ["Done today ✅", "Daily reminder"]
    assert db_session.get(Patient, patient_identity.person_id).exercise_prompted_at is not None


def test_without_pictures_the_buttons_go_on_the_card(db_session, patient_identity, fake_llm, rh):
    from app.conversation.turn_handler import handle_turn

    rh.programmes = [{**PLAN, "items": [{**item, "image_url": None} for item in PLAN["items"]]}]
    result = handle_turn(db_session, patient_identity.phone_e164, "my exercises", fake_llm)
    assert result.after is None and "Reply *DONE*" in result.reply_text
    assert result.interactive["type"] == "button"


def test_no_plan_yet_is_said_plainly(db_session, patient_identity, fake_llm, rh):
    from app.conversation.turn_handler import handle_turn

    rh.programmes = []
    result = handle_turn(db_session, patient_identity.phone_e164, "What exercises should I do?", fake_llm)
    assert result.reply_text.startswith("You don't have an exercise plan from a physiotherapist yet.")


def test_done_after_the_plan_logs_the_session(db_session, patient_identity, fake_llm, rh):
    from app.conversation.turn_handler import handle_turn

    handle_turn(db_session, patient_identity.phone_e164, "my exercises", fake_llm)
    result = handle_turn(db_session, patient_identity.phone_e164, "DONE", fake_llm)
    assert result.reply_text.startswith("Well done! I've logged today's exercises.")
    assert "Type *CHECK IN*" in result.reply_text
    assert rh.calls[-1] == ("patient_log_exercise", {"patient_id": "rh-pat-1"})


def test_done_with_a_number_and_high_pain(db_session, patient_identity, rh):
    patient = db_session.get(Patient, patient_identity.person_id)
    patient.exercise_prompted_at = datetime.now(timezone.utc)
    reply = ex.done_command(db_session, patient, "done 2, pain 8")
    assert reply.startswith("Well done! I've logged exercise 2. Pain of 8/10 is high")
    # exercise 2 for the patient is programme item 2 (item 1 is reading)
    assert rh.calls[-1][1] == {"patient_id": "rh-pat-1", "item_index": 2, "pain_score": 8, "programme_id": "prog-1"}


def test_done_without_a_recent_plan_or_reminder_is_left_to_the_chat(db_session, patient_identity, rh):
    patient = db_session.get(Patient, patient_identity.person_id)
    patient.exercise_prompted_at = datetime.now(timezone.utc) - timedelta(days=2)
    assert ex.done_command(db_session, patient, "done") is None


def test_reminder_time_and_pause(db_session, patient_identity, rh):
    patient = db_session.get(Patient, patient_identity.person_id)
    assert "7am or 7pm" in ex.reminder_command(db_session, patient, "remind me at 7")
    reply = ex.reminder_command(db_session, patient, "remind me at 6:30pm")
    assert "every day at 6:30pm" in reply
    assert (patient.exercise_reminders, patient.exercise_reminder_time) == ("on", "18:30")
    assert "stopped your exercise reminders" in ex.reminder_command(db_session, patient, "STOP")
    assert patient.exercise_reminders == "paused"
    assert "every day at 6:30pm" in ex.reminder_command(db_session, patient, "start")


def test_bare_stop_without_reminders_is_ordinary_chat(db_session, patient_identity, rh):
    patient = db_session.get(Patient, patient_identity.person_id)
    assert ex.reminder_command(db_session, patient, "stop") is None
    assert "stopped" in ex.reminder_command(db_session, patient, "stop reminders")


def test_reminders_need_flex_max(db_session, patient_identity, rh):
    rh.allowed = False
    patient = db_session.get(Patient, patient_identity.person_id)
    assert "come with Flex Max" in ex.reminder_command(db_session, patient, "remind me daily")
    assert patient.exercise_reminders is None


def test_daily_reminder_goes_once_after_the_chosen_time(db_session, patient_identity, rh):
    patient = db_session.get(Patient, patient_identity.person_id)
    patient.exercise_reminders, patient.exercise_reminder_time = "on", "07:00"
    db_session.flush()
    sent = []
    sender = lambda phone, text, buttons, **kw: sent.append((phone, text, buttons))  # noqa: E731
    six = datetime(2026, 11, 4, 5, 0, tzinfo=timezone.utc)  # 6am Lagos
    assert ex.process_exercise_reminders_once(now=six, session=db_session, sender=sender) == 0
    eight = six + timedelta(hours=2)
    assert ex.process_exercise_reminders_once(now=eight, session=db_session, sender=sender) == 1
    assert ex.process_exercise_reminders_once(now=eight + timedelta(minutes=5), session=db_session, sender=sender) == 0
    phone, text, buttons = sent[0]
    assert phone == patient_identity.phone_e164
    assert text.startswith("⏰ *Time for today's exercises*, Ada\n_From Tolu Ade · Knee, week 1_")
    assert "1. Quad sets (right) · 3 sets × 10 · hold 5 sec" in text
    assert [b["reply"]["id"] for b in buttons["action"]["buttons"]] == ["DONE", "my exercises", "PAUSE"]


def test_no_reminder_once_today_is_done(db_session, patient_identity, rh):
    rh.programmes = [{**PLAN, "done_today": [0, 2]}]
    patient = db_session.get(Patient, patient_identity.person_id)
    patient.exercise_reminders, patient.exercise_reminder_time = "on", "07:00"
    db_session.flush()
    sent = []
    eight = datetime(2026, 11, 4, 7, 0, tzinfo=timezone.utc)
    assert ex.process_exercise_reminders_once(now=eight, session=db_session, sender=lambda *a, **k: sent.append(a)) == 0
    assert sent == []


def test_worker_sends_pictures_then_buttons_after_the_card(monkeypatch):
    from app.models.types import TurnResult
    from app.queue import worker

    sent = []
    monkeypatch.setattr("app.exercises.media.send_exercise_image", lambda phone, url, caption: sent.append(("image", caption)) or True)
    monkeypatch.setattr(worker, "send_whatsapp_interactive", lambda phone, text, interactive, **kw: sent.append(("buttons", text)))
    result = TurnResult(reply_text="card", language="en", phase="first_contact", after=[
        {"image_url": "https://physioaroundme.com/x.webp", "caption": "*1. Quad sets*"},
        {"text": "Reply DONE", "interactive": {"type": "button"}},
    ])
    worker._send_after("+2348000000000", result)
    assert sent == [("image", "*1. Quad sets*"), ("buttons", "Reply DONE")]


def test_webp_posters_become_jpegs_on_white():
    import io

    from PIL import Image

    from app.exercises.media import jpeg_from

    source = io.BytesIO()
    Image.new("RGBA", (1200, 600), (0, 0, 0, 0)).save(source, format="WEBP")
    jpeg = jpeg_from(source.getvalue())
    with Image.open(io.BytesIO(jpeg)) as image:
        assert image.format == "JPEG" and image.size == (900, 450)
        assert image.getpixel((10, 10)) == (255, 255, 255)
