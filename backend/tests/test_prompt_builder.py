def test_builder_includes_only_current_persona_and_stage():
    from app.llm.prompt_builder import build
    from app.models.types import ConversationStage, ExtractedTriage, Identity, Persona
    from uuid import uuid4

    identity = Identity(persona=Persona.PATIENT, person_id=uuid4(), phone_e164="+2348000000001")
    text = build(identity, ConversationStage.STORY_CAPTURE, ExtractedTriage(), "en", [], "")
    assert "Joy — Master System Prompt" not in text
    assert "currently speaking with: patient" in text.lower() or "patient" in text.lower()
    assert "STORY_CAPTURE" in text
    assert "backend owns" in text.lower()
    assert "Empathetic" in text or "empathy" in text.lower() or "warm" in text.lower()
    assert "CLINICAL SAFETY ENGINE" not in text
