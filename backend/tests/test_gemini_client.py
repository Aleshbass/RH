import pytest

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


def test_gemini_client_complete_voice_not_implemented():
    from app.config import Settings
    from app.llm.gemini_client import GeminiClient

    client = GeminiClient(Settings(gemini_api_key=""))
    with pytest.raises(NotImplementedError):
        client.complete_voice(b"", "audio/ogg")


def test_gemini_client_parses_json_without_live_api(monkeypatch):
    from app.config import Settings
    from app.llm.gemini_client import GeminiClient

    class _Resp:
        text = '{"reply_text": "Hi", "extraction": {"onset": "2d"}, "language": "en"}'

    class _Models:
        def generate_content(self, **kwargs):
            return _Resp()

    class _Client:
        def __init__(self, **kwargs):
            assert kwargs.get("api_key") == "not-a-real-key"
            self.models = _Models()

    monkeypatch.setattr("app.llm.gemini_client.genai.Client", _Client)
    client = GeminiClient(Settings(gemini_api_key="not-a-real-key"))
    response = client.complete("assembled prompt", "hello")
    assert response.reply_text == "Hi"
    assert response.extraction_json["onset"] == "2d"
    assert response.language == "en"
