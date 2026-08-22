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
                if message.get("type") != "text":
                    continue
                wa_message_id = str(message.get("id") or "")
                phone = _e164(str(message.get("from") or ""))
                text = str((message.get("text") or {}).get("body") or "")
                if wa_message_id and phone:
                    enqueue_inbound(wa_message_id, phone, text)
    return {"status": "ok"}
