"""A physio's voice note sent with a home programme, played on WhatsApp (owner, 16 Nov 2026).

RH's programme.sent event carries the note's file link (Convex storage) and type. After the
programme message, the worker sends it as a WhatsApp audio message:

- types WhatsApp plays (AAC/MP4, MP3, AMR, Ogg/Opus) go by link: Meta fetches the file itself;
- WebM (what Chrome records) is turned into Ogg/Opus with ffmpeg when the server has it, uploaded
  and sent by media id; without ffmpeg it is skipped.

Free-form audio only goes inside the 24-hour window. Outside it, or on any failure, nothing else
happens: the programme message already says there is a voice note in the programme, where the
patient can play it. Best effort, never retried, so the programme message is never sent twice.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from urllib.parse import urlparse

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# WhatsApp's audio limit
MAX_AUDIO_BYTES = 16 * 1024 * 1024
# Types WhatsApp accepts for audio messages (Ogg must be Opus, which browsers record)
LINKABLE_TYPES = frozenset({"audio/aac", "audio/mp4", "audio/mpeg", "audio/amr", "audio/ogg", "audio/x-m4a", "audio/m4a"})
CONVERTIBLE_TYPES = frozenset({"audio/webm", "video/webm"})
# Only RH's own file storage: Joy never fetches a link from anywhere else
_ALLOWED_HOST_SUFFIXES = (".convex.cloud", ".convex.site")


def base_type(mime: str | None) -> str:
    return (mime or "").split(";")[0].strip().lower()


def allowed_audio_url(url: str | None) -> bool:
    if not url or len(url) > 2000:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False
    host = (parsed.hostname or "").lower()
    return parsed.scheme == "https" and any(host.endswith(suffix) for suffix in _ALLOWED_HOST_SUFFIXES)


def can_play_on_whatsapp(mime: str | None) -> bool:
    """Whether this voice note can reach WhatsApp at all (directly, or after converting it)."""
    kind = base_type(mime)
    return kind in LINKABLE_TYPES or (kind in CONVERTIBLE_TYPES and shutil.which("ffmpeg") is not None)


def _to_ogg_opus(audio: bytes) -> bytes | None:
    """WebM/Opus → Ogg/Opus with ffmpeg (re-encoded at voice quality), or None."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    try:
        done = subprocess.run(
            [ffmpeg, "-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-vn", "-c:a", "libopus", "-b:a", "32k", "-f", "ogg", "pipe:1"],
            input=audio,
            capture_output=True,
            timeout=60,
            check=True,
        )
    except Exception:
        logger.warning("programme_voice_note_convert_failed", exc_info=True)
        return None
    return done.stdout if len(done.stdout) > 100 else None


def send_programme_voice_note(phone: str, url: str | None, mime: str | None) -> bool:
    """Send the physio's voice note as WhatsApp audio. True only if Meta accepted it."""
    from app.conversation.voice_reply import _upload
    from app.queue.tasks import _in_service_window, _post_message

    settings = get_settings()
    if settings.disable_whatsapp_delivery or not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return False
    if not allowed_audio_url(url) or not _in_service_window(phone):
        return False
    kind = base_type(mime)
    to = phone.lstrip("+")
    try:
        if kind in LINKABLE_TYPES:
            _post_message(settings, {"messaging_product": "whatsapp", "to": to, "type": "audio", "audio": {"link": url}})
            logger.info("programme_voice_note_sent how=link type=%s", kind)
            return True
        if kind not in CONVERTIBLE_TYPES or not shutil.which("ffmpeg"):
            logger.info("programme_voice_note_skipped type=%s ffmpeg=%s", kind, bool(shutil.which("ffmpeg")))
            return False
        response = httpx.get(url, timeout=30.0, follow_redirects=False)
        response.raise_for_status()
        audio = response.content or b""
        if not audio or len(audio) > MAX_AUDIO_BYTES:
            return False
        ogg = _to_ogg_opus(audio)
        media_id = _upload(ogg) if ogg else None
        if not media_id:
            return False
        _post_message(settings, {"messaging_product": "whatsapp", "to": to, "type": "audio", "audio": {"id": media_id}})
        logger.info("programme_voice_note_sent how=converted")
        return True
    except Exception:
        logger.warning("programme_voice_note_send_failed", exc_info=True)
        return False
