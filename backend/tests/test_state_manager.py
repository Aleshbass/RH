from sqlalchemy import func, select

from app.conversation.language import mirror_language
from app.conversation.state_manager import load, save_turn
from app.models.conversation import Conversation, Message
from app.models.triage_session import TriageSession
from app.models.types import ExtractedTriage, PatientPhase


def test_returning_patient_keeps_extracted_fields(db_session, patient_identity):
    extracted = ExtractedTriage(onset="3 days", body_location="knee")
    state = load(db_session, patient_identity)
    save_turn(db_session, state, "knee hurt 3 days", "ok", extracted, PatientPhase.MID_TRIAGE, "en")
    again = load(db_session, patient_identity)
    assert again.extracted.onset == "3 days"
    assert again.extracted.body_location == "knee"


def test_none_does_not_wipe_known_extracted_field(db_session, patient_identity):
    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt 3 days",
        "ok",
        ExtractedTriage(onset="3 days", body_location="knee"),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    save_turn(
        db_session,
        state,
        "maybe a 6",
        "ok",
        ExtractedTriage(onset=None, severity=6),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    again = load(db_session, patient_identity)
    assert again.extracted.onset == "3 days"
    assert again.extracted.body_location == "knee"
    assert again.extracted.severity == 6


def test_new_non_null_wins_on_merge(db_session, patient_identity):
    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "started 3 days ago",
        "ok",
        ExtractedTriage(onset="3 days"),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    save_turn(
        db_session,
        state,
        "actually a week",
        "ok",
        ExtractedTriage(onset="1 week"),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    again = load(db_session, patient_identity)
    assert again.extracted.onset == "1 week"


def test_known_facts_include_patient_demographics(db_session, patient_identity):
    state = load(db_session, patient_identity)
    assert state.known_facts["name"] == "Ada Okonkwo"
    assert state.known_facts["age"] == 32
    assert state.known_facts["location"] == "Lagos"


def test_load_creates_conversation_and_open_triage(db_session, patient_identity):
    state = load(db_session, patient_identity)
    assert state.phase == PatientPhase.FIRST_CONTACT
    assert state.extracted.onset is None
    conv = db_session.scalar(
        select(Conversation).where(Conversation.person_id == patient_identity.person_id)
    )
    assert conv is not None
    assert conv.persona == patient_identity.persona
    triage = db_session.scalar(
        select(TriageSession).where(TriageSession.patient_id == patient_identity.person_id)
    )
    assert triage is not None
    assert triage.status == "open"


def test_save_turn_persists_phase_language_and_messages(db_session, patient_identity):
    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee dey pain me abeg",
        "I hear you",
        ExtractedTriage(body_location="knee"),
        PatientPhase.MID_TRIAGE,
        "pcm",
    )
    again = load(db_session, patient_identity)
    assert again.phase == PatientPhase.MID_TRIAGE
    assert again.last_known_language == "pcm"
    assert [message.role for message in again.recent_messages] == ["user", "joy"]
    assert again.recent_messages[0].text == "knee dey pain me abeg"
    assert again.recent_messages[1].text == "I hear you"


def test_recent_messages_capped_at_12(db_session, patient_identity):
    state = load(db_session, patient_identity)
    for index in range(8):
        save_turn(
            db_session,
            state,
            f"user {index}",
            f"joy {index}",
            ExtractedTriage(),
            PatientPhase.MID_TRIAGE,
            "en",
        )
    stored = db_session.scalar(select(func.count()).select_from(Message))
    assert stored == 16
    again = load(db_session, patient_identity)
    assert len(again.recent_messages) == 12
    assert [message.text for message in again.recent_messages] == [
        "user 2",
        "joy 2",
        "user 3",
        "joy 3",
        "user 4",
        "joy 4",
        "user 5",
        "joy 5",
        "user 6",
        "joy 6",
        "user 7",
        "joy 7",
    ]


def test_mirror_language_detects_supported_codes():
    assert mirror_language("I dey feel pain for my knee abeg", None) == "pcm"
    assert mirror_language("bawo ni, epele fun eese mi", None) == "yo"
    assert mirror_language("kedu, m na-enwe mgbu na ikpere", None) == "ig"
    assert mirror_language("ina jin ciwo a gwiwa don Allah", None) == "ha"
    assert mirror_language("my knee hurts", None) == "en"


def test_mirror_language_falls_back_to_last_known():
    assert mirror_language("ok", "ha") == "ha"
    assert mirror_language("ok", None) == "en"
    assert mirror_language("ok", "fr") == "en"
