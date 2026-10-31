import httpx
import pytest

from app.models.types import TurnResult
from app.queue import worker


class _NoMessageSession:
    def scalar(self, *_args, **_kwargs):
        return None


def test_process_inbound_voice_fetch_failure_returns_apology(monkeypatch: pytest.MonkeyPatch):
    def _boom(*_args, **_kwargs):
        raise httpx.HTTPStatusError(
            "401",
            request=httpx.Request("GET", "https://example.test"),
            response=httpx.Response(401),
        )

    monkeypatch.setattr(worker, "transcript_from_audio", _boom)
    result = worker.process_inbound(
        _NoMessageSession(),  # type: ignore[arg-type]
        "wamid.voice.fail",
        "+2348000000999",
        "",
        audio_media_id="MEDIA_FAIL",
        audio_mime="audio/ogg",
    )
    assert isinstance(result, TurnResult)
    lower = result.reply_text.lower()
    assert "voice" in lower or "again" in lower or "type" in lower


def test_process_inbound_empty_transcript_returns_apology(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        worker,
        "transcript_from_audio",
        lambda *_args, **_kwargs: "   ",
    )
    result = worker.process_inbound(
        _NoMessageSession(),  # type: ignore[arg-type]
        "wamid.voice.empty",
        "+2348000000998",
        "",
        audio_media_id="MEDIA_EMPTY",
        audio_mime="audio/ogg",
    )
    assert isinstance(result, TurnResult)
    lower = result.reply_text.lower()
    assert "voice" in lower or "again" in lower or "type" in lower
