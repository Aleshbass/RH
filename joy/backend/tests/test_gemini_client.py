from tests.fakes import FakeLLM


def test_fake_llm_returns_scripted_extraction():
    llm = FakeLLM(reply="Tell me more.", extraction={"onset": "1 week"}, language="en")
    response = llm.complete("prompt", "my back has hurt for a week")
    assert response.extraction_json["onset"] == "1 week"
    assert response.reply_text == "Tell me more."


def test_fake_llm_complete_voice_returns_scripted_transcript():
    llm = FakeLLM(reply="unused", extraction={"onset": "1 week"}, language="en")
    llm.voice_transcript = "my child cannot sit since the operation"
    response = llm.complete_voice(b"fake", "audio/ogg")
    assert "child" in response.reply_text
    assert response.extraction_json["onset"] == "1 week"
    assert response.language == "en"
