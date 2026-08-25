from datetime import datetime, timezone

import pytest

from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.triage_session import TriageSession
from app.models.types import BookingStatus, ConditionArea


def _seed_patient_physio(db_session, *, patient_phone, physio_phone, physio=None):
    patient = Patient(
        phone_e164=patient_phone,
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
    if physio is None:
        physio = Physiotherapist(
            phone_e164=physio_phone,
            specialty_tags=["msk"],
            lat=6.5244,
            lng=3.3792,
            price_kobo=2_000_000,
            rating=4.5,
            verified=True,
            service_radius_km=10.0,
        )
        db_session.add_all([patient, physio])
    else:
        db_session.add(patient)
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
    return patient, physio


@pytest.fixture
def confirmed_booking(db_session):
    patient, physio = _seed_patient_physio(
        db_session,
        patient_phone="+2348000007001",
        physio_phone="+2348000007101",
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


@pytest.fixture
def awaiting_payment_booking(db_session):
    patient, physio = _seed_patient_physio(
        db_session,
        patient_phone="+2348000007002",
        physio_phone="+2348000007102",
    )
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_physio_unpaid")
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


@pytest.mark.parametrize("reply", ["accept", "decline"])
def test_accept_decline_on_awaiting_payment_does_not_set_physio_response(
    db_session, awaiting_payment_booking, reply
):
    from app.physio.booking_alerts import apply_physio_reply

    result = apply_physio_reply(db_session, awaiting_payment_booking.physio_id, reply)
    db_session.refresh(awaiting_payment_booking)
    assert result is None
    assert awaiting_payment_booking.physio_response is None
    assert awaiting_payment_booking.status == BookingStatus.AWAITING_PAYMENT


def test_accept_targets_confirmed_not_newer_awaiting_payment(db_session, confirmed_booking):
    from app.physio.booking_alerts import apply_physio_reply

    physio = db_session.get(Physiotherapist, confirmed_booking.physio_id)
    patient, _ = _seed_patient_physio(
        db_session,
        patient_phone="+2348000007003",
        physio_phone="+2348000007103",
        physio=physio,
    )
    unpaid = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(unpaid, "ref_physio_newer_unpaid")
    db_session.flush()
    confirmed_booking.created_at = datetime(2026, 8, 1, tzinfo=timezone.utc)
    unpaid.created_at = datetime(2026, 8, 25, tzinfo=timezone.utc)
    db_session.flush()

    apply_physio_reply(db_session, physio.id, "accept")
    db_session.refresh(confirmed_booking)
    db_session.refresh(unpaid)
    assert confirmed_booking.status == BookingStatus.CONFIRMED
    assert confirmed_booking.physio_response == "accepted"
    assert unpaid.status == BookingStatus.AWAITING_PAYMENT
    assert unpaid.physio_response is None


def test_accept_without_confirmed_booking_reaches_onboarding(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.physio.booking_alerts import apply_physio_reply

    physio = Physiotherapist(phone_e164="+2348000007201")
    db_session.add(physio)
    db_session.flush()

    assert apply_physio_reply(db_session, physio.id, "accept") is None

    result = handle_turn(db_session, physio.phone_e164, "accept", fake_llm)
    db_session.refresh(physio)
    lower = result.reply_text.lower()
    assert "paid booking waiting" not in lower
    assert physio.onboarding_status == "collecting"
    assert "mrtb" in lower or "specialty" in lower or "credential" in lower
    assert fake_llm.complete_prompts == []
