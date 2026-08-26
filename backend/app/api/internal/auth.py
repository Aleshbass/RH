import hashlib
import secrets

from fastapi import Depends, Header, HTTPException

from app.config import Settings, get_settings


def require_internal_key(
    x_internal_key: str | None = Header(default=None, alias="X-Internal-Key"),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.internal_api_secret or ""
    provided = x_internal_key or ""
    if not expected or not provided:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not secrets.compare_digest(
        hashlib.sha256(provided.encode()).digest(),
        hashlib.sha256(expected.encode()).digest(),
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")
