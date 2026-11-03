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


def test_parse_model_json_invalid_returns_empty():
    from app.llm.gemini_client import _parse_model_json

    assert _parse_model_json("not-json{") == {}
    assert _parse_model_json("[]") == {}


def test_gemini_client_text_timeout_is_not_retried(monkeypatch):
    from app.config import Settings
    from app.llm.gemini_client import GeminiClient, GeminiTimeoutError

    calls = {"n": 0}

    class _Models:
        def generate_content(self, **kwargs):
            calls["n"] += 1
            raise TimeoutError("deadline")

    class _Client:
        def __init__(self, **kwargs):
            self.models = _Models()

    monkeypatch.setattr("app.llm.gemini_client.genai.Client", _Client)
    client = GeminiClient(Settings(gemini_api_key="not-a-real-key", gemini_fallback_models=""))
    try:
        client.complete("assembled prompt", "hello")
        raise AssertionError("expected GeminiTimeoutError")
    except GeminiTimeoutError:
        pass
    assert calls["n"] == 1


def test_a_timeout_gets_one_try_on_the_next_model_within_the_budget(monkeypatch):
    from app.llm import gemini_client

    now = [0.0]
    monkeypatch.setattr(gemini_client, "monotonic", lambda: now[0])

    def slow_timeout(model):
        now[0] += 10.0  # each model call uses its full 10-second deadline
        return TimeoutError("deadline")

    client, used = _client_with(monkeypatch, slow_timeout)
    try:
        client.complete("prompt", "hello")
        raise AssertionError("expected GeminiTimeoutError")
    except gemini_client.GeminiTimeoutError:
        pass
    # main timed out at 10s: backup-1 tried; at 20s the budget is spent, so no backup-2
    assert used == ["main", "backup-1"]


def test_provider_deadline_error_is_treated_as_timeout():
    from app.llm.gemini_client import _is_timeout

    assert _is_timeout(RuntimeError("504 DEADLINE_EXCEEDED: request timed out")) is True


def test_gemini_client_voice_succeeds_on_timeout_retry(monkeypatch):
    from app.config import Settings
    from app.llm.gemini_client import GeminiClient

    calls = {"n": 0}

    class _Resp:
        text = '{"reply_text": "Hi", "extraction": {}, "language": "en"}'

    class _Models:
        def generate_content(self, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise TimeoutError("deadline")
            return _Resp()

    class _Client:
        def __init__(self, **kwargs):
            self.models = _Models()

    monkeypatch.setattr("app.llm.gemini_client.genai.Client", _Client)
    client = GeminiClient(Settings(gemini_api_key="not-a-real-key"))
    response = client.complete_voice(b"fake-audio", "audio/ogg")
    assert response.reply_text == "Hi"
    assert calls["n"] == 2



class _BusyError(Exception):
    code = 503

    def __str__(self):
        return "503 UNAVAILABLE. This model is currently experiencing high demand."


def _client_with(monkeypatch, behaviour):
    from app.config import Settings
    from app.llm.gemini_client import GeminiClient

    models_used = []

    class _Resp:
        text = '{"reply_text": "Tell me more.", "extraction": {}, "language": "en"}'

    class _Models:
        def generate_content(self, **kwargs):
            models_used.append(kwargs["model"])
            outcome = behaviour(kwargs["model"])
            if isinstance(outcome, BaseException):
                raise outcome
            return _Resp()

    class _Client:
        def __init__(self, **kwargs):
            self.models = _Models()

    monkeypatch.setattr("app.llm.gemini_client.genai.Client", _Client)
    settings = Settings(gemini_api_key="not-a-real-key", gemini_text_model="main", gemini_live_model="main",
                        gemini_fallback_models="backup-1,backup-2")
    return GeminiClient(settings), models_used


def test_a_busy_model_falls_back_to_the_next(monkeypatch):
    client, used = _client_with(monkeypatch, lambda model: _BusyError() if model == "main" else None)
    assert client.complete("prompt", "my knee hurts").reply_text == "Tell me more."
    assert used == ["main", "backup-1"]


def test_voice_notes_fall_back_too(monkeypatch):
    client, used = _client_with(monkeypatch, lambda model: _BusyError() if model != "backup-2" else None)
    assert client.complete_voice(b"audio", "audio/ogg").reply_text == "Tell me more."
    assert used == ["main", "backup-1", "backup-2"]


def test_when_every_model_is_busy_the_error_reaches_the_worker(monkeypatch):
    client, used = _client_with(monkeypatch, lambda model: _BusyError())
    try:
        client.complete("prompt", "hello")
        raise AssertionError("expected the busy error")
    except _BusyError:
        pass
    assert used == ["main", "backup-1", "backup-2"]


def test_other_errors_do_not_try_other_models(monkeypatch):
    client, used = _client_with(monkeypatch, lambda model: ValueError("bad request"))
    try:
        client.complete("prompt", "hello")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass
    assert used == ["main"]
