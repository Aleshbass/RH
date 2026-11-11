"""A voice note back when the patient sends one (owner, 10 Nov 2026).

Joy speaks its reply with OpenAI text-to-speech, in Ogg/Opus (what WhatsApp plays as a voice
note), uploads it to WhatsApp and sends it before any text. The written reply still goes when the
patient needs to tap or read something: buttons, a list, a link, or safety advice. Any failure
falls back to the text alone, so a reply is never lost to a voice problem.

Only languages the owner has heard and approved are spoken (settings.joy_voice_reply_languages,
English and Pidgin to start); the others get text as before.
"""

from __future__ import annotations

import logging
import re

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

# WhatsApp voice notes are short; long replies are cut at a sentence and the text is sent too
SPEAK_LIMIT = 1200

_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.I)
_KEYCAP_RE = re.compile(r"([0-9])️?⃣")
_EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF\U0001F000-\U0001F2FF‍️]")
_NAIRA_RE = re.compile(r"₦\s?([\d,]+(?:\.\d+)?)")

_INSTRUCTIONS = (
    "You are Joy, a warm and caring Nigerian healthcare assistant. Speak in a friendly Nigerian English "
    "accent, calmly and clearly, at an easy pace, like a kind care coordinator on a phone call."
)
_PIDGIN_INSTRUCTIONS = (
    "You are Joy, a warm and caring Nigerian healthcare assistant. Speak this Nigerian Pidgin naturally, "
    "with a Nigerian accent, calmly and clearly, like a kind care coordinator on a phone call."
)


def speakable(text: str) -> tuple[str, bool]:
    """(the reply as it should be spoken, whether anything was left out: links or a long tail)."""
    raw = text or ""
    dropped = bool(_URL_RE.search(raw))
    spoken = _URL_RE.sub("", raw)
    spoken = _KEYCAP_RE.sub(r"\1.", spoken)
    spoken = _NAIRA_RE.sub(lambda m: f"{m.group(1)} naira", spoken)
    spoken = _EMOJI_RE.sub("", spoken)
    spoken = re.sub(r"[*_~`]", "", spoken)  # WhatsApp bold, italics and code
    spoken = re.sub(r"^\s*[•\-–]\s*", "", spoken, flags=re.M)
    spoken = re.sub(r"\(\s*\)", "", spoken)
    spoken = re.sub(r"[ \t]+", " ", spoken)
    spoken = re.sub(r"\s*\n\s*\n\s*", "\n\n", spoken).strip()
    if len(spoken) > SPEAK_LIMIT:
        cut = spoken[:SPEAK_LIMIT]
        end = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "), cut.rfind("\n"))
        spoken = (cut[: end + 1] if end > SPEAK_LIMIT // 2 else cut).strip()
        dropped = True
    return spoken, dropped


def speaks(language: str | None) -> bool:
    settings = get_settings()
    allowed = {item.strip().lower() for item in (settings.joy_voice_reply_languages or "").split(",") if item.strip()}
    return bool(settings.joy_voice_replies and settings.openai_api_key and (language or "en").lower() in allowed)


def synthesize(text: str, language: str | None) -> bytes | None:
    """Ogg/Opus speech for this text, or None."""
    settings = get_settings()
    try:
        response = httpx.post(
            "https://api.openai.com/v1/audio/speech",
            headers={"Authorization": f"Bearer {settings.openai_api_key}"},
            json={
                "model": settings.openai_tts_model,
                "voice": settings.openai_tts_voice,
                "input": text,
                "response_format": "opus",
                "instructions": _PIDGIN_INSTRUCTIONS if (language or "").lower() == "pcm" else _INSTRUCTIONS,
            },
            timeout=45.0,
        )
        response.raise_for_status()
    except Exception:
        logger.warning("joy_voice_reply_tts_failed", exc_info=True)
        return None
    audio = response.content or b""
    return audio if len(audio) > 100 else None


def _upload(audio: bytes) -> str | None:
    settings = get_settings()
    try:
        upload = httpx.post(
            f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/media",
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
            data={"messaging_product": "whatsapp", "type": "audio/ogg"},
            files={"file": ("joy.ogg", audio, "audio/ogg")},
            timeout=30.0,
        )
        upload.raise_for_status()
        return str(upload.json().get("id") or "") or None
    except Exception:
        logger.warning("joy_voice_reply_upload_failed", exc_info=True)
        return None


def send_voice_reply(phone: str, text: str, language: str | None) -> bool:
    """Speak this reply as a WhatsApp voice note. True only if it was sent."""
    from app.queue.tasks import _in_service_window, _localized, _post_message

    settings = get_settings()
    if not speaks(language) or settings.disable_whatsapp_delivery:
        return False
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id or not _in_service_window(phone):
        return False
    spoken, _ = speakable(_localized(phone, text))
    if len(spoken) < 2:
        return False
    audio = synthesize(spoken, language)
    media_id = _upload(audio) if audio else None
    if not media_id:
        return False
    message = {"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "audio", "audio": {"id": media_id}}
    try:
        _post_message(settings, message)
    except Exception:
        logger.warning("joy_voice_reply_send_failed", exc_info=True)
        return False
    logger.info("joy_voice_reply_sent chars=%d", len(spoken))
    return True


def text_still_needed(reply: str, *, interactive: dict | None, blocked_by_safety: bool, before: list[dict] | None) -> bool:
    """Whether the written reply must go too: something to tap or read, or safety advice."""
    if interactive or blocked_by_safety:
        return True
    texts = [str(item.get("text") or "") for item in (before or []) if isinstance(item, dict)]
    if any(item.get("interactive") for item in (before or []) if isinstance(item, dict)):
        return True
    _, dropped = speakable("\n\n".join([*texts, reply or ""]))
    return dropped
