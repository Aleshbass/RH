import json
from hashlib import sha256
from datetime import datetime, timezone

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
    audio_duration_seconds: float | None = None,
    media: list[str] | None = None,
    location_lat: float | None = None,
    location_lng: float | None = None,
    flow_response: dict | None = None,
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
    if audio_duration_seconds is not None:
        payload_body["audio_duration_seconds"] = float(audio_duration_seconds)
    if media:
        payload_body["media"] = [str(item) for item in media if item]
    if location_lat is not None:
        payload_body["location_lat"] = location_lat
    if location_lng is not None:
        payload_body["location_lng"] = location_lng
    if flow_response is not None:
        payload_body["flow_response"] = flow_response
    payload = json.dumps(payload_body)
    result = client.eval(
        _ENQUEUE_LUA,
        2,
        lock_key,
        INBOUND_QUEUE,
        payload,
        str(_WAMID_TTL_SECONDS),
    )
    _mark_service_window(client, phone)
    return bool(result)


# WhatsApp only accepts free-form messages within 24 hours of the person's last
# message (the customer service window); after that only approved templates are
# delivered. Kept slightly shorter than 24h so a send near the edge stays safe.
_SERVICE_WINDOW_SECONDS = 60 * 60 * 24 - 15 * 60


def _service_window_key(phone: str) -> str:
    return f"joy:wa_window:{phone.lstrip('+')}"


def _mark_service_window(client: redis.Redis, phone: str) -> None:
    try:
        client.set(_service_window_key(phone), "1", ex=_SERVICE_WINDOW_SECONDS)
    except redis.RedisError:
        pass  # Never lose an inbound message over window bookkeeping.


def _in_service_window(phone: str) -> bool:
    try:
        return bool(_redis().exists(_service_window_key(phone)))
    except redis.RedisError:
        return True  # Unknown: fall back to a plain message, as before.


def _template_body_parameter(text: str) -> str:
    # Template parameters may not contain newlines, tabs or long runs of spaces.
    flat = " ".join(text.split())
    return flat if len(flat) <= 900 else flat[:899].rstrip() + "…"


BOOKING_CONFIRMED_QUEUE = "joy:booking_confirmed"
PHYSIO_BOOKING_ALERT_QUEUE = "joy:notify_physio_booking"
FAMILY_SAFETY_QUEUE = "joy:notify_family_safety"
PHYSIO_RELAY_QUEUE = "joy:notify_physio_relay"
FAMILY_RELAY_QUEUE = "joy:notify_family_relay"
PARTNER_REFERRAL_QUEUE = "joy:notify_partner_referral"
ADMIN_ESCALATION_QUEUE = "joy:notify_admin_escalation"
BROADCAST_QUEUE = "joy:notify_broadcast"
TAKEOVER_QUEUE = "joy:notify_takeover"
BOOKING_EMAIL_QUEUE = "joy:booking_email"
BOOKING_EMAIL_PROCESSING_QUEUE = "joy:booking_email:processing"
BOOKING_EMAIL_DEAD_LETTER_QUEUE = "joy:booking_email:dead"


def enqueue_booking_confirmed(
    phone: str,
    booking_id: str,
    text: str,
    *,
    email: str | None = None,
    email_subject: str = "Your Rehabify appointment details",
) -> None:
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
    if email:
        _redis().lpush(
            BOOKING_EMAIL_QUEUE,
            json.dumps({"email": email, "booking_id": str(booking_id), "subject": email_subject, "text": text}),
        )


def send_appointment_email(
    email: str,
    subject: str,
    text: str,
    *,
    idempotency_key: str | None = None,
) -> None:
    """Send a plain-text-safe appointment email through Resend."""
    settings = get_settings()
    if not settings.resend_api_key or not settings.from_email:
        if settings.joy_environment.lower() == "development":
            # Local tests should not accidentally send mail. The queued item is
            # still observable in Redis and production refuses this omission.
            return
        raise RuntimeError("Appointment email delivery is not configured")
    # A retry can happen after Resend accepted the message but before the
    # worker persisted its acknowledgement.  Give Resend a stable key so that
    # ambiguity does not result in duplicate patient emails.
    headers = {"Authorization": f"Bearer {settings.resend_api_key}"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    response = httpx.post(
        "https://api.resend.com/emails",
        headers=headers,
        json={
            "from": f"{settings.from_name} <{settings.from_email}>",
            "to": [email],
            "subject": subject,
            "text": text,
        },
        timeout=15.0,
    )
    response.raise_for_status()


def appointment_email_idempotency_key(
    *, booking_id: str, subject: str, text: str, kind: str = "details"
) -> str:
    """Return a stable, bounded Resend idempotency key for one notification."""
    content_hash = sha256(f"{subject}\n{text}".encode("utf-8")).hexdigest()[:24]
    return f"joy-{kind}-{booking_id}-{content_hash}"[:255]


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


def enqueue_notify_takeover(phone: str, text: str) -> None:
    _redis().lpush(
        TAKEOVER_QUEUE,
        json.dumps({"phone": phone, "text": text}),
    )


def _mirror_local_delivery(phone: str, text: str) -> None:
    """Persist a development-only outbound notification for the local console.

    This deliberately runs only behind ``DISABLE_WHATSAPP_DELIVERY`` and is
    not a replacement for WhatsApp delivery or its delivery receipts.
    """
    # Import lazily so normal queue startup remains independent of SQLAlchemy
    # model initialization.
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models.conversation import Conversation, Message
    from app.models.patient import Patient
    from app.models.types import Persona

    with SessionLocal() as session:
        patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone))
        if patient is None:
            return
        conversation = session.scalar(
            select(Conversation).where(
                Conversation.person_id == patient.id,
                Conversation.persona == Persona.PATIENT,
            )
        )
        if conversation is None:
            return
        session.add(
            Message(
                conversation_id=conversation.id,
                role="joy",
                text=text,
                created_at=datetime.now(timezone.utc),
            )
        )
        session.commit()


def send_whatsapp_text(phone: str, text: str) -> None:
    settings = get_settings()
    if settings.disable_whatsapp_delivery:
        if settings.joy_environment.lower() != "development":
            raise RuntimeError(
                "DISABLE_WHATSAPP_DELIVERY is permitted only in development"
            )
        # Keep WhatsApp disabled during local integration tests, but retain a
        # faithful local record of asynchronous outbound notices. The dev
        # console polls this same conversation history, so webhook-driven
        # updates (for example, provider acceptance) are visible without
        # contacting a real patient.
        _mirror_local_delivery(phone, text)
        return
    if not settings.whatsapp_access_token or not settings.whatsapp_phone_number_id:
        # A silent no-op is indistinguishable from a delivered reply and leaves
        # the patient waiting forever.  Let the worker retry and record this.
        raise RuntimeError("WhatsApp delivery is not configured")
    message: dict = {"messaging_product": "whatsapp", "to": phone.lstrip("+"), "type": "text", "text": {"body": text}}
    template = settings.whatsapp_update_template.strip()
    if template and not _in_service_window(phone):
        # Outside the 24-hour window (reminders, alerts, links sent later), Meta
        # delivers only an approved template: its body carries the text as {{1}}.
        message = {
            "messaging_product": "whatsapp",
            "to": phone.lstrip("+"),
            "type": "template",
            "template": {
                "name": template,
                "language": {"code": settings.whatsapp_update_template_language or "en"},
                "components": [{"type": "body", "parameters": [{"type": "text", "text": _template_body_parameter(text)}]}],
            },
        }
    _post_message(settings, message)


_INTERACTIVE_BODY_LIMIT = 1024


def send_whatsapp_interactive(phone: str, text: str, interactive: dict, *, text_sender=None) -> None:
    """Send ``text`` with tap-to-answer buttons or a list (app/conversation/interactive.py).

    Buttons only work inside the 24-hour window. A text longer than WhatsApp's 1024-character
    button body goes out first as a plain message, followed by the buttons under a short prompt.
    In development with delivery disabled, outside the window, or if Meta rejects the
    interactive message, the text goes out as a plain message: typed replies always work, so
    nothing is lost. ``text_sender`` is that plain-text sender (the worker passes its own).
    """
    send_text = text_sender or send_whatsapp_text
    settings = get_settings()
    if (
        settings.disable_whatsapp_delivery
        or not settings.whatsapp_access_token
        or not settings.whatsapp_phone_number_id
        or not _in_service_window(phone)
    ):
        send_text(phone, text)
        return
    body = text
    if len(text) > _INTERACTIVE_BODY_LIMIT:
        send_text(phone, text)
        body = "Tap an option below, or type your reply."
    message = {
        "messaging_product": "whatsapp",
        "to": phone.lstrip("+"),
        "type": "interactive",
        "interactive": {**interactive, "body": {"text": body}},
    }
    try:
        _post_message(settings, message)
    except httpx.HTTPError:
        if body == text:
            send_text(phone, text)


def _post_message(settings, message: dict) -> None:
    response = httpx.post(
        f"https://graph.facebook.com/v21.0/{settings.whatsapp_phone_number_id}/messages",
        headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
        json=message,
        timeout=15.0,
    )
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        body = getattr(exc.response, "text", "") or ""
        raise httpx.HTTPStatusError(
            f"{exc.response.status_code} for Graph messages: {body[:500]}",
            request=exc.request,
            response=exc.response,
        ) from exc
