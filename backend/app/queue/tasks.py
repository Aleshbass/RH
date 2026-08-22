import json

import httpx
import redis

from app.config import get_settings

INBOUND_QUEUE = "joy:inbound"
_WAMID_TTL_SECONDS = 60 * 60 * 24 * 7
_ENQUEUE_LUA = """
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', tonumber(ARGV[2])) then
    redis.call('LPUSH', KEYS[2], ARGV[1])
    return 1
end
return 0
"""


def _redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)


def enqueue_inbound(wa_message_id: str, phone: str, text: str) -> bool:
    client = _redis()
    lock_key = f"joy:wamid:{wa_message_id}"
    payload = json.dumps({"wa_message_id": wa_message_id, "phone": phone, "text": text})
    result = client.eval(
        _ENQUEUE_LUA,
        2,
        lock_key,
        INBOUND_QUEUE,
        payload,
        str(_WAMID_TTL_SECONDS),
    )
    return bool(result)


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
