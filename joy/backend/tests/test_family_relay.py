import pytest
from sqlalchemy import select

from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
from app.family.access import add_family
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.models.booking import Booking
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.triage_session import TriageSession
from app.models.types import BookingStatus, ConditionArea, PermissionTier

LAGOS_LAT = 6.5244
LAGOS_LNG = 3.3792


@pytest.fixture
def patient(db_session) -> Patient:
    row = Patient(
        phone_e164="+2348000004301",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
    )
    db_session.add(row)
    db_session.flush()
    db_session.add(
        TriageSession(
            patient_id=row.id,
            extracted={
                "condition_area": "msk",
                "body_location": "knee",
                "onset": "3 days",
                "goals": "walk without pain",
                "flags": {},
            },
            condition_area=ConditionArea.MSK,
            status="summarised",
        )
    )
    db_session.flush()
    return row


@pytest.fixture
def physio(db_session) -> Physiotherapist:
    row = Physiotherapist(
        phone_e164="+2348000008302",
        specialty_tags=["msk"],
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
        price_kobo=2_000_000,
        rating=4.5,
        verified=True,
        service_radius_km=10.0,
    )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def family_view(db_session, patient, physio):
    member = add_family(
        db_session, patient.id, "+2348110000201", PermissionTier.VIEW_ONLY
    )
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_family_relay")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.flush()
    return member


def test_enqueue_physio_failure_is_logged_not_raised(
    db_session, family_view, caplog, monkeypatch
):
    import logging

    from app.family.relay import ask_physio

    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_physio_relay",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")),
    )
    with caplog.at_level(logging.ERROR):
        thread = ask_physio(db_session, family_view.id, "how is recovery going?")
    assert thread.family_visible_text
    assert any(rec.exc_info for rec in caplog.records)
    assert "enqueue" in caplog.text.lower()


def test_enqueue_family_failure_is_logged_not_raised(
    db_session, family_view, caplog, monkeypatch
):
    import logging

    from app.family.relay import apply_physio_answer, ask_physio

    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_physio_relay",
        lambda *args, **kwargs: None,
    )
    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_family_relay",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")),
    )
    thread = ask_physio(db_session, family_view.id, "how is recovery going?")
    with caplog.at_level(logging.ERROR):
        answer = apply_physio_answer(
            db_session, thread.id, "doing well, continue the walks"
        )
    assert answer.physio_visible_text
    assert any(rec.exc_info for rec in caplog.records)
    assert "enqueue" in caplog.text.lower()


def test_handle_turn_survives_relay_enqueue_failure(
    db_session, family_view, physio, fake_llm, monkeypatch
):
    from app.conversation.turn_handler import handle_turn

    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_physio_relay",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")),
    )
    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_family_relay",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")),
    )
    asked = handle_turn(
        db_session,
        family_view.phone_e164,
        "ask the physio how recovery is going",
        fake_llm,
    )
    assert asked.reply_text.strip()
    answered = handle_turn(
        db_session, physio.phone_e164, "doing well, continue the walks", fake_llm
    )
    assert answered.reply_text.strip()


def test_relay_hides_physio_number(db_session, family_view, physio, patient):
    from app.family.relay import ask_physio, apply_physio_answer
    thread = ask_physio(db_session, family_view.id, "how is recovery going?")
    outbound = thread.last_physio_payload
    assert physio.phone_e164 not in outbound
    answer = apply_physio_answer(db_session, thread.id, "doing well, continue the walks")
    assert family_view.phone_e164 not in (answer.physio_visible_text or "")
    assert physio.phone_e164 not in (answer.family_visible_text or "")


def test_relay_includes_first_name_and_triage_not_phones(
    db_session, family_view, physio, patient
):
    from app.family.relay import ask_physio

    thread = ask_physio(db_session, family_view.id, "how is recovery going?")
    outbound = thread.last_physio_payload
    assert "Ada" in outbound
    assert "knee" in outbound.lower()
    assert "walk without pain" in outbound.lower()
    assert family_view.phone_e164 not in outbound
    assert patient.phone_e164 not in outbound
    assert physio.phone_e164 not in outbound
    assert "sk_live" not in outbound.lower()
    assert "sk_test" not in outbound.lower()
    assert "paystack" not in outbound.lower()


def test_relay_without_confirmed_booking_does_not_invent_number(db_session, physio):
    from app.family.relay import ask_physio

    patient = Patient(
        phone_e164="+2348000004302",
        name="Chidi Okeke",
        age=41,
        location="Lagos",
    )
    db_session.add(patient)
    db_session.flush()
    member = add_family(
        db_session, patient.id, "+2348110000202", PermissionTier.VIEW_ONLY
    )
    thread = ask_physio(db_session, member.id, "how is recovery going?")
    outbound = thread.last_physio_payload or ""
    family_text = thread.family_visible_text or ""
    combined = f"{outbound}\n{family_text}".lower()
    assert "assigned" in combined
    assert physio.phone_e164 not in outbound
    assert physio.phone_e164 not in family_text
    assert member.phone_e164 not in outbound
    assert "+234" not in outbound
    assert "+234" not in family_text


def test_awaiting_payment_is_not_assigned_physio(db_session, patient, physio):
    from app.family.relay import ask_physio

    member = add_family(
        db_session, patient.id, "+2348110000203", PermissionTier.FULL_ACCESS
    )
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_family_relay_unpaid")
    db_session.flush()
    thread = ask_physio(db_session, member.id, "ask the physio about the knee")
    family_text = (thread.family_visible_text or "").lower()
    assert "assigned" in family_text
    assert physio.phone_e164 not in (thread.last_physio_payload or "")
    db_session.refresh(booking)
    assert booking.status != BookingStatus.CONFIRMED


def test_relay_is_audited_without_opposite_phones(
    db_session, family_view, physio, patient
):
    from app.family.relay import ask_physio, apply_physio_answer
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind

    thread = ask_physio(db_session, family_view.id, "how is recovery going?")
    apply_physio_answer(db_session, thread.id, "doing well, continue the walks")
    events = db_session.scalars(
        select(AuditEvent).where(AuditEvent.kind == AuditKind.RELAY)
    ).all()
    assert events
    for event in events:
        blob = str(event.payload)
        assert physio.phone_e164 not in blob
        assert family_view.phone_e164 not in blob
        assert "sk_live" not in blob.lower()
        assert "sk_test" not in blob.lower()


def test_view_only_may_ask_but_cannot_book(
    db_session, family_view, physio, patient, fake_llm
):
    from app.conversation.turn_handler import handle_turn
    from app.family.relay import ask_physio

    identity = resolve(db_session, family_view.phone_e164)
    assert identity is not None
    assert authorize(identity, "view_progress") is True
    assert authorize(identity, "pay") is False
    assert authorize(identity, "book") is False
    thread = ask_physio(db_session, family_view.id, "ask the physio how recovery is going")
    assert "Ada" in thread.last_physio_payload
    result = handle_turn(
        db_session,
        family_view.phone_e164,
        "book the neuro physio teleconsult",
        fake_llm,
    )
    lower = result.reply_text.lower()
    assert "checkout.paystack.com" not in lower
    assert "sk_live" not in lower
    assert "confirmed" not in lower
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == patient.id)
    )
    assert booking is not None
    assert booking.status == BookingStatus.CONFIRMED


def test_family_whatsapp_relays_without_exposing_numbers(
    db_session, family_view, physio, patient, fake_llm
):
    from app.conversation.turn_handler import handle_turn
    from app.models.conversation import Message

    result = handle_turn(
        db_session,
        family_view.phone_e164,
        "ask the physio how recovery is going",
        fake_llm,
    )
    lower = result.reply_text.lower()
    assert physio.phone_e164 not in result.reply_text
    assert family_view.phone_e164 not in result.reply_text
    assert "sk_live" not in lower
    assert "paystack" not in lower
    physio_msgs = [
        m
        for m in db_session.query(Message).all()
        if m.conversation.person_id == physio.id and m.role == "joy"
    ]
    assert physio_msgs
    outbound = physio_msgs[-1].text
    assert "Ada" in outbound
    assert physio.phone_e164 not in outbound
    assert family_view.phone_e164 not in outbound


def test_physio_whatsapp_answer_reaches_family_without_phones(
    db_session, family_view, physio, patient, fake_llm
):
    from app.conversation.turn_handler import handle_turn
    from app.models.conversation import Message

    handle_turn(
        db_session,
        family_view.phone_e164,
        "ask the physio how recovery is going",
        fake_llm,
    )
    result = handle_turn(
        db_session, physio.phone_e164, "doing well, continue the walks", fake_llm
    )
    assert family_view.phone_e164 not in result.reply_text
    family_msgs = [
        m
        for m in db_session.query(Message).all()
        if m.conversation.person_id == family_view.id and m.role == "joy"
    ]
    assert family_msgs
    latest = family_msgs[-1].text
    assert "doing well, continue the walks" in latest
    assert physio.phone_e164 not in latest
    assert family_view.phone_e164 not in latest
    assert "sk_live" not in latest.lower()
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == patient.id)
    )
    assert booking.status == BookingStatus.CONFIRMED


def test_open_relay_does_not_swallow_physio_payout(
    db_session, family_view, physio, patient, fake_llm
):
    from app.conversation.turn_handler import handle_turn
    from app.models.conversation import Message
    from app.models.payout import Payout

    handle_turn(
        db_session,
        family_view.phone_e164,
        "ask the physio how recovery is going",
        fake_llm,
    )
    result = handle_turn(
        db_session, physio.phone_e164, "payout 500000 kobo", fake_llm
    )
    rows = db_session.query(Payout).filter_by(physio_id=physio.id).all()
    assert rows
    assert rows[0].amount_kobo == 500000
    assert rows[0].status == "requested"
    assert "requested" in result.reply_text.lower() or "payout" in result.reply_text.lower()
    assert "the physiotherapist said" not in result.reply_text.lower()
    family_joy = [
        m
        for m in db_session.query(Message).all()
        if m.conversation.person_id == family_view.id and m.role == "joy"
    ]
    assert family_joy
    assert "payout 500000 kobo" not in family_joy[-1].text.lower()
    assert "the physiotherapist said" not in family_joy[-1].text.lower()
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == patient.id)
    )
    assert booking.status == BookingStatus.CONFIRMED


def test_revoked_family_does_not_receive_physio_answer(
    db_session, family_view, physio, patient, fake_llm, monkeypatch
):
    from app.conversation.turn_handler import handle_turn
    from app.family.access import revoke
    from app.models.conversation import Message

    family_outbound: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_family_relay",
        lambda phone, text: family_outbound.append((phone, text)),
    )
    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_physio_relay",
        lambda phone, text: None,
    )

    handle_turn(
        db_session,
        family_view.phone_e164,
        "ask the physio how recovery is going",
        fake_llm,
    )
    revoke(db_session, patient.id, family_view.phone_e164)
    family_outbound.clear()

    result = handle_turn(
        db_session, physio.phone_e164, "doing well, continue the walks", fake_llm
    )
    assert result.reply_text.strip()
    assert family_outbound == []
    family_joy = [
        m
        for m in db_session.query(Message).all()
        if m.conversation.person_id == family_view.id and m.role == "joy"
    ]
    assert not any(
        "doing well, continue the walks" in (m.text or "") for m in family_joy
    )
    assert not any("the physiotherapist said" in (m.text or "").lower() for m in family_joy)


def test_apply_physio_answer_skips_revoked_family_whatsapp(
    db_session, family_view, physio, monkeypatch
):
    from app.family.access import revoke
    from app.family.relay import apply_physio_answer, ask_physio
    from app.models.conversation import Message

    family_outbound: list[tuple[str, str]] = []
    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_family_relay",
        lambda phone, text: family_outbound.append((phone, text)),
    )
    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_physio_relay",
        lambda phone, text: None,
    )

    thread = ask_physio(db_session, family_view.id, "how is recovery going?")
    revoke(db_session, family_view.patient_id, family_view.phone_e164)
    family_outbound.clear()
    apply_physio_answer(db_session, thread.id, "doing well, continue the walks")
    assert family_outbound == []
    family_joy = [
        m
        for m in db_session.query(Message).all()
        if m.conversation.person_id == family_view.id and m.role == "joy"
    ]
    assert not any(
        "doing well, continue the walks" in (m.text or "") for m in family_joy
    )


def test_physio_free_text_answers_first_pending_thread(
    db_session, family_view, physio, patient, fake_llm
):
    from app.conversation.turn_handler import handle_turn
    from app.models.relay import RelayThread

    handle_turn(
        db_session,
        family_view.phone_e164,
        "ask the physio how recovery is going",
        fake_llm,
    )
    handle_turn(
        db_session,
        family_view.phone_e164,
        "ask the physio about the stairs",
        fake_llm,
    )
    result = handle_turn(
        db_session, physio.phone_e164, "doing well, continue the walks", fake_llm
    )
    assert family_view.phone_e164 not in result.reply_text
    threads = db_session.scalars(
        select(RelayThread).where(RelayThread.physio_id == physio.id)
    ).all()
    assert len(threads) == 2
    first = next(t for t in threads if "recovery" in t.question)
    second = next(t for t in threads if "stairs" in t.question)
    assert first.answer == "doing well, continue the walks"
    assert first.answered_at is not None
    assert second.answer is None
    assert second.answered_at is None
    assert "doing well, continue the walks" in (first.family_visible_text or "")
    assert "doing well, continue the walks" not in (second.family_visible_text or "")
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == patient.id)
    )
    assert booking.status == BookingStatus.CONFIRMED
