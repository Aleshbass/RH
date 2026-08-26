import json

import httpx
import redis

from app.config import get_settings

INBOUND_QUEUE = "joy:inbound"
PROCESSING_QUEUE = "joy:inbound:processing"
DEAD_LETTER_QUEUE = "joy:inbound:dead"
MAX_ATTEMPTS = 3
_WAMID_TTL_SECONDS = 60 * 60 * 24 * 7
_ENQUEUE_LUA = """
if redis.call('SET', KEYS[1], '1', 'NX', 'EX', tonumber(ARGV[2])) then
    local pushed = redis.pcall('LPUSH', KEYS[2], ARGV[1])
    if type(pushed) == 'table' and pushed.err then
        redis.call('DEL', KEYS[1])
        return redis.error_reply(pushed.err)
    end
    return 1
end
return 0
"""


def _redis() -> redis.Redis:
    # Blocking pops (BRPOPLPUSH) must not inherit a socket timeout, or an empty
    # queue looks like a crash every wait interval.
    return redis.Redis.from_url(
        get_settings().redis_url,
        decode_responses=True,
        socket_timeout=None,
        socket_connect_timeout=10,
    )


def enqueue_inbound(
    wa_message_id: str,
    phone: str,
    text: str,
    *,
    audio_url: str | None = None,
    audio_media_id: str | None = None,
    audio_mime: str | None = None,
    media: list[str] | None = None,
    location_lat: float | None = None,
    location_lng: float | None = None,
) -> bool:
    client = _redis()
    lock_key = f"joy:wamid:{wa_message_id}"
    payload_body: dict = {
        "wa_message_id": wa_message_id,
        "phone": phone,
        "text": text,
    }
    if audio_url:
        payload_body["audio_url"] = audio_url
    if audio_media_id:
        payload_body["audio_media_id"] = audio_media_id
    if audio_mime:
        payload_body["audio_mime"] = audio_mime
    if media:
        payload_body["media"] = [str(item) for item in media if item]
    if location_lat is not None:
        payload_body["location_lat"] = location_lat
    if location_lng is not None:
        payload_body["location_lng"] = location_lng
    payload = json.dumps(payload_body)
    result = client.eval(
        _ENQUEUE_LUA,
        2,
        lock_key,
        INBOUND_QUEUE,
        payload,
        str(_WAMID_TTL_SECONDS),
    )
    return bool(result)


BOOKING_CONFIRMED_QUEUE = "joy:booking_confirmed"
PHYSIO_BOOKING_ALERT_QUEUE = "joy:notify_physio_booking"
FAMILY_SAFETY_QUEUE = "joy:notify_family_safety"
PHYSIO_RELAY_QUEUE = "joy:notify_physio_relay"
FAMILY_RELAY_QUEUE = "joy:notify_family_relay"
PARTNER_REFERRAL_QUEUE = "joy:notify_partner_referral"
ADMIN_ESCALATION_QUEUE = "joy:notify_admin_escalation"
BROADCAST_QUEUE = "joy:notify_broadcast"


def enqueue_booking_confirmed(phone: str, booking_id: str, text: str) -> None:
    _redis().lpush(
        BOOKING_CONFIRMED_QUEUE,
        json.dumps(
            {
                "phone": phone,
                "booking_id": str(booking_id),
                "text": text,
            }
        ),
    )


def enqueue_notify_physio_booking(phone: str, booking_id: str, text: str) -> None:
    _redis().lpush(
        PHYSIO_BOOKING_ALERT_QUEUE,
        json.dumps(
            {
                "phone": phone,
                "booking_id": str(booking_id),
                "text": text,
            }
        ),
    )


def enqueue_notify_family_safety(phone: str, text: str) -> None:
    _redis().lpush(
        FAMILY_SAFETY_QUEUE,
        json.dumps({"phone": phone, "text": text}),
    )


def enqueue_notify_physio_relay(phone: str, text: str) -> None:
    _redis().lpush(
        PHYSIO_RELAY_QUEUE,
        json.dumps({"phone": phone, "text": text}),
    )


def enqueue_notify_family_relay(phone: str, text: str) -> None:
    _redis().lpush(
        FAMILY_RELAY_QUEUE,
        json.dumps({"phone": phone, "text": text}),
    )


def enqueue_notify_partner_referral(phone: str, text: str) -> None:
    _redis().lpush(
        PARTNER_REFERRAL_QUEUE,
        json.dumps({"phone": phone, "text": text}),
    )


def enqueue_notify_admin_escalation(phone: str, text: str) -> None:
    _redis().lpush(
        ADMIN_ESCALATION_QUEUE,
        json.dumps({"phone": phone, "text": text}),
    )


def enqueue_notify_broadcast(phone: str, text: str) -> None:
    _redis().lpush(
        BROADCAST_QUEUE,
        json.dumps({"phone": phone, "text": text}),
    )


def send_whatsapp_text(phone: str, text: str) -> None:
    settings = get_settings()
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        return
    response = httpx.post(
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
    response.raise_for_status()
