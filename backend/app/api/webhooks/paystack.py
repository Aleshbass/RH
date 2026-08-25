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
from app.models.types import AuditKind, BookingStatus
from app.queue.tasks import enqueue_booking_confirmed

router = APIRouter()

_CONFIRMABLE = frozenset({BookingStatus.AWAITING_PAYMENT, BookingStatus.PROCESSING})


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


def _audit_booking(
    session: Session,
    *,
    actor_phone: str,
    person_id,
    payload: dict,
) -> None:
    append(
        session,
        kind=AuditKind.BOOKING,
        actor_phone=actor_phone,
        person_id=person_id,
        payload=payload,
    )


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

    booking = session.scalar(
        select(Booking)
        .where(Booking.paystack_reference == reference)
        .with_for_update()
    )
    if booking is None:
        _audit_booking(
            session,
            actor_phone="paystack",
            person_id=None,
            payload={"decision": "unknown_reference", "reference": reference},
        )
        return {"status": "ok"}

    patient = session.get(Patient, booking.patient_id)
    actor = patient.phone_e164 if patient is not None else "paystack"

    received_amount = data.get("amount")
    try:
        received_kobo = int(received_amount) if received_amount is not None else None
    except (TypeError, ValueError):
        received_kobo = None
    if received_kobo != booking.amount_kobo:
        _audit_booking(
            session,
            actor_phone=actor,
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

    if booking.status not in _CONFIRMABLE:
        _audit_booking(
            session,
            actor_phone=actor,
            person_id=booking.patient_id,
            payload={
                "decision": "non_confirmable_charge_success",
                "booking_id": str(booking.id),
                "status": str(booking.status),
                "reference": reference,
            },
        )
        return {"status": "ok"}

    advance_to_confirmed(session, booking.id, source="paystack_webhook")
    _audit_booking(
        session,
        actor_phone=actor,
        person_id=booking.patient_id,
        payload={
            "decision": "confirmed",
            "booking_id": str(booking.id),
            "reference": reference,
            "amount_kobo": booking.amount_kobo,
        },
    )
    if patient is not None:
        enqueue_booking_confirmed(
            patient.phone_e164,
            str(booking.id),
            "Your booking is confirmed.",
        )
    return {"status": "ok"}
