from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.conversation.state_manager import load, save_turn
from app.identity.resolver import resolve
from app.models.audit_log import AuditEvent
from app.models.booking import Booking
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, BookingStatus, ExtractedTriage, PatientPhase
from tests.fakes import FakePaystack

LAGOS_LAT = 6.5244
LAGOS_LNG = 3.3792


def test_home_visit_city_area_parser_accepts_area_then_city() -> None:
    from app.booking.booking_flow import _parse_city_area

    assert _parse_city_area("Jabi, Abuja") == ("Abuja", "Jabi")
    assert _parse_city_area("city: Abuja, area: Jabi") == ("Abuja", "Jabi")
    assert _parse_city_area("Abuja") is None


def _physio(session, phone, tags, *, price_kobo=20_000_00, rating=4.5, verified=True):
    row = Physiotherapist(
        phone_e164=phone,
        specialty_tags=tags,
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
        price_kobo=price_kobo,
        rating=rating,
        verified=verified,
        service_radius_km=10.0,
    )
    session.add(row)
    session.flush()
    return row


def _ready_post_triage(db_session, patient, *, area="neuro"):
    identity = resolve(db_session, patient.phone_e164)
    state = load(db_session, identity)
    complete = ExtractedTriage(
        onset="2 weeks",
        severity=5,
        body_location="left arm",
        goals="use my hand again",
        condition_area=area,
    )
    save_turn(
        db_session,
        state,
        "stroke left arm",
        "Here's what I understood: left arm.",
        complete,
        PatientPhase.POST_TRIAGE,
        "en",
    )
    row = db_session.get(Conversation, state.conversation_id)
    row.summary_text = "Here's what I understood: left arm after a stroke."
    db_session.flush()
    return identity


@pytest.fixture
def neuro_patient_ready(db_session):
    patient = Patient(
        phone_e164="+2348000008001",
        name="Chidi Okeke",
        age=41,
        location="Lagos",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
    )
    db_session.add(patient)
    db_session.flush()
    physios = [
        _physio(db_session, "+2348000008101", ["neuro"], price_kobo=20_000_00, rating=4.2),
        _physio(db_session, "+2348000008102", ["neuro"], price_kobo=18_000_00, rating=4.8),
        _physio(db_session, "+2348000008103", ["msk"], price_kobo=8_000_00, rating=5.0),
    ]
    _ready_post_triage(db_session, patient, area="neuro")
    return SimpleNamespace(phone=patient.phone_e164, patient=patient, physios=physios)


@pytest.fixture
def neuro_patient_no_specialist(db_session):
    patient = Patient(
        phone_e164="+2348000008002",
        name="Bisi Ade",
        age=38,
        location="Lagos",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
    )
    db_session.add(patient)
    db_session.flush()
    msk_only = _physio(db_session, "+2348000008201", ["msk"], price_kobo=5_000_00, rating=5.0)
    _ready_post_triage(db_session, patient, area="neuro")
    return SimpleNamespace(phone=patient.phone_e164, patient=patient, msk_only=msk_only)


def test_post_triage_offers_specialty_matches_not_booking_confirmed(db_session, neuro_patient_ready, fake_llm):
    from app.conversation.turn_handler import handle_turn
    fake_llm.reply = "ok"
    result = handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    assert "confirmed" not in result.reply_text.lower()
    assert "processing" in result.reply_text.lower() or "pay" in result.reply_text.lower() or "₦" in result.reply_text or "naira" in result.reply_text.lower() or "physio" in result.reply_text.lower()

    events = db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.kind == AuditKind.MATCH,
            AuditEvent.person_id == neuro_patient_ready.patient.id,
        )
    ).all()
    assert events


def test_empty_eligible_says_no_specialist_never_nearest_msk(
    db_session, neuro_patient_no_specialist, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    result = handle_turn(
        db_session, neuro_patient_no_specialist.phone, "yes that's correct", fake_llm
    )
    lower = result.reply_text.lower()
    assert "no specialist yet" in lower
    assert neuro_patient_no_specialist.msk_only.phone_e164 not in result.reply_text
    assert "confirmed" not in lower
    events = db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.kind == AuditKind.MATCH,
            AuditEvent.person_id == neuro_patient_no_specialist.patient.id,
        )
    ).all()
    assert events == []


def test_patient_picks_index_and_mode_gets_paystack_url(db_session, neuro_patient_ready, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    offer = handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    assert "confirmed" not in offer.reply_text.lower()
    assert "Physio A" in offer.reply_text
    assert "₦" in offer.reply_text
    assert "+2348000008101" not in offer.reply_text
    assert "+2348000008102" not in offer.reply_text
    assert "+2348000008103" not in offer.reply_text

    paystack = FakePaystack()
    result = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=paystack,
    )
    lower = result.reply_text.lower()
    assert "confirmed" not in lower
    assert "checkout.paystack.com" in result.reply_text or "http" in result.reply_text
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == neuro_patient_ready.patient.id)
    )
    assert booking is not None
    assert booking.status == BookingStatus.AWAITING_PAYMENT
    assert booking.mode == "teleconsult"
    assert booking.status != BookingStatus.CONFIRMED


def test_paid_question_says_processing_never_confirmed(db_session, neuro_patient_ready, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=FakePaystack(),
    )
    result = handle_turn(db_session, neuro_patient_ready.phone, "have I paid?", fake_llm)
    lower = result.reply_text.lower()
    assert "processing" in lower
    assert "confirmed" not in lower


def test_patient_cancel_does_not_confirm(db_session, neuro_patient_ready, fake_llm):
    from app.booking.state import create_draft, mark_awaiting_payment
    from app.conversation.turn_handler import handle_turn

    physio = neuro_patient_ready.physios[0]
    booking = create_draft(
        db_session,
        neuro_patient_ready.patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=physio.price_kobo,
    )
    mark_awaiting_payment(booking, "ref_patient_cancel")
    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    result = handle_turn(db_session, neuro_patient_ready.phone, "cancel", fake_llm)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CANCELLED
    assert booking.status != BookingStatus.CONFIRMED
    assert "confirmed" not in result.reply_text.lower()


def test_cancel_from_awaiting_payment_next_turn_is_not_processing(
    db_session, neuro_patient_ready, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    pay = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=FakePaystack(),
    )
    assert "checkout.paystack.com" in pay.reply_text or "http" in pay.reply_text
    conversation = db_session.scalar(
        select(Conversation).where(Conversation.person_id == neuro_patient_ready.patient.id)
    )
    assert conversation.booking_substate == "awaiting_payment"
    assert (conversation.booking_context or {}).get("authorization_url")

    handle_turn(db_session, neuro_patient_ready.phone, "cancel", fake_llm)
    follow = handle_turn(db_session, neuro_patient_ready.phone, "thanks, what now?", fake_llm)
    lower = follow.reply_text.lower()
    assert "processing" not in lower
    assert "checkout.paystack.com" not in follow.reply_text
    assert "pay here" not in lower
    assert "confirmed" not in lower


def test_webhook_confirm_followup_does_not_say_processing(
    db_session, neuro_patient_ready, fake_llm
):
    from app.booking.state import advance_to_confirmed
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=FakePaystack(),
    )
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == neuro_patient_ready.patient.id)
    )
    conversation = db_session.scalar(
        select(Conversation).where(Conversation.person_id == neuro_patient_ready.patient.id)
    )
    assert booking.status == BookingStatus.AWAITING_PAYMENT
    assert conversation.booking_substate == "awaiting_payment"

    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.refresh(booking)
    db_session.refresh(conversation)
    assert booking.status == BookingStatus.CONFIRMED
    assert conversation.booking_substate == "awaiting_payment"

    result = handle_turn(db_session, neuro_patient_ready.phone, "have I paid?", fake_llm)
    lower = result.reply_text.lower()
    assert "processing" not in lower
    assert "confirmed" not in lower
    db_session.refresh(conversation)
    assert conversation.booking_substate != "awaiting_payment"


def test_patient_cancel_confirmed_booking_stays_cancelled_not_confirmed(
    db_session, neuro_patient_ready, fake_llm
):
    from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
    from app.conversation.turn_handler import handle_turn

    physio = neuro_patient_ready.physios[0]
    booking = create_draft(
        db_session,
        neuro_patient_ready.patient.id,
        physio.id,
        "home_visit",
        slot_start=None,
        amount_kobo=physio.price_kobo,
    )
    mark_awaiting_payment(booking, "ref_cancel_confirmed")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    result = handle_turn(db_session, neuro_patient_ready.phone, "please cancel", fake_llm)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CANCELLED
    assert "confirmed" not in result.reply_text.lower()


def test_reschedule_updates_slot_start_only_when_awaiting_or_confirmed(
    db_session, neuro_patient_ready, fake_llm
):
    from app.booking.state import create_draft, mark_awaiting_payment
    from app.conversation.turn_handler import handle_turn

    physio = neuro_patient_ready.physios[0]
    awaiting = create_draft(
        db_session,
        neuro_patient_ready.patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=physio.price_kobo,
    )
    mark_awaiting_payment(awaiting, "ref_reschedule")
    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "reschedule 2026-09-01T10:00:00+00:00",
        fake_llm,
    )
    db_session.refresh(awaiting)
    assert awaiting.slot_start == datetime(2026, 9, 1, 10, 0, tzinfo=timezone.utc)
    assert awaiting.status == BookingStatus.AWAITING_PAYMENT

    handle_turn(db_session, neuro_patient_ready.phone, "cancel", fake_llm)
    draft = create_draft(
        db_session,
        neuro_patient_ready.patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=physio.price_kobo,
    )
    handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "reschedule 2026-10-01T11:00:00+00:00",
        fake_llm,
    )
    db_session.refresh(draft)
    assert draft.slot_start is None
    assert draft.status == BookingStatus.DRAFT


def test_send_session_reminder_time_travel_no_op_send():
    from app.booking.booking_flow import (
        SESSION_REMINDER_ZSET,
        due_session_reminders,
        send_session_reminder,
    )
    from app.queue.tasks import _redis
    from uuid import uuid4

    booking_id = uuid4()
    client = _redis()
    client.delete(SESSION_REMINDER_ZSET)
    try:
        future = datetime.now(timezone.utc) + timedelta(hours=24)
        send_session_reminder(booking_id, run_at=future)
        assert due_session_reminders(now=datetime.now(timezone.utc)) == []
        due = due_session_reminders(now=future + timedelta(seconds=1))
        assert due == [str(booking_id)]
    finally:
        client.delete(SESSION_REMINDER_ZSET)


def test_payment_init_enqueues_session_reminder(db_session, neuro_patient_ready, fake_llm):
    from app.booking.booking_flow import SESSION_REMINDER_ZSET
    from app.conversation.turn_handler import handle_turn
    from app.queue.tasks import _redis

    client = _redis()
    client.delete(SESSION_REMINDER_ZSET)
    try:
        fake_llm.reply = "ok"
        fake_llm.extraction = {}
        handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
        handle_turn(
            db_session,
            neuro_patient_ready.phone,
            "1 teleconsult",
            fake_llm,
            paystack=FakePaystack(),
        )
        booking = db_session.scalar(
            select(Booking).where(Booking.patient_id == neuro_patient_ready.patient.id)
        )
        members = client.zrange(SESSION_REMINDER_ZSET, 0, -1)
        assert str(booking.id) in members
    finally:
        client.delete(SESSION_REMINDER_ZSET)


def test_booking_flow_and_turn_handler_do_not_call_advance_to_confirmed():
    from pathlib import Path

    root = Path(__file__).resolve().parents[1] / "app"
    allowed = {
        (root / "api" / "webhooks" / "paystack.py").resolve(),
        (root / "booking" / "state.py").resolve(),
    }
    offenders = [
        str(path.relative_to(root))
        for path in root.rglob("*.py")
        if path.resolve() not in allowed and "advance_to_confirmed" in path.read_text()
    ]
    assert offenders == []
    flow = (root / "booking" / "booking_flow.py").read_text()
    handler = (root / "conversation" / "turn_handler.py").read_text()
    assert "advance_to_confirmed" not in flow
    assert "advance_to_confirmed" not in handler
    assert "booking.status = BookingStatus.CANCELLED" not in flow
    assert "cancel(" in flow


def test_two_step_index_then_mode(db_session, neuro_patient_ready, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    mid = handle_turn(db_session, neuro_patient_ready.phone, "2", fake_llm)
    assert "teleconsult" in mid.reply_text.lower() or "home" in mid.reply_text.lower()
    result = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "home_visit",
        fake_llm,
        paystack=FakePaystack(),
    )
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == neuro_patient_ready.patient.id)
    )
    assert booking is not None
    assert booking.mode == "home_visit"
    assert booking.status == BookingStatus.AWAITING_PAYMENT
    assert "confirmed" not in result.reply_text.lower()


def test_awaiting_payment_non_payment_question_does_not_say_processing(
    db_session, neuro_patient_ready, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "A home visit is when the physio comes to you."
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=FakePaystack(),
    )
    result = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "what does a home visit include?",
        fake_llm,
    )
    lower = result.reply_text.lower()
    assert "processing" not in lower
    assert "pay here" not in lower
    assert "confirmed" not in lower
    assert "checkout.paystack.com" not in result.reply_text


def test_buried_digit_in_question_does_not_start_payment(
    db_session, neuro_patient_ready, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    result = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "how far is number 1 from me for home visits?",
        fake_llm,
        paystack=FakePaystack(),
    )
    lower = result.reply_text.lower()
    assert "pay here" not in lower
    assert "checkout.paystack.com" not in result.reply_text
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == neuro_patient_ready.patient.id)
    )
    assert booking is None
    assert "confirmed" not in lower


def test_one_active_booking_blocks_second_unpaid_then_allows_after_cancel(
    db_session, neuro_patient_ready, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    paystack = FakePaystack()
    first = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=paystack,
    )
    assert "checkout.paystack.com" in first.reply_text or "http" in first.reply_text
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    second = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=FakePaystack(),
    )
    bookings = db_session.scalars(
        select(Booking).where(Booking.patient_id == neuro_patient_ready.patient.id)
    ).all()
    unpaid = [
        row
        for row in bookings
        if row.status in {BookingStatus.AWAITING_PAYMENT, BookingStatus.PROCESSING, BookingStatus.DRAFT}
    ]
    assert len(unpaid) == 1
    assert "confirmed" not in second.reply_text.lower()

    handle_turn(db_session, neuro_patient_ready.phone, "cancel", fake_llm)
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    again = handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=FakePaystack(),
    )
    after = db_session.scalars(
        select(Booking).where(
            Booking.patient_id == neuro_patient_ready.patient.id,
            Booking.status == BookingStatus.AWAITING_PAYMENT,
        )
    ).all()
    assert len(after) == 1
    assert "confirmed" not in again.reply_text.lower()


def test_paystack_callback_comes_from_settings_not_railway(
    db_session, neuro_patient_ready, fake_llm, monkeypatch
):
    from app.config import get_settings
    from app.conversation.turn_handler import handle_turn
    from pathlib import Path

    settings = get_settings()
    settings.paystack_callback_url = "https://example.test/paystack/callback"
    monkeypatch.setattr("app.booking.booking_flow.get_settings", lambda: settings)
    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    paystack = FakePaystack()
    handle_turn(
        db_session,
        neuro_patient_ready.phone,
        "1 teleconsult",
        fake_llm,
        paystack=paystack,
    )
    assert paystack.last_callback_url == "https://example.test/paystack/callback"
    flow = (Path(__file__).resolve().parents[1] / "app" / "booking" / "booking_flow.py").read_text()
    assert "joy-ai-production.up.railway.app" not in flow


def test_patient_cancel_confirmed_booking_audits_booking_kind(
    db_session, neuro_patient_ready, fake_llm
):
    from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
    from app.conversation.turn_handler import handle_turn

    physio = neuro_patient_ready.physios[0]
    booking = create_draft(
        db_session,
        neuro_patient_ready.patient.id,
        physio.id,
        "home_visit",
        slot_start=None,
        amount_kobo=physio.price_kobo,
    )
    mark_awaiting_payment(booking, "ref_cancel_confirmed_audit")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    fake_llm.reply = "ok"
    fake_llm.extraction = {}
    handle_turn(db_session, neuro_patient_ready.phone, "please cancel", fake_llm)
    events = db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.kind == AuditKind.BOOKING,
            AuditEvent.person_id == neuro_patient_ready.patient.id,
        )
    ).all()
    assert any(row.payload.get("decision") == "cancelled" for row in events)
