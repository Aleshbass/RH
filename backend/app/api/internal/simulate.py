from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_session
from app.llm.gemini_client import LLMClient, get_llm_client
from app.queue.worker import process_inbound

router = APIRouter()


class SimulateTurnIn(BaseModel):
    phone: str
    text: str
    audio_url: str | None = None


@router.post("/api/internal/simulate_turn")
def simulate_turn(
    body: SimulateTurnIn,
    session: Session = Depends(get_session),
    llm: LLMClient = Depends(get_llm_client),
) -> dict[str, str]:
    result = process_inbound(
        session,
        f"simulate:{uuid4()}",
        body.phone,
        body.text,
        llm=llm,
    )
    return {"reply": result.reply_text if result is not None else ""}
