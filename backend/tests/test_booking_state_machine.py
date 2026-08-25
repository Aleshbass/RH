import pytest

from app.booking.state import (
    advance_to_confirmed,
    cancel,
    create_draft,
    mark_awaiting_payment,
    mark_processing,
)
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import BookingStatus


@pytest.fixture
def patient(db_session):
    row = Patient(
        phone_e164="+2348000005001",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def physio(db_session):
    row = Physiotherapist(
        phone_e164="+2348000005101",
        specialty_tags=["msk"],
        lat=6.5244,
        lng=3.3792,
        price_kobo=20_000_00,
        rating=4.5,
        verified=True,
        service_radius_km=10.0,
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_conversation_cannot_confirm(db_session, patient, physio):
    booking = create_draft(db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000)
    mark_awaiting_payment(booking, "ref_1")
    try:
        advance_to_confirmed(db_session, booking.id, source="conversation")
        assert False
    except RuntimeError:
        db_session.refresh(booking)
        assert booking.status == BookingStatus.AWAITING_PAYMENT


def test_webhook_source_confirms(db_session, patient, physio):
    booking = create_draft(db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000)
    mark_awaiting_payment(booking, "ref_2")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED


def test_create_draft_status_is_draft(db_session, patient, physio):
    booking = create_draft(
        db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000
    )
    db_session.refresh(booking)
    assert booking.status == BookingStatus.DRAFT
    assert booking.mode == "teleconsult"
    assert booking.amount_kobo == 2000000
    assert booking.paystack_reference is None


def test_processing_then_webhook_confirms(db_session, patient, physio):
    booking = create_draft(
        db_session, patient.id, physio.id, "home_visit", slot_start=None, amount_kobo=2000000
    )
    mark_awaiting_payment(booking, "ref_processing")
    mark_processing(booking)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.PROCESSING
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED


def test_cancel_from_awaiting_payment(db_session, patient, physio):
    booking = create_draft(
        db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000
    )
    mark_awaiting_payment(booking, "ref_cancel")
    cancel(booking)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CANCELLED


def test_webhook_cannot_confirm_draft(db_session, patient, physio):
    booking = create_draft(
        db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000
    )
    try:
        advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
        assert False
    except RuntimeError:
        db_session.refresh(booking)
        assert booking.status == BookingStatus.DRAFT


def test_cancel_from_confirmed(db_session, patient, physio):
    booking = create_draft(
        db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000
    )
    mark_awaiting_payment(booking, "ref_cancel_confirmed_state")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    cancel(booking)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CANCELLED


def test_create_draft_blocked_when_awaiting_payment(db_session, patient, physio):
    first = create_draft(
        db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000
    )
    mark_awaiting_payment(first, "ref_active_guard")
    with pytest.raises(RuntimeError, match="active booking"):
        create_draft(
            db_session, patient.id, physio.id, "home_visit", slot_start=None, amount_kobo=2000000
        )
    db_session.refresh(first)
    assert first.status == BookingStatus.AWAITING_PAYMENT


def test_create_draft_blocked_when_confirmed(db_session, patient, physio):
    first = create_draft(
        db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000
    )
    mark_awaiting_payment(first, "ref_confirmed_guard")
    advance_to_confirmed(db_session, first.id, source="paystack_webhook")
    with pytest.raises(RuntimeError, match="active booking"):
        create_draft(
            db_session, patient.id, physio.id, "home_visit", slot_start=None, amount_kobo=2000000
        )


def test_create_draft_allowed_after_cancel(db_session, patient, physio):
    first = create_draft(
        db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000
    )
    mark_awaiting_payment(first, "ref_after_cancel")
    cancel(first)
    second = create_draft(
        db_session, patient.id, physio.id, "home_visit", slot_start=None, amount_kobo=1500000
    )
    db_session.refresh(second)
    assert second.status == BookingStatus.DRAFT
    assert second.id != first.id
