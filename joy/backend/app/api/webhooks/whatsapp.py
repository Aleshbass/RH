import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.config import Settings, get_settings
from app.queue.tasks import enqueue_inbound

router = APIRouter()


def _valid_signature(body: bytes, header: str, secret: str) -> bool:
    if not secret or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(header.removeprefix("sha256="), expected)


def _e164(phone: str) -> str:
    return phone if phone.startswith("+") else f"+{phone}"


@router.get("/webhook")
def verify_webhook(
    hub_mode: str | None = Query(default=None, alias="hub.mode"),
    hub_verify_token: str | None = Query(default=None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(default=None, alias="hub.challenge"),
    settings: Settings = Depends(get_settings),
) -> Response:
    if hub_mode == "subscribe" and hub_verify_token == settings.whatsapp_verify_token:
        return Response(content=hub_challenge or "", media_type="text/plain")
    raise HTTPException(status_code=403, detail="forbidden")


@router.post("/webhook")
async def inbound_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
) -> dict[str, str]:
    body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256", "")
    if not _valid_signature(body, signature, settings.whatsapp_app_secret):
        raise HTTPException(status_code=403, detail="invalid signature")

    payload = json.loads(body or b"{}")
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            value = change.get("value") or {}
            for message in value.get("messages") or []:
                wa_message_id = str(message.get("id") or "")
                phone = _e164(str(message.get("from") or ""))
                if not (wa_message_id and phone):
                    continue
                msg_type = message.get("type")
                if msg_type == "text":
                    text = str((message.get("text") or {}).get("body") or "")
                    enqueue_inbound(wa_message_id, phone, text)
                elif msg_type in {"interactive", "button"}:
                    # A tapped button or list row: its id is the reply Joy would accept typed
                    # (app/conversation/interactive.py), so it follows the same path as text.
                    text = _tapped_reply(message)
                    if text:
                        enqueue_inbound(wa_message_id, phone, text)
                elif msg_type == "audio":
                    audio = message.get("audio") or {}
                    media_id = str(audio.get("id") or "")
                    mime = str(audio.get("mime_type") or "audio/ogg")
                    duration = audio.get("seconds")
                    if duration is None:
                        duration = audio.get("duration")
                    duration_seconds = None
                    if duration is not None:
                        try:
                            duration_seconds = float(duration)
                        except (TypeError, ValueError):
                            duration_seconds = None
                    if media_id:
                        enqueue_inbound(
                            wa_message_id,
                            phone,
                            "",
                            audio_media_id=media_id,
                            audio_mime=mime,
                            audio_duration_seconds=duration_seconds,
                        )
                elif msg_type in {"image", "document"}:
                    blob = message.get(msg_type) or {}
                    media_ref = _media_ref(blob)
                    caption = str(blob.get("caption") or "")
                    if media_ref:
                        enqueue_inbound(
                            wa_message_id, phone, caption, media=[media_ref]
                        )
                elif msg_type == "location":
                    loc = message.get("location") or {}
                    lat = loc.get("latitude")
                    lng = loc.get("longitude")
                    if lat is not None and lng is not None:
                        enqueue_inbound(
                            wa_message_id,
                            phone,
                            "",
                            location_lat=float(lat),
                            location_lng=float(lng),
                        )
    return {"status": "ok"}


def _tapped_reply(message: dict) -> str:
    """The reply a tap stands for: a button or list row id, or a template quick-reply payload."""
    if message.get("type") == "button":  # quick-reply button on a template message
        button = message.get("button") or {}
        return str(button.get("payload") or button.get("text") or "").strip()
    interactive = message.get("interactive") or {}
    kind = interactive.get("type")
    if kind in {"button_reply", "list_reply"}:
        reply = interactive.get(kind) or {}
        return str(reply.get("id") or reply.get("title") or "").strip()
    return ""


def _media_ref(blob: dict) -> str:
    return str(blob.get("id") or blob.get("link") or blob.get("url") or "")
