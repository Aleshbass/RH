import struct

import httpx

from app.config import get_settings
from app.llm.gemini_client import LLMClient

MAX_VOICE_SECONDS = 5 * 60
# Fallback when duration cannot be probed (WhatsApp Opus is typically ~8–16 kbps).
_MAX_VOICE_BYTES_FALLBACK = 750_000

VOICE_TOO_LONG_REPLY = (
    "That voice note is a bit long for me to listen to carefully — "
    "I can only handle notes under 5 minutes. "
    "Could you send a shorter one, or type the main points for me?"
)


class VoiceTooLongError(Exception):
    """Raised when an inbound voice note exceeds MAX_VOICE_SECONDS."""


def ingest_voice(llm: LLMClient, audio: bytes, mime: str) -> str:
    return llm.complete_voice(audio, mime).reply_text


def fetch_audio(url: str, *, headers: dict[str, str] | None = None) -> tuple[bytes, str]:
    response = httpx.get(url, headers=headers, timeout=15.0, follow_redirects=True)
    response.raise_for_status()
    mime = (response.headers.get("content-type") or "audio/ogg").split(";")[0].strip()
    return response.content, mime or "audio/ogg"


def fetch_whatsapp_audio(media_id: str) -> tuple[bytes, str]:
    settings = get_settings()
    headers = {"Authorization": f"Bearer {settings.whatsapp_access_token}"}
    meta = httpx.get(
        f"https://graph.facebook.com/v21.0/{media_id}",
        headers=headers,
        timeout=15.0,
    )
    meta.raise_for_status()
    body = meta.json()
    url = str(body["url"])
    mime = str(body.get("mime_type") or "audio/ogg").split(";")[0].strip()
    data, fetched_mime = fetch_audio(url, headers=headers)
    return data, mime or fetched_mime


def _ogg_opus_duration_seconds(data: bytes) -> float | None:
    """Estimate duration from the last Ogg page granule (Opus @ 48 kHz)."""
    last_granule: int | None = None
    i = 0
    n = len(data)
    while i + 27 <= n:
        if data[i : i + 4] != b"OggS":
            i += 1
            continue
        granule = struct.unpack_from("<q", data, i + 6)[0]
        segments = data[i + 26]
        table_end = i + 27 + segments
        if table_end > n:
            break
        body_size = sum(data[i + 27 : table_end])
        page_end = table_end + body_size
        if page_end > n:
            break
        if granule > 0:
            last_granule = granule
        i = page_end
    if last_granule is None or last_granule <= 0:
        return None
    return last_granule / 48000.0


def estimate_audio_duration_seconds(data: bytes, mime: str | None = None) -> float | None:
    lowered = (mime or "").lower()
    if "ogg" in lowered or "opus" in lowered or data[:4] == b"OggS":
        return _ogg_opus_duration_seconds(data)
    return None


def enforce_voice_duration_limit(
    data: bytes,
    *,
    mime: str | None = None,
    declared_seconds: float | None = None,
) -> None:
    seconds = declared_seconds
    if seconds is None:
        seconds = estimate_audio_duration_seconds(data, mime)
    if seconds is not None and seconds > MAX_VOICE_SECONDS:
        raise VoiceTooLongError(VOICE_TOO_LONG_REPLY)
    if seconds is None and len(data) > _MAX_VOICE_BYTES_FALLBACK:
        raise VoiceTooLongError(VOICE_TOO_LONG_REPLY)


def transcript_from_audio(
    llm: LLMClient,
    *,
    text: str = "",
    audio_url: str | None = None,
    audio_media_id: str | None = None,
    audio_mime: str | None = None,
    audio_bytes: bytes | None = None,
    audio_duration_seconds: float | None = None,
) -> str:
    if audio_bytes:
        enforce_voice_duration_limit(
            audio_bytes, mime=audio_mime, declared_seconds=audio_duration_seconds
        )
        return ingest_voice(llm, audio_bytes, audio_mime or "audio/ogg")
    if audio_media_id:
        data, mime = fetch_whatsapp_audio(audio_media_id)
        enforce_voice_duration_limit(
            data, mime=audio_mime or mime, declared_seconds=audio_duration_seconds
        )
        return ingest_voice(llm, data, audio_mime or mime)
    if audio_url:
        data, mime = fetch_audio(audio_url)
        enforce_voice_duration_limit(
            data, mime=audio_mime or mime, declared_seconds=audio_duration_seconds
        )
        return ingest_voice(llm, data, audio_mime or mime)
    return text
