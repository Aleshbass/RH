def test_builder_includes_persona_and_phase(patient_identity):
    from app.llm.prompt_builder import build
    from app.models.types import ExtractedTriage, PatientPhase

    text = build(patient_identity, PatientPhase.FIRST_CONTACT, ExtractedTriage(), "en", [], "")
    assert "currently speaking with: patient" in text.lower() or "patient" in text.lower()
    assert "first_contact" in text
    assert "Do not open with a checklist" in text or "ONE open question" in text
    assert "empathy" in text.lower() or "genuine care" in text.lower() or "acknowledge" in text.lower()
    assert "red flag" in text.lower() or "safety" in text.lower()
