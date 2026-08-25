from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit.logger import append
from app.booking.paystack_client import initiate_transfer
from app.models.booking import Booking
from app.models.payout import Payout
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, BookingStatus

_PAYOUT_RE = re.compile(r"(?i)\b(payout|withdraw(?:al)?)\b")
_EARNINGS_RE = re.compile(r"(?i)\b(earnings|weekly statement)\b")
_KOBO_AMOUNT_RE = re.compile(r"(?i)(\d[\d,]*)\s*kobo")
_NAIRA_AMOUNT_RE = re.compile(r"(?i)(?:₦\s*)(\d[\d,]*)|(\d[\d,]*)\s*naira")
_BARE_AMOUNT_RE = re.compile(r"(?i)(\d[\d,]*)")


def request_payout(
    session: Session,
    physio_id: UUID,
    amount_kobo: int,
    *,
    paystack=None,
) -> Payout:
    if amount_kobo <= 0:
        raise ValueError("amount_kobo must be positive")
    physio = session.get(Physiotherapist, physio_id)
    if physio is None:
        raise ValueError(f"physio not found: {physio_id}")
    reference = f"payout_{uuid4().hex}"
    recipient = f"RCP_{physio_id}"
    payout = Payout(
        physio_id=physio_id,
        amount_kobo=amount_kobo,
        status="requested",
        transfer_code=None,
    )
    session.add(payout)
    session.flush()
    append(
        session,
        kind=AuditKind.PAYOUT,
        actor_phone=physio.phone_e164,
        person_id=physio_id,
        payload={
            "decision": "requested",
            "payout_id": str(payout.id),
            "amount_kobo": amount_kobo,
            "status": payout.status,
            "transfer_code": payout.transfer_code,
        },
    )
    try:
        result = _initiate_transfer(
            paystack, amount_kobo, recipient, reference, reason="Joy physio payout"
        )
        payout.transfer_code = str(result.get("transfer_code") or reference)
        session.flush()
    except Exception:
        pass
    return payout


def mark_payout_sent(
    session: Session,
    payout_id: UUID | str | None = None,
    *,
    transfer_code: str | None = None,
) -> Payout:
    payout = None
    if payout_id is not None:
        payout = session.get(Payout, payout_id)
    elif transfer_code:
        payout = session.scalar(select(Payout).where(Payout.transfer_code == transfer_code))
    if payout is None:
        raise ValueError("payout not found")
    payout.status = "sent"
    payout.sent_at = datetime.now(timezone.utc)
    session.flush()
    return payout


def earnings_statement(session: Session, physio_id: UUID, period) -> str:
    start, end = _period_bounds(period)
    completed = session.scalars(
        select(Booking).where(
            Booking.physio_id == physio_id,
            Booking.status == BookingStatus.COMPLETED,
            Booking.completed_at.is_not(None),
            Booking.completed_at >= start,
            Booking.completed_at <= end,
        )
    ).all()
    payouts = session.scalars(
        select(Payout).where(
            Payout.physio_id == physio_id,
            Payout.created_at >= start,
            Payout.created_at <= end,
        )
    ).all()
    completed_kobo = sum(row.amount_kobo for row in completed)
    payout_kobo = sum(row.amount_kobo for row in payouts)
    return (
        f"Earnings {start.date()} to {end.date()}: "
        f"{len(completed)} completed session(s), {completed_kobo} kobo. "
        f"Payouts requested: {payout_kobo} kobo."
    )


def apply_payout_turn(session: Session, physio_id: UUID, text: str, *, paystack=None) -> str | None:
    if _EARNINGS_RE.search(text or ""):
        now = datetime.now(timezone.utc)
        return earnings_statement(session, physio_id, (now - timedelta(days=7), now))
    if not _PAYOUT_RE.search(text or ""):
        return None
    amount = _parse_amount_kobo(text or "")
    if amount is None:
        return "Tell me the payout amount in kobo, for example: payout 500000 kobo"
    payout = request_payout(session, physio_id, amount, paystack=paystack)
    naira = payout.amount_kobo / 100
    if not payout.transfer_code:
        return (
            f"Payout of ₦{naira:,.0f} requested. "
            "Paystack transfer failed — we'll retry."
        )
    return f"Payout of ₦{naira:,.0f} requested."


def _initiate_transfer(paystack, amount_kobo: int, recipient: str, reference: str, reason: str):
    if paystack is not None:
        return paystack.initiate_transfer(amount_kobo, recipient, reference, reason)
    return initiate_transfer(amount_kobo, recipient, reference, reason)


def _parse_amount_kobo(text: str) -> int | None:
    kobo = _KOBO_AMOUNT_RE.search(text)
    if kobo:
        return int(kobo.group(1).replace(",", ""))
    naira = _NAIRA_AMOUNT_RE.search(text)
    if naira:
        raw = int((naira.group(1) or naira.group(2)).replace(",", ""))
        return raw * 100
    amounts = list(_BARE_AMOUNT_RE.finditer(text))
    if not amounts:
        return None
    if len(amounts) > 1:
        return None
    raw = int(amounts[0].group(1).replace(",", ""))
    return raw * 100 if raw < 100_000 else raw


def _period_bounds(period) -> tuple[datetime, datetime]:
    if isinstance(period, str) and period.strip().lower() == "week":
        end = datetime.now(timezone.utc)
        return end - timedelta(days=7), end
    if isinstance(period, (tuple, list)) and len(period) == 2:
        return period[0], period[1]
    raise ValueError("period must be (start, end) or 'week'")
