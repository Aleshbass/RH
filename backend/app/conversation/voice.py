import httpx

from app.config import get_settings
from app.llm.gemini_client import LLMClient


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


def transcript_from_audio(
    llm: LLMClient,
    *,
    text: str = "",
    audio_url: str | None = None,
    audio_media_id: str | None = None,
    audio_mime: str | None = None,
    audio_bytes: bytes | None = None,
) -> str:
    if audio_bytes:
        return ingest_voice(llm, audio_bytes, audio_mime or "audio/ogg")
    if audio_media_id:
        data, mime = fetch_whatsapp_audio(audio_media_id)
        return ingest_voice(llm, data, audio_mime or mime)
    if audio_url:
        data, mime = fetch_audio(audio_url)
        return ingest_voice(llm, data, audio_mime or mime)
    return text
