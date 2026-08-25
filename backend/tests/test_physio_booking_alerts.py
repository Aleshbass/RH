from datetime import datetime, timezone

import pytest

from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.triage_session import TriageSession
from app.models.types import BookingStatus, ConditionArea


@pytest.fixture
def confirmed_booking(db_session):
    patient = Patient(
        phone_e164="+2348000007001",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
    physio = Physiotherapist(
        phone_e164="+2348000007101",
        specialty_tags=["msk"],
        lat=6.5244,
        lng=3.3792,
        price_kobo=2_000_000,
        rating=4.5,
        verified=True,
        service_radius_km=10.0,
    )
    db_session.add_all([patient, physio])
    db_session.flush()
    db_session.add(
        TriageSession(
            patient_id=patient.id,
            extracted={
                "condition_area": "msk",
                "body_location": "knee",
                "goals": "walk without pain",
                "flags": {},
            },
            condition_area=ConditionArea.MSK,
            status="summarised",
        )
    )
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_physio_alert")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.flush()
    return booking


def test_alert_after_confirm_does_not_change_status(db_session, confirmed_booking):
    from app.physio.booking_alerts import notify_new_booking, apply_physio_reply
    notify_new_booking(db_session, confirmed_booking.id)
    apply_physio_reply(db_session, confirmed_booking.physio_id, "decline")
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status == "confirmed"
    assert confirmed_booking.physio_response == "declined"


def test_alert_body_includes_triage_summary(db_session, confirmed_booking):
    from app.physio.booking_alerts import notify_new_booking

    text = notify_new_booking(db_session, confirmed_booking.id)
    lower = text.lower()
    assert "Ada" in text
    assert "msk" in lower
    assert "cleared" in lower
    assert "walk without pain" in lower
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status == "confirmed"


def test_accept_keeps_confirmed(db_session, confirmed_booking):
    from app.physio.booking_alerts import apply_physio_reply

    apply_physio_reply(db_session, confirmed_booking.physio_id, "accept")
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status == "confirmed"
    assert confirmed_booking.physio_response == "accepted"


def test_decline_enqueues_admin_audit_without_refund(db_session, confirmed_booking):
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind
    from app.physio.booking_alerts import apply_physio_reply

    apply_physio_reply(db_session, confirmed_booking.physio_id, "decline")
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status == "confirmed"
    assert confirmed_booking.physio_response == "declined"
    admins = [
        row
        for row in db_session.query(AuditEvent).filter(AuditEvent.kind == AuditKind.ADMIN).all()
        if row.payload.get("booking_id") == str(confirmed_booking.id)
    ]
    assert admins
    assert not any(
        row.kind == AuditKind.PAYOUT for row in db_session.query(AuditEvent).all()
    )


def test_physio_reschedule_does_not_set_confirmed(db_session, confirmed_booking):
    from app.physio.booking_alerts import apply_physio_reply

    apply_physio_reply(
        db_session,
        confirmed_booking.physio_id,
        "reschedule 2026-09-01T10:00:00+00:00",
    )
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status == "confirmed"
    assert confirmed_booking.slot_start == datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)


def test_physio_cancel_does_not_set_confirmed(db_session, confirmed_booking):
    from app.physio.booking_alerts import apply_physio_reply

    apply_physio_reply(db_session, confirmed_booking.physio_id, "cancel")
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status != BookingStatus.CONFIRMED
    assert confirmed_booking.status == BookingStatus.CANCELLED


def test_handle_turn_physio_decline_keeps_confirmed(db_session, confirmed_booking, fake_llm):
    from app.conversation.turn_handler import handle_turn

    physio = db_session.get(Physiotherapist, confirmed_booking.physio_id)
    result = handle_turn(db_session, physio.phone_e164, "decline", fake_llm)
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status == "confirmed"
    assert confirmed_booking.physio_response == "declined"
    assert "confirmed" not in result.reply_text.lower() or "declined" in result.reply_text.lower()
    assert fake_llm.complete_prompts == []


def test_alert_and_reply_never_call_advance_to_confirmed():
    from pathlib import Path

    src = (
        Path(__file__).resolve().parents[1] / "app" / "physio" / "booking_alerts.py"
    ).read_text()
    assert "advance_to_confirmed" not in src
