from uuid import uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.llm.gemini_client import LLMClient, get_llm_client
from app.queue.worker import process_inbound

router = APIRouter()


class SimulateTurnIn(BaseModel):
    phone: str
    text: str = ""
    audio_url: str | None = None


def require_internal_access(
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
    settings: Settings = Depends(get_settings),
) -> None:
    required = settings.joy_environment == "production" or bool(settings.internal_api_secret)
    if not required:
        return
    if not settings.internal_api_secret or x_internal_secret != settings.internal_api_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/api/internal/simulate_turn", dependencies=[Depends(require_internal_access)])
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
        audio_url=body.audio_url,
    )
    return {"reply": result.reply_text if result is not None else ""}
