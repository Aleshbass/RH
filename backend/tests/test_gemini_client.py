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


def test_gemini_client_complete_voice_transcribes_audio(monkeypatch):
    from app.config import Settings
    from app.llm.gemini_client import GeminiClient

    captured: dict[str, object] = {}

    class _Resp:
        text = '{"reply_text": "my child cannot sit", "extraction": {}, "language": "en"}'

    class _Models:
        def generate_content(self, **kwargs):
            captured.update(kwargs)
            return _Resp()

    class _Client:
        def __init__(self, **kwargs):
            self.models = _Models()

    monkeypatch.setattr("app.llm.gemini_client.genai.Client", _Client)
    client = GeminiClient(Settings(gemini_api_key="not-a-real-key"))
    response = client.complete_voice(b"fake-audio", "audio/ogg")
    assert "child" in response.reply_text
    assert captured.get("model")
    contents = captured.get("contents")
    assert contents is not None


def test_gemini_client_complete_voice_sends_audio(monkeypatch):
    from app.config import Settings
    from app.llm.gemini_client import GeminiClient

    captured: dict[str, object] = {}

    def _from_bytes(*, data, mime_type):
        captured["audio_bytes"] = data
        captured["mime_type"] = mime_type
        return {"kind": "audio", "data": data, "mime_type": mime_type}

    class _Resp:
        text = '{"reply_text": "transcribed note", "extraction": {}, "language": "en"}'

    class _Models:
        def generate_content(self, **kwargs):
            captured["contents"] = kwargs.get("contents")
            captured["model"] = kwargs.get("model")
            return _Resp()

    class _Client:
        def __init__(self, **kwargs):
            self.models = _Models()

    monkeypatch.setattr("app.llm.gemini_client.types.Part.from_bytes", _from_bytes)
    monkeypatch.setattr("app.llm.gemini_client.genai.Client", _Client)
    client = GeminiClient(Settings(gemini_api_key="not-a-real-key"))
    response = client.complete_voice(b"\x00\x01voice-bytes", "audio/ogg")
    assert captured["audio_bytes"] == b"\x00\x01voice-bytes"
    assert captured["mime_type"] == "audio/ogg"
    contents = captured["contents"]
    assert isinstance(contents, list)
    assert any(
        isinstance(part, dict) and part.get("data") == b"\x00\x01voice-bytes"
        for part in contents
    )
    assert captured.get("model")
    assert "transcribed" in response.reply_text


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
