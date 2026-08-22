import threading

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.conversation.language import mirror_language
from app.conversation.state_manager import load, save_turn
from app.db import engine
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.triage_session import TriageSession
from app.models.types import ExtractedTriage, Identity, PatientPhase, Persona


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


def test_explicit_empty_list_corrects_stored_aggravating(db_session, patient_identity):
    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "stairs make it worse",
        "ok",
        ExtractedTriage(aggravating=["stairs"]),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    save_turn(
        db_session,
        state,
        "nothing makes it worse actually",
        "ok",
        ExtractedTriage(aggravating=[]),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    again = load(db_session, patient_identity)
    assert again.extracted.aggravating == []


def test_explicit_empty_dict_corrects_stored_flags(db_session, patient_identity):
    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "had fever",
        "ok",
        ExtractedTriage(flags={"fever": True}),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    save_turn(
        db_session,
        state,
        "no fever, that was a cold",
        "ok",
        ExtractedTriage(flags={}),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    again = load(db_session, patient_identity)
    assert again.extracted.flags == {}


def test_unset_defaults_do_not_wipe_stored_collections(db_session, patient_identity):
    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "stairs, and fever",
        "ok",
        ExtractedTriage(aggravating=["stairs"], flags={"fever": True}),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    save_turn(
        db_session,
        state,
        "maybe a 6",
        "ok",
        ExtractedTriage(severity=6),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    again = load(db_session, patient_identity)
    assert again.extracted.aggravating == ["stairs"]
    assert again.extracted.flags == {"fever": True}
    assert again.extracted.severity == 6


def test_second_conversation_for_same_person_persona_is_rejected(db_session, patient_identity):
    load(db_session, patient_identity)
    with pytest.raises(IntegrityError):
        with db_session.begin_nested():
            db_session.add(
                Conversation(
                    person_id=patient_identity.person_id,
                    persona=patient_identity.persona,
                    phase=PatientPhase.FIRST_CONTACT,
                )
            )
            db_session.flush()


def test_concurrent_first_load_does_not_duplicate_conversations():
    setup = Session(bind=engine)
    try:
        patient = Patient(
            phone_e164="+2348000004599",
            name="Concurrent Load",
            age=40,
            location="Abuja",
        )
        setup.add(patient)
        setup.commit()
        identity = Identity(
            persona=Persona.PATIENT,
            person_id=patient.id,
            phone_e164=patient.phone_e164,
        )
        person_id = patient.id
    finally:
        setup.close()

    errors: list[BaseException] = []

    def worker() -> None:
        session = Session(bind=engine)
        try:
            load(session, identity)
            session.commit()
        except BaseException as exc:
            errors.append(exc)
            session.rollback()
        finally:
            session.close()

    try:
        threads = [threading.Thread(target=worker) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert errors == []
        check = Session(bind=engine)
        try:
            count = check.scalar(
                select(func.count())
                .select_from(Conversation)
                .where(
                    Conversation.person_id == person_id,
                    Conversation.persona == Persona.PATIENT,
                )
            )
            assert count == 1
        finally:
            check.close()
    finally:
        cleanup = Session(bind=engine)
        try:
            conversations = cleanup.scalars(
                select(Conversation).where(Conversation.person_id == person_id)
            ).all()
            for conversation in conversations:
                messages = cleanup.scalars(
                    select(Message).where(Message.conversation_id == conversation.id)
                ).all()
                for message in messages:
                    cleanup.delete(message)
                cleanup.delete(conversation)
            triages = cleanup.scalars(
                select(TriageSession).where(TriageSession.patient_id == person_id)
            ).all()
            for triage in triages:
                cleanup.delete(triage)
            leftover = cleanup.get(Patient, person_id)
            if leftover is not None:
                cleanup.delete(leftover)
            cleanup.commit()
        finally:
            cleanup.close()


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


def test_mirror_language_uses_word_boundaries_not_substrings():
    assert mirror_language("I like cheese", None) == "en"
    assert mirror_language("how far can I bend my knee", None) == "en"
    assert mirror_language("tell me how far the clinic is", None) == "en"


def test_mirror_language_how_far_greeting_at_start():
    assert mirror_language("How far?", None) == "pcm"
    assert mirror_language("how far now", None) == "pcm"


def test_mirror_language_how_far_comma_prefix_is_english():
    assert mirror_language("How far, can I bend my knee?", None) == "en"
    assert mirror_language("how far, can I bend my knee?", None) == "en"


def test_mirror_language_yoruba_combining_accents():
    # ọ + combining grave/acute; ASCII \b does not treat marks as word chars
    jowo = "jọ" + "\u0300" + "wọ" + "\u0301"
    assert mirror_language(jowo, None) == "yo"
    assert mirror_language(f"{jowo} epele", None) == "yo"
    assert mirror_language("jọ̀wọ́", None) == "yo"
