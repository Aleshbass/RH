from sqlalchemy import select
from sqlalchemy.orm import Session

from app.conversation.turn_handler import handle_turn
from app.llm.gemini_client import LLMClient, get_llm_client
from app.models.conversation import Message
from app.models.types import TurnResult
from app.queue.tasks import send_whatsapp_text


def process_inbound(
    session: Session,
    wa_message_id: str,
    phone: str,
    text: str,
    llm: LLMClient | None = None,
) -> TurnResult | None:
    existing = session.scalar(select(Message.id).where(Message.wa_message_id == wa_message_id))
    if existing is not None:
        return None
    client = llm or get_llm_client()
    result = handle_turn(session, phone, text, client, wa_message_id=wa_message_id)
    send_whatsapp_text(phone, result.reply_text)
    return result
