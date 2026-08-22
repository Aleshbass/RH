import inspect

from app.models.types import ConditionArea, ExtractedTriage, PatientPhase


def test_retrieve_neuro_glossary():
    from app.llm.rag.retriever import retrieve
    from app.models.types import ConditionArea

    snippet = retrieve(ConditionArea.NEURO)
    assert "stroke" in snippet.lower() or "neuro" in snippet.lower()


def test_voice_uses_live_client(fake_llm):
    from app.conversation.voice import ingest_voice

    fake_llm.voice_transcript = "my child cannot sit since the operation"
    text = ingest_voice(fake_llm, b"fake", "audio/ogg")
    assert "child" in text


def test_retrieve_does_not_decide_red_flags():
    from app.llm.rag import retriever as rag_mod
    from app.llm.rag.retriever import retrieve
    from app.safety.evaluator import evaluate

    snippet = retrieve(ConditionArea.NEURO)
    assert isinstance(snippet, str)
    source = inspect.getsource(rag_mod)
    assert "safety" not in source
    assert "evaluator" not in source
    assert "red_flag" not in source
    safety = evaluate(ExtractedTriage(goals=snippet))
    assert safety.fired is False


def test_ingest_voice_calls_complete_voice(fake_llm):
    from app.conversation.voice import ingest_voice

    fake_llm.voice_transcript = "my child cannot sit since the operation"
    seen: list[tuple[bytes, str]] = []
    original = fake_llm.complete_voice

    def _spy(audio_bytes: bytes, mime: str):
        seen.append((audio_bytes, mime))
        return original(audio_bytes, mime)

    fake_llm.complete_voice = _spy
    text = ingest_voice(fake_llm, b"fake", "audio/ogg")
    assert seen == [(b"fake", "audio/ogg")]
    assert "child" in text


def test_voice_transcript_feeds_handle_turn(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.conversation.voice import ingest_voice

    fake_llm.voice_transcript = "my child cannot sit since the operation"
    fake_llm.reply = "Sorry — tell me the whole story when you can."
    text = ingest_voice(fake_llm, b"fake", "audio/ogg")
    result = handle_turn(db_session, patient_phone, text, fake_llm)
    assert "child" in text
    assert result.reply_text == fake_llm.reply


def test_handle_turn_injects_neuro_rag(db_session, patient_identity, fake_llm):
    from app.conversation.state_manager import load, save_turn
    from app.conversation.turn_handler import handle_turn

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "weak arm after a stroke",
        "tell me more",
        ExtractedTriage(
            onset="1 week",
            body_location="arm",
            goals="walk again",
            condition_area=ConditionArea.NEURO,
        ),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    fake_llm.reply = "Thanks, I've got that."
    handle_turn(db_session, patient_identity.phone_e164, "still weak", fake_llm)
    prompt = fake_llm.last_prompt.lower()
    assert "rag:\n(none)" not in prompt
    assert "neurological physiotherapy" in prompt or "stroke rehabilitation" in prompt


def test_extraction_complete_excludes_rag_glossary_flags(
    db_session, patient_identity, fake_llm
):
    from pathlib import Path

    from app.conversation.state_manager import load, save_turn
    from app.conversation.turn_handler import handle_turn
    from app.llm.rag import retriever as rag_mod

    glossary = (Path(rag_mod.__file__).parent / "knowledge_base" / "glossary.md").read_text()
    assert "chest pain" in glossary.lower()
    assert "saddle" in glossary.lower()

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee after football",
        "tell me more",
        ExtractedTriage(
            onset="1 week",
            body_location="knee",
            condition_area=ConditionArea.MSK,
        ),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    fake_llm.extraction = {}
    fake_llm.reply = "Thanks, I've got that."
    result = handle_turn(
        db_session,
        patient_identity.phone_e164,
        "still the knee, no other symptoms",
        fake_llm,
    )

    extraction_prompt = fake_llm.complete_prompts[0].lower()
    assert "rag:\n(none)" in extraction_prompt
    assert "chest pain" not in extraction_prompt
    assert "saddle" not in extraction_prompt
    flags = result.extracted.flags or {}
    assert not flags.get("chest_pain")
    assert not flags.get("saddle_anesthesia")
    assert result.blocked_by_safety is False
