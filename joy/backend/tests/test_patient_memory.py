"""Joy's long-term memory: quiet chats are folded into one note per patient, which every turn sees."""
from datetime import datetime, timedelta, timezone

from app.conversation import memory
from app.conversation.state_manager import _known_facts
from app.llm.gemini_client import LLMResponse
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.types import PatientPhase, Persona

T0 = datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)


class NoteWriter:
    def __init__(self, note="About them:\n- Ada, 32, Lagos. Knee pain since a football injury in October.", fail=False):
        self.note, self.fail, self.calls = note, fail, []

    def complete(self, prompt, user_text):
        self.calls.append(user_text)
        if self.fail:
            raise RuntimeError("model down")
        return LLMResponse(reply_text=self.note, extraction_json={}, triage_decision_json={}, language="en")


def chat(db_session, *lines):
    patient = Patient(phone_e164="+2348000009911", name="Ada")
    db_session.add(patient)
    db_session.flush()
    conversation = Conversation(person_id=patient.id, persona=Persona.PATIENT, phase=PatientPhase.FIRST_CONTACT)
    db_session.add(conversation)
    db_session.flush()
    add(db_session, conversation, *lines)
    return patient, conversation


def add(db_session, conversation, *lines, start=T0):
    for index, (role, text) in enumerate(lines):
        db_session.add(Message(conversation_id=conversation.id, role=role, text=text, created_at=start + timedelta(minutes=index)))
    db_session.flush()


def test_a_quiet_chat_becomes_a_note_with_both_sides(db_session):
    patient, _ = chat(db_session, ("user", "My knee hurts since football"), ("joy", "I'm sorry. When did it start?"))
    writer = NoteWriter()
    assert memory.refresh_due_memories(db_session, writer, now=T0 + timedelta(hours=1)) == 1
    assert patient.memory_summary.startswith("About them")
    assert patient.memory_updated_at == T0 + timedelta(minutes=1)
    assert "patient: My knee hurts" in writer.calls[0] and "joy: I'm sorry" in writer.calls[0]
    # Nothing new: no second call
    assert memory.refresh_due_memories(db_session, writer, now=T0 + timedelta(hours=2)) == 0
    assert len(writer.calls) == 1


def test_new_messages_are_folded_into_the_old_note(db_session):
    patient, conversation = chat(db_session, ("user", "My knee hurts"))
    memory.refresh_due_memories(db_session, NoteWriter(), now=T0 + timedelta(hours=1))
    add(db_session, conversation, ("user", "I prefer a female physio, mornings"), start=T0 + timedelta(days=1))
    writer = NoteWriter(note="About them:\n- Knee pain.\nPreferences:\n- Female physio, mornings.")
    assert memory.refresh_due_memories(db_session, writer, now=T0 + timedelta(days=2)) == 1
    assert "CURRENT MEMORY:\nAbout them" in writer.calls[0]
    assert "female physio" in writer.calls[0] and "My knee hurts" not in writer.calls[0]  # only what's new
    assert "Female physio" in patient.memory_summary


def test_an_active_chat_waits_until_it_goes_quiet(db_session):
    chat(db_session, ("user", "My knee hurts"))
    assert memory.refresh_due_memories(db_session, NoteWriter(), now=T0 + timedelta(minutes=3)) == 0


def test_a_model_failure_changes_nothing_and_is_tried_again(db_session):
    patient, _ = chat(db_session, ("user", "My knee hurts"))
    assert memory.refresh_due_memories(db_session, NoteWriter(fail=True), now=T0 + timedelta(hours=1)) == 0
    assert patient.memory_summary is None and patient.memory_updated_at is None
    assert memory.refresh_due_memories(db_session, NoteWriter(), now=T0 + timedelta(hours=1)) == 1


def test_every_turn_sees_the_note(db_session):
    patient, _ = chat(db_session, ("user", "hi"))
    patient.memory_summary = "About them:\n- Ada, knee pain."
    db_session.flush()
    assert _known_facts(db_session, patient.id)["memory_from_earlier_chats"].endswith("knee pain.")


def test_the_note_is_capped():
    long_note = "x" * 5000
    patient = Patient(phone_e164="+2348000009912", memory_summary=long_note)
    assert len(memory.memory_fact(patient)) == memory.MEMORY_MAX_CHARS
