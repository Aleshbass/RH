import struct

import pytest

from app.conversation.voice import (
    MAX_VOICE_SECONDS,
    VOICE_TOO_LONG_REPLY,
    VoiceTooLongError,
    enforce_voice_duration_limit,
    estimate_audio_duration_seconds,
)
from app.models.types import TurnResult
from app.queue import worker


def _ogg_page(*, granule: int, body: bytes = b"x") -> bytes:
    # Minimal Ogg page: capture pattern + granule + one segment.
    header = bytearray(27)
    header[0:4] = b"OggS"
    header[4] = 0  # version
    header[5] = 0  # header type
    struct.pack_into("<q", header, 6, granule)
    struct.pack_into("<I", header, 14, 1)  # serial
    struct.pack_into("<I", header, 18, 0)  # sequence
    struct.pack_into("<I", header, 22, 0)  # checksum
    header[26] = 1  # one segment
    return bytes(header) + bytes([len(body)]) + body


def test_estimate_ogg_duration_from_granule():
    # 48000 samples/sec * 360s = 6 minutes
    data = _ogg_page(granule=0, body=b"OpusHead") + _ogg_page(granule=48000 * 360)
    seconds = estimate_audio_duration_seconds(data, "audio/ogg")
    assert seconds is not None
    assert seconds == pytest.approx(360.0)


def test_enforce_rejects_over_five_minutes_declared():
    with pytest.raises(VoiceTooLongError) as exc:
        enforce_voice_duration_limit(b"tiny", declared_seconds=MAX_VOICE_SECONDS + 1)
    assert "5 minutes" in str(exc.value).lower() or "5 minutes" in VOICE_TOO_LONG_REPLY.lower()


def test_enforce_allows_under_five_minutes():
    enforce_voice_duration_limit(b"tiny", declared_seconds=MAX_VOICE_SECONDS)


def test_enforce_rejects_long_ogg_by_probe():
    data = _ogg_page(granule=48000 * (MAX_VOICE_SECONDS + 30))
    with pytest.raises(VoiceTooLongError):
        enforce_voice_duration_limit(data, mime="audio/ogg")


def test_process_inbound_rejects_declared_long_voice(monkeypatch: pytest.MonkeyPatch):
    class _NoMessageSession:
        def scalar(self, *_args, **_kwargs):
            return None

    called = {"n": 0}

    def _should_not_run(*_a, **_k):
        called["n"] += 1
        raise AssertionError("should not transcribe oversized voice")

    monkeypatch.setattr(worker, "transcript_from_audio", _should_not_run)
    result = worker.process_inbound(
        _NoMessageSession(),  # type: ignore[arg-type]
        "wamid.voice.long",
        "+2348000000888",
        "",
        audio_media_id="MEDIA_LONG",
        audio_mime="audio/ogg",
        audio_duration_seconds=301,
    )
    assert isinstance(result, TurnResult)
    assert "5 minutes" in result.reply_text.lower()
    assert called["n"] == 0
