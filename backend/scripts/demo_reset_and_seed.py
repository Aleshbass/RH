"""Reset WhatsApp demo state and seed verified physios for match/book.

Usage (production):
  cd joy-ai && railway run --service Joy-AI -- \\
    python backend/scripts/demo_reset_and_seed.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, select, text

from app.db import SessionLocal
from app.models.availability_slot import AvailabilitySlot
from app.models.booking import Booking
from app.models.conversation import Conversation, Message
from app.models.family_member import FamilyMember
from app.models.partner import Partner
from app.models.partner_content_request import PartnerContentRequest
from app.models.patient import Patient
from app.models.payout import Payout
from app.models.physiotherapist import Physiotherapist
from app.models.referral_fee import ReferralFee
from app.models.relay import RelayThread
from app.models.session_note import SessionNote
from app.models.triage_session import TriageSession
from app.physio.availability import WeeklyWindow, write_slots
from app.queue.tasks import (
    ADMIN_ESCALATION_QUEUE,
    BOOKING_CONFIRMED_QUEUE,
    BROADCAST_QUEUE,
    DEAD_LETTER_QUEUE,
    FAMILY_RELAY_QUEUE,
    FAMILY_SAFETY_QUEUE,
    INBOUND_QUEUE,
    PARTNER_REFERRAL_QUEUE,
    PHYSIO_BOOKING_ALERT_QUEUE,
    PHYSIO_RELAY_QUEUE,
    PROCESSING_QUEUE,
    TAKEOVER_QUEUE,
    _redis,
)

# Demo physios — placeholder WhatsApp numbers (alerts may not deliver).
_DEMO_PHYSIOS = (
    {
        "phone_e164": "+2348000091001",
        "city": "Lagos",
        "specialty_tags": ["msk"],
        "lat": 6.5244,
        "lng": 3.3792,
        "price_kobo": 1500000,
        "rating": 4.8,
    },
    {
        "phone_e164": "+2348000091002",
        "city": "Lagos",
        "specialty_tags": ["msk", "post_surgical"],
        "lat": 6.4654,
        "lng": 3.4064,
        "price_kobo": 2000000,
        "rating": 4.6,
    },
    {
        "phone_e164": "+2348000091003",
        "city": "Abuja",
        "specialty_tags": ["neuro", "msk"],
        "lat": 9.0765,
        "lng": 7.3986,
        "price_kobo": 1800000,
        "rating": 4.7,
    },
)

_WEEKLY = [
    WeeklyWindow(weekday=d, start_hhmm="09:00", end_hhmm="17:00") for d in range(0, 5)
]


def _clear_queues() -> None:
    client = _redis()
    for key in (
        INBOUND_QUEUE,
        PROCESSING_QUEUE,
        DEAD_LETTER_QUEUE,
        BOOKING_CONFIRMED_QUEUE,
        PHYSIO_BOOKING_ALERT_QUEUE,
        FAMILY_SAFETY_QUEUE,
        PHYSIO_RELAY_QUEUE,
        FAMILY_RELAY_QUEUE,
        PARTNER_REFERRAL_QUEUE,
        ADMIN_ESCALATION_QUEUE,
        BROADCAST_QUEUE,
        TAKEOVER_QUEUE,
    ):
        client.delete(key)
    for key in client.scan_iter("joy:wamid:*"):
        client.delete(key)
    try:
        client.delete("joy:session_reminders")
    except Exception:
        pass


def _wipe_user_state(session) -> dict[str, int]:
    counts: dict[str, int] = {}

    def _count_delete(model) -> int:
        rows = session.scalars(select(model)).all()
        n = len(rows)
        if n:
            session.execute(delete(model))
        return n

    # Child tables first (FK order).
    counts["session_notes"] = _count_delete(SessionNote)
    counts["payouts"] = _count_delete(Payout)
    counts["referral_fees"] = _count_delete(ReferralFee)
    counts["relay_threads"] = _count_delete(RelayThread)
    counts["bookings"] = _count_delete(Booking)
    counts["messages"] = _count_delete(Message)
    counts["triage_sessions"] = _count_delete(TriageSession)
    counts["conversations"] = _count_delete(Conversation)
    counts["family_members"] = _count_delete(FamilyMember)
    counts["partner_content_requests"] = _count_delete(PartnerContentRequest)
    counts["patients"] = _count_delete(Patient)
    counts["partners"] = _count_delete(Partner)
    # Drop prior physio slots + physios so demo seed is clean.
    counts["availability_slots"] = _count_delete(AvailabilitySlot)
    counts["physiotherapists"] = _count_delete(Physiotherapist)
    # Keep admins; trim noisy audit for a cleaner demo query surface.
    result = session.execute(text("DELETE FROM audit_events"))
    counts["audit_events"] = result.rowcount or 0
    session.flush()
    return counts


def _seed_physios(session) -> list[str]:
    phones: list[str] = []
    for spec in _DEMO_PHYSIOS:
        physio = Physiotherapist(
            phone_e164=spec["phone_e164"],
            city=spec["city"],
            specialty_tags=list(spec["specialty_tags"]),
            lat=spec["lat"],
            lng=spec["lng"],
            price_kobo=spec["price_kobo"],
            rating=spec["rating"],
            verified=True,
            onboarding_status="verified",
            mrtb_number=f"DEMO-{spec['phone_e164'][-4:]}",
            service_radius_km=40.0,
        )
        session.add(physio)
        session.flush()
        write_slots(session, physio.id, _WEEKLY)
        phones.append(physio.phone_e164)
    session.flush()
    return phones


def main() -> None:
    session = SessionLocal()
    try:
        print("Clearing Redis inbound/notify queues…")
        _clear_queues()
        print("Wiping conversational / booking / patient test rows…")
        counts = _wipe_user_state(session)
        for table, n in counts.items():
            print(f"  {table}: {n}")
        print("Seeding verified demo physios…")
        phones = _seed_physios(session)
        session.commit()
        for phone in phones:
            print(f"  seeded {phone}")
        print("Done. Ask testers to clear WhatsApp chat history, then demo fresh.")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
