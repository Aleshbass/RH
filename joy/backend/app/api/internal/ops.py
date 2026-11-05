"""Operator actions on Joy's data, for the Rehabify team. Protected by X-Internal-Key."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.api.internal.auth import require_internal_key
from app.db import SessionLocal
from app.ops.reset_phone import normalize_phone, reset_phone

router = APIRouter()


class ResetPhoneRequest(BaseModel):
    phone: str
    apply: bool = False
    # The phone number again, required to apply
    confirm: str = ""


@router.post("/api/internal/ops/reset-phone", dependencies=[Depends(require_internal_key)])
def reset_phone_endpoint(body: ResetPhoneRequest) -> dict:
    """Dry run unless apply is true and confirm repeats the phone number."""
    apply = body.apply and normalize_phone(body.confirm) == normalize_phone(body.phone)
    if body.apply and not apply:
        raise HTTPException(status_code=400, detail="confirm must repeat the phone number")
    with SessionLocal() as session:
        return reset_phone(session, body.phone, apply=apply)
