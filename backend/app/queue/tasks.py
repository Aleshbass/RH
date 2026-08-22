import json

import httpx
import redis

from app.config import get_settings

INBOUND_QUEUE = "joy:inbound"
_WAMID_TTL_SECONDS = 60 * 60 * 24 * 7


def _redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)


def enqueue_inbound(wa_message_id: str, phone: str, text: str) -> bool:
    client = _redis()
    reserved = client.set(f"joy:wamid:{wa_message_id}", "1", nx=True, ex=_WAMID_TTL_SECONDS)
    if not reserved:
        return False
    client.lpush(
        INBOUND_QUEUE,
        json.dumps({"wa_message_id": wa_message_id, "phone": phone, "text": text}),
    )
    return True


def send_whatsapp_text(phone: str, text: str) -> None:
    settings = get_settings()
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return
    httpx.post(
        f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/messages",
        headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
        json={
            "messaging_product": "whatsapp",
            "to": phone.lstrip("+"),
            "type": "text",
            "text": {"body": text},
        },
        timeout=15.0,
    )
