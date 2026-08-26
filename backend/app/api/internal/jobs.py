import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.admin.stats_digest import digest
from app.config import Settings, get_settings
from app.db import get_session

router = APIRouter()


def require_job_token(
    x_internal_job_token: str | None = Header(default=None, alias="X-Internal-Job-Token"),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.internal_job_token
    provided = x_internal_job_token or ""
    if not expected or not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/api/internal/jobs/stats_digest", dependencies=[Depends(require_job_token)])
def stats_digest_job(session: Session = Depends(get_session)) -> dict[str, str]:
    return {"digest": digest(session)}
