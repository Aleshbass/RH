"""Reset Joy's stored conversational context for every persona.

This is an operator tool, intended for a controlled reset before a fresh
end-to-end test. It removes the data Joy uses to remember a prior chat:

* message history;
* triage sessions and their extracted clinical facts; and
* conversation phase, stage, summary, booking substate, and takeover state.

It deliberately does *not* delete patients, physiotherapists, family links,
bookings, payment records, RH identity mappings, or append-only audit events.
WhatsApp's visible chat history is also not affected; only Joy's database
memory is cleared.

The command is a dry run by default. Applying it requires both explicit
flags. It refuses to reset patients with active Joy bookings unless that
additional risk is explicitly acknowledged.

Usage from the repository root:

    # Inspect what would be changed (safe; no writes)
    .\\.venv\\Scripts\\python.exe backend\\scripts\\reset_all_conversation_context.py

    # Apply for users without an active Joy booking
    .\\.venv\\Scripts\\python.exe backend\\scripts\\reset_all_conversation_context.py \\
      --apply --confirm-clear-all-context

    # Include users who have an active Joy booking (use only for a test reset)
    .\\.venv\\Scripts\\python.exe backend\\scripts\\reset_all_conversation_context.py \\
      --apply --confirm-clear-all-context --include-active-booking-users
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import delete, func, select, update

from app.db import SessionLocal
from app.models.booking import Booking
from app.models.conversation import Conversation, Message
from app.models.triage_session import TriageSession
from app.models.types import BookingStatus, ConversationStage, PatientPhase


ACTIVE_BOOKING_STATUSES = (
    BookingStatus.DRAFT,
    BookingStatus.AWAITING_PAYMENT,
    BookingStatus.PROCESSING,
    BookingStatus.CONFIRMED,
)


@dataclass(frozen=True)
class ResetCounts:
    conversations: int
    messages: int
    triage_sessions: int
    active_booking_patients: int


def _counts(session) -> ResetCounts:
    return ResetCounts(
        conversations=session.scalar(select(func.count()).select_from(Conversation)) or 0,
        messages=session.scalar(select(func.count()).select_from(Message)) or 0,
        triage_sessions=session.scalar(select(func.count()).select_from(TriageSession)) or 0,
        active_booking_patients=session.scalar(
            select(func.count(func.distinct(Booking.patient_id))).where(
                Booking.status.in_(ACTIVE_BOOKING_STATUSES)
            )
        )
        or 0,
    )


def _print_counts(counts: ResetCounts) -> None:
    print("Context reset scope:")
    print(f"  conversations reset: {counts.conversations}")
    print(f"  stored messages deleted: {counts.messages}")
    print(f"  triage sessions deleted: {counts.triage_sessions}")
    print(f"  patients with active Joy bookings: {counts.active_booking_patients}")


def reset_all_context(session, *, include_active_booking_users: bool) -> ResetCounts:
    """Apply the reset and return the pre-reset scope counts.

    Conversations are retained (rather than recreated) to preserve stable
    database references, but reset to the exact state used for a first chat.
    Messages must be deleted first because they reference conversations.
    """

    counts = _counts(session)
    if counts.active_booking_patients and not include_active_booking_users:
        raise RuntimeError(
            "Refusing to reset context while active Joy bookings exist. "
            "Re-run with --include-active-booking-users only if this is an "
            "intentional test reset."
        )

    session.execute(delete(Message))
    session.execute(delete(TriageSession))
    session.execute(
        update(Conversation).values(
            phase=PatientPhase.FIRST_CONTACT,
            stage=ConversationStage.STORY_CAPTURE.value,
            last_known_language=None,
            summary_text=None,
            booking_substate=None,
            booking_context=None,
            human_takeover=False,
            takeover_notified_at=None,
        )
    )
    session.flush()
    return counts


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="perform the reset; without this flag the command is a dry run",
    )
    parser.add_argument(
        "--confirm-clear-all-context",
        action="store_true",
        help="acknowledge that all stored conversation and triage context will be cleared",
    )
    parser.add_argument(
        "--include-active-booking-users",
        action="store_true",
        help="allow resetting patients who have a draft, payment-pending, processing, or confirmed Joy booking",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    session = SessionLocal()
    try:
        if not args.apply:
            _print_counts(_counts(session))
            print("Dry run only. No data was changed.")
            print("To apply, add: --apply --confirm-clear-all-context")
            return
        if not args.confirm_clear_all_context:
            raise SystemExit(
                "Refusing to run without --confirm-clear-all-context. "
                "Run without --apply first to inspect the scope."
            )

        counts = reset_all_context(
            session,
            include_active_booking_users=args.include_active_booking_users,
        )
        session.commit()
        _print_counts(counts)
        print("Done. Joy will treat the next inbound message from every user as a first conversation.")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    main()
