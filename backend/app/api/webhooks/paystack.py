import hashlib
import hmac
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.booking.state import advance_to_confirmed
from app.config import Settings, get_settings
from app.db import get_session
from app.models.booking import Booking
from app.models.patient import Patient
from app.models.paystack_event import PaystackEvent
from app.models.types import AuditKind
from app.queue.tasks import enqueue_booking_confirmed

router = APIRouter()


def _valid_signature(body: bytes, header: str, secret: str) -> bool:
    if not secret or not header:
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    return hmac.compare_digest(header, expected)


def _event_id(payload: dict) -> str:
    data = payload.get("data") or {}
    if payload.get("id") is not None:
        return str(payload["id"])
    if data.get("id") is not None:
        return str(data["id"])
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


@router.post("/webhooks/paystack")
async def paystack_webhook(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    body = await request.body()
    signature = request.headers.get("x-paystack-signature", "")
    if not _valid_signature(body, signature, settings.paystack_webhook_secret):
        raise HTTPException(status_code=400, detail="invalid signature")

    payload = json.loads(body or b"{}")
    data = payload.get("data") or {}
    reference = str(data.get("reference") or "")
    event_name = str(payload.get("event") or "")

    try:
        with session.begin_nested():
            session.add(
                PaystackEvent(
                    id=_event_id(payload),
                    event=event_name,
                    reference=reference or None,
                )
            )
            session.flush()
    except IntegrityError:
        return {"status": "ok"}

    if event_name != "charge.success":
        return {"status": "ok"}

    if not reference:
        return {"status": "ok"}

    booking = session.scalar(select(Booking).where(Booking.paystack_reference == reference))
    if booking is None:
        return {"status": "ok"}

    received_amount = data.get("amount")
    try:
        received_kobo = int(received_amount) if received_amount is not None else None
    except (TypeError, ValueError):
        received_kobo = None
    if received_kobo != booking.amount_kobo:
        patient = session.get(Patient, booking.patient_id)
        append(
            session,
            kind=AuditKind.ADMIN,
            actor_phone=patient.phone_e164 if patient is not None else "paystack",
            person_id=booking.patient_id,
            payload={
                "decision": "amount_mismatch",
                "booking_id": str(booking.id),
                "expected_kobo": booking.amount_kobo,
                "received_kobo": received_kobo,
                "reference": reference,
            },
        )
        return {"status": "ok"}

    advance_to_confirmed(session, booking.id, source="paystack_webhook")
    patient = session.get(Patient, booking.patient_id)
    if patient is not None:
        enqueue_booking_confirmed(
            patient.phone_e164,
            str(booking.id),
            "Your booking is confirmed.",
        )
    return {"status": "ok"}
