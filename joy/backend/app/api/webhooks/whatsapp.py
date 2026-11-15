import hashlib
import hmac
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from app.config import Settings, get_settings
from app.queue.tasks import enqueue_delivery_failure, enqueue_inbound

logger = logging.getLogger(__name__)

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
            for status in value.get("statuses") or []:
                # Delivery receipts for messages Joy sent: only failures are acted on
                _failed_delivery(status)
            for message in value.get("messages") or []:
                wa_message_id = str(message.get("id") or "")
                phone = _e164(str(message.get("from") or ""))
                if not (wa_message_id and phone):
                    continue
                msg_type = message.get("type")
                if msg_type == "text":
                    text = str((message.get("text") or {}).get("body") or "")
                    enqueue_inbound(wa_message_id, phone, text)
                elif msg_type == "interactive" and (message.get("interactive") or {}).get("type") == "nfm_reply":
                    # A completed WhatsApp Flow (the sign-up form, app/flows/signup.py)
                    response = _flow_response(message)
                    if response is not None:
                        enqueue_inbound(wa_message_id, phone, "", flow_response=response)
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


def _failed_delivery(status) -> None:
    """A message Meta accepted but could not deliver: logged, and queued for the worker to record.

    Only the message id and Meta's error code and title are logged, never the number or the text.
    Common codes: 131047 more than 24h since they last wrote, 131049 marketing limit for this
    person, 131050 they stopped marketing messages, 131026 undeliverable.
    """
    if not isinstance(status, dict) or status.get("status") != "failed":
        return
    wa_message_id = str(status.get("id") or "")
    if not wa_message_id:
        return
    errors = [error for error in status.get("errors") or [] if isinstance(error, dict)]
    error = errors[0] if errors else {}
    try:
        code = int(error["code"]) if error.get("code") is not None else None
    except (TypeError, ValueError):
        code = None
    title = " ".join(str(error.get("title") or "").split())[:120]
    logger.warning(
        "joy_whatsapp_delivery_failed wa_message_id=%s code=%s title=%s", wa_message_id, code, title
    )
    recipient = str(status.get("recipient_id") or "")
    enqueue_delivery_failure(
        wa_message_id, recipient=_e164(recipient) if recipient else "", code=code, title=title
    )


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


def _flow_response(message: dict) -> dict | None:
    """The answers of a completed Flow: nfm_reply.response_json is a JSON string."""
    reply = (message.get("interactive") or {}).get("nfm_reply") or {}
    raw = reply.get("response_json")
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except ValueError:
        return None
    if not isinstance(data, dict) or len(raw or "") > 20_000:
        return None
    return data


def _media_ref(blob: dict) -> str:
    return str(blob.get("id") or blob.get("link") or blob.get("url") or "")
