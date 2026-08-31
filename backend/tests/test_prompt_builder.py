def test_builder_includes_persona_and_phase(patient_identity):
    from app.llm.prompt_builder import build
    from app.models.types import ExtractedTriage, PatientPhase

    text = build(patient_identity, PatientPhase.FIRST_CONTACT, ExtractedTriage(), "en", [], "")
    assert "Joy — Master System Prompt" in text
    assert "currently speaking with: patient" in text.lower() or "patient" in text.lower()
    assert "first_contact" in text
    assert "Golden Rule" in text or "Do not make the user do work" in text
    assert "Empathetic" in text or "empathy" in text.lower() or "warm" in text.lower()
    assert "CLINICAL SAFETY ENGINE" in text or "safety" in text.lower()
    assert "GREEN" in text and "RED" in text
