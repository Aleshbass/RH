"""Exercise pictures in the chat.

The library's posters are WebP, which WhatsApp only accepts as stickers, so each one is turned
into a JPEG on a white background, uploaded to WhatsApp once, and its media id cached for
reuse (WhatsApp keeps uploaded media for 30 days). Any failure just means no picture: the text
plan has already been sent.
"""

from __future__ import annotations

import hashlib
import io
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_CACHE_SECONDS = 25 * 24 * 3600
_ALLOWED_HOSTS = ("https://physioaroundme.com/", "https://www.physioaroundme.com/", "https://ik.imagekit.io/")


def _cache():
    from app.queue.tasks import _redis

    return _redis()


def jpeg_from(image_bytes: bytes, *, max_side: int = 900) -> bytes:
    from PIL import Image

    with Image.open(io.BytesIO(image_bytes)) as source:
        source.thumbnail((max_side, max_side))
        rgba = source.convert("RGBA")
        canvas = Image.new("RGB", rgba.size, (255, 255, 255))
        canvas.paste(rgba, mask=rgba.split()[-1])
        out = io.BytesIO()
        canvas.save(out, format="JPEG", quality=85, optimize=True)
        return out.getvalue()


def media_id_for(image_url: str) -> str | None:
    """A WhatsApp media id for this picture, uploading it the first time. None on any failure."""
    settings = get_settings()
    if not image_url.startswith(_ALLOWED_HOSTS) or not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return None
    key = f"joy:wa_media:{hashlib.sha256(image_url.encode()).hexdigest()[:32]}"
    try:
        cached = _cache().get(key)
        if cached:
            return str(cached)
    except Exception:
        cached = None
    try:
        source = httpx.get(image_url, timeout=10.0, follow_redirects=False)
        source.raise_for_status()
        if len(source.content) > 5_000_000:
            return None
        jpeg = jpeg_from(source.content)
        upload = httpx.post(
            f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/media",
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
            data={"messaging_product": "whatsapp", "type": "image/jpeg"},
            files={"file": ("exercise.jpg", jpeg, "image/jpeg")},
            timeout=20.0,
        )
        upload.raise_for_status()
        media_id = str(upload.json().get("id") or "")
    except Exception:
        logger.warning("joy_exercise_image_unavailable", exc_info=True)
        return None
    if media_id:
        try:
            _cache().set(key, media_id, ex=_CACHE_SECONDS)
        except Exception:
            pass
    return media_id or None


def send_exercise_image(phone: str, image_url: str, caption: str) -> bool:
    """Send one exercise picture with its caption. False (and nothing sent) if it can't be."""
    from app.queue.tasks import _in_service_window, _post_message

    settings = get_settings()
    if settings.disable_whatsapp_delivery or not _in_service_window(phone):
        return False
    media_id = media_id_for(image_url)
    if not media_id:
        return False
    try:
        _post_message(settings, {
            "messaging_product": "whatsapp",
            "to": phone.lstrip("+"),
            "type": "image",
            "image": {"id": media_id, "caption": caption[:1024]},
        })
    except httpx.HTTPError:
        return False
    return True
