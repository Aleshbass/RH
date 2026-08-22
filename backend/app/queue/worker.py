import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.conversation.turn_handler import handle_turn
from app.conversation.voice import transcript_from_audio
from app.db import SessionLocal
from app.llm.gemini_client import LLMClient, get_llm_client
from app.models.conversation import Message
from app.models.types import TurnResult
from app.queue.tasks import INBOUND_QUEUE, _redis, send_whatsapp_text


def process_inbound(
    session: Session,
    wa_message_id: str,
    phone: str,
    text: str,
    llm: LLMClient | None = None,
    *,
    audio_url: str | None = None,
    audio_media_id: str | None = None,
    audio_mime: str | None = None,
    audio_bytes: bytes | None = None,
) -> TurnResult | None:
    existing = session.scalar(select(Message.id).where(Message.wa_message_id == wa_message_id))
    if existing is not None:
        return None
    client = llm or get_llm_client()
    user_text = transcript_from_audio(
        client,
        text=text,
        audio_url=audio_url,
        audio_media_id=audio_media_id,
        audio_mime=audio_mime,
        audio_bytes=audio_bytes,
    )
    return handle_turn(session, phone, user_text, client, wa_message_id=wa_message_id)


def process_queue_once(
    session: Session | None = None,
    llm: LLMClient | None = None,
    timeout: int = 1,
) -> TurnResult | None:
    popped = _redis().brpop(INBOUND_QUEUE, timeout=timeout)
    if popped is None:
        return None
    _, raw = popped
    payload = json.loads(raw)
    own_session = session is None
    db = session or SessionLocal()
    try:
        result = process_inbound(
            db,
            payload["wa_message_id"],
            payload["phone"],
            payload.get("text") or "",
            llm=llm,
            audio_url=payload.get("audio_url"),
            audio_media_id=payload.get("audio_media_id"),
            audio_mime=payload.get("audio_mime"),
        )
        if result is not None:
            send_whatsapp_text(payload["phone"], result.reply_text)
        if own_session:
            db.commit()
        return result
    except Exception:
        if own_session:
            db.rollback()
        raise
    finally:
        if own_session:
            db.close()


process_one = process_queue_once


def run_forever(timeout: int = 5) -> None:
    while True:
        process_queue_once(timeout=timeout)
