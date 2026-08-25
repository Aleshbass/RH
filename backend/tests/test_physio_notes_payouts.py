from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import BookingStatus
from tests.fakes import FakeLLM, FakePaystack


def _seed(db_session, *, patient_phone, physio_phone, mode="home_visit"):
    patient = Patient(
        phone_e164=patient_phone,
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
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
    db_session.flush()
    return patient, physio, mode


@pytest.fixture
def physio(db_session):
    row = Physiotherapist(phone_e164="+2348000008001")
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def draft_booking(db_session):
    patient, physio, mode = _seed(
        db_session,
        patient_phone="+2348000008011",
        physio_phone="+2348000008111",
        mode="home_visit",
    )
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        mode,
        slot_start=None,
        amount_kobo=2_000_000,
    )
    db_session.flush()
    return booking


@pytest.fixture
def confirmed_home_visit(db_session):
    patient, physio, mode = _seed(
        db_session,
        patient_phone="+2348000008021",
        physio_phone="+2348000008121",
        mode="home_visit",
    )
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        mode,
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_notes_home")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.flush()
    return booking


@pytest.fixture
def confirmed_teleconsult(db_session):
    patient, physio, mode = _seed(
        db_session,
        patient_phone="+2348000008031",
        physio_phone="+2348000008131",
        mode="teleconsult",
    )
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=1_500_000,
    )
    mark_awaiting_payment(booking, "ref_notes_tele")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.flush()
    return booking


def test_payout_is_audited(db_session, physio):
    from app.physio.payouts import request_payout
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind
    request_payout(db_session, physio.id, 500000)
    kinds = [r.kind for r in db_session.query(AuditEvent).all()]
    assert AuditKind.PAYOUT in kinds or "payout" in {str(k) for k in kinds}


def test_complete_home_visit_requires_confirmed(db_session, draft_booking):
    from app.physio.home_visit_checkin import complete
    try:
        complete(db_session, draft_booking.id)
        assert False
    except ValueError:
        pass


def test_note_from_voice_structures_soap(db_session, confirmed_home_visit, fake_llm):
    from app.models.session_note import SessionNote
    from app.physio.session_notes import note_from_voice

    fake_llm.extraction = {
        "subjective": "knee pain for three days",
        "objective": "mild swelling",
        "plan": "ice and rest",
    }
    note = note_from_voice(
        db_session,
        confirmed_home_visit.id,
        "patient reports knee pain, swollen, ice and rest",
        fake_llm,
    )
    assert isinstance(note, SessionNote)
    assert note.subjective == "knee pain for three days"
    assert note.objective == "mild swelling"
    assert note.plan == "ice and rest"
    stored = db_session.get(SessionNote, note.id)
    assert stored is not None
    assert stored.booking_id == confirmed_home_visit.id


def test_note_from_voice_reuses_voice_transcript(db_session, confirmed_home_visit, fake_llm):
    from app.conversation.voice import ingest_voice
    from app.physio.session_notes import note_from_voice

    fake_llm.voice_transcript = "Patient says the knee is swollen. Plan ice."
    fake_llm.extraction = {
        "subjective": "knee swollen",
        "objective": "effusion",
        "plan": "ice",
    }
    transcript = ingest_voice(fake_llm, b"fake", "audio/ogg")
    note = note_from_voice(db_session, confirmed_home_visit.id, transcript, fake_llm)
    assert "swollen" in transcript.lower()
    assert note.subjective == "knee swollen"
    assert note.plan == "ice"


def test_checkin_is_timestamped(db_session, confirmed_home_visit):
    from app.physio.home_visit_checkin import checkin

    before = datetime.now(timezone.utc)
    booking = checkin(db_session, confirmed_home_visit.id, 6.5244, 3.3792)
    after = datetime.now(timezone.utc)
    db_session.refresh(confirmed_home_visit)
    assert confirmed_home_visit.status == BookingStatus.CONFIRMED
    assert booking.checkin_lat == pytest.approx(6.5244)
    assert booking.checkin_lng == pytest.approx(3.3792)
    assert booking.checkin_at is not None
    stamp = booking.checkin_at
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    assert before - timedelta(seconds=2) <= stamp <= after + timedelta(seconds=2)


def test_complete_confirmed_home_visit_marks_completed(db_session, confirmed_home_visit):
    from app.physio.home_visit_checkin import complete

    before = datetime.now(timezone.utc)
    complete(db_session, confirmed_home_visit.id)
    db_session.refresh(confirmed_home_visit)
    assert confirmed_home_visit.status == BookingStatus.COMPLETED
    assert confirmed_home_visit.completed_at is not None
    stamp = confirmed_home_visit.completed_at
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    assert stamp >= before - timedelta(seconds=2)


def test_complete_confirmed_teleconsult_marks_completed(db_session, confirmed_teleconsult):
    from app.physio.home_visit_checkin import complete

    complete(db_session, confirmed_teleconsult.id)
    db_session.refresh(confirmed_teleconsult)
    assert confirmed_teleconsult.status == BookingStatus.COMPLETED


def test_complete_does_not_mark_payment_confirmed(db_session, confirmed_home_visit):
    from pathlib import Path as _Path

    from app.physio.home_visit_checkin import complete

    complete(db_session, confirmed_home_visit.id)
    db_session.refresh(confirmed_home_visit)
    assert confirmed_home_visit.status != BookingStatus.CONFIRMED
    src = (_Path(__file__).resolve().parents[1] / "app" / "physio" / "home_visit_checkin.py").read_text()
    assert "advance_to_confirmed" not in src


def test_request_payout_status_requested(db_session, physio):
    from app.models.payout import Payout
    from app.physio.payouts import request_payout

    payout = request_payout(db_session, physio.id, 500000, paystack=FakePaystack())
    assert payout.status == "requested"
    assert payout.amount_kobo == 500000
    assert payout.physio_id == physio.id
    stored = db_session.get(Payout, payout.id)
    assert stored is not None
    assert stored.status == "requested"


def test_request_payout_calls_fake_transfer(db_session, physio):
    from app.physio.payouts import request_payout

    paystack = FakePaystack()
    payout = request_payout(db_session, physio.id, 500000, paystack=paystack)
    assert paystack.last_transfer is not None
    assert paystack.last_transfer["amount_kobo"] == 500000
    assert payout.transfer_code
    assert payout.status == "requested"


def test_mark_payout_sent_from_fake_transfer(db_session, physio):
    from app.physio.payouts import mark_payout_sent, request_payout

    payout = request_payout(db_session, physio.id, 500000, paystack=FakePaystack())
    sent = mark_payout_sent(db_session, transfer_code=payout.transfer_code)
    db_session.refresh(payout)
    assert sent.status == "sent"
    assert payout.status == "sent"
    assert payout.sent_at is not None


def test_earnings_statement_includes_period_totals(db_session, confirmed_home_visit):
    from app.physio.home_visit_checkin import complete
    from app.physio.payouts import earnings_statement, request_payout

    complete(db_session, confirmed_home_visit.id)
    physio_id = confirmed_home_visit.physio_id
    request_payout(db_session, physio_id, 500000, paystack=FakePaystack())
    now = datetime.now(timezone.utc)
    text = earnings_statement(db_session, physio_id, (now - timedelta(days=7), now + timedelta(days=1)))
    assert isinstance(text, str)
    assert "500000" in text or "5,000" in text or "₦" in text
    assert "1" in text


def test_handle_turn_physio_session_note(db_session, confirmed_home_visit, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.session_note import SessionNote

    physio = db_session.get(Physiotherapist, confirmed_home_visit.physio_id)
    fake_llm.extraction = {
        "subjective": "pain on stairs",
        "objective": "antalgic gait",
        "plan": "quad sets",
    }
    result = handle_turn(
        db_session,
        physio.phone_e164,
        "session note: pain on stairs, antalgic gait, quad sets",
        fake_llm,
    )
    notes = db_session.query(SessionNote).filter_by(booking_id=confirmed_home_visit.id).all()
    assert notes
    assert notes[0].subjective == "pain on stairs"
    lower = result.reply_text.lower()
    assert "note" in lower or "subjective" in lower or "saved" in lower
    db_session.refresh(confirmed_home_visit)
    assert confirmed_home_visit.status == BookingStatus.CONFIRMED


def test_handle_turn_physio_checkin_and_done(db_session, confirmed_home_visit, fake_llm):
    from app.conversation.turn_handler import handle_turn

    physio = db_session.get(Physiotherapist, confirmed_home_visit.physio_id)
    checkin_result = handle_turn(
        db_session, physio.phone_e164, "check in 6.5244 3.3792", fake_llm
    )
    db_session.refresh(confirmed_home_visit)
    assert confirmed_home_visit.status == BookingStatus.CONFIRMED
    assert confirmed_home_visit.checkin_lat == pytest.approx(6.5244)
    assert "check" in checkin_result.reply_text.lower() or "here" in checkin_result.reply_text.lower()
    done = handle_turn(db_session, physio.phone_e164, "done", fake_llm)
    db_session.refresh(confirmed_home_visit)
    assert confirmed_home_visit.status == BookingStatus.COMPLETED
    assert "complete" in done.reply_text.lower() or "done" in done.reply_text.lower()
    assert "payment is confirmed" not in done.reply_text.lower()
    assert "successfully paid" not in done.reply_text.lower()


class _FailingPaystack:
    def initiate_transfer(self, amount_kobo, recipient, reference, reason=""):
        raise RuntimeError("Paystack transfer failed")


def test_handle_turn_physio_payout(db_session, physio, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.payout import Payout

    result = handle_turn(db_session, physio.phone_e164, "payout 500000 kobo", fake_llm)
    rows = db_session.query(Payout).filter_by(physio_id=physio.id).all()
    assert rows
    assert rows[0].status == "requested"
    assert rows[0].amount_kobo == 500000
    assert "requested" in result.reply_text.lower() or "payout" in result.reply_text.lower()


def test_request_payout_persists_when_transfer_fails(db_session, physio):
    from app.models.audit_log import AuditEvent
    from app.models.payout import Payout
    from app.models.types import AuditKind
    from app.physio.payouts import request_payout

    payout = request_payout(
        db_session, physio.id, 500000, paystack=_FailingPaystack()
    )
    assert payout.status == "requested"
    assert payout.amount_kobo == 500000
    stored = db_session.get(Payout, payout.id)
    assert stored is not None
    assert stored.status == "requested"
    kinds = [r.kind for r in db_session.query(AuditEvent).all()]
    assert AuditKind.PAYOUT in kinds or "payout" in {str(k) for k in kinds}


def test_handle_turn_payout_persists_when_transfer_fails(
    db_session, physio, fake_llm, monkeypatch
):
    from app.conversation.turn_handler import handle_turn
    from app.models.audit_log import AuditEvent
    from app.models.payout import Payout
    from app.models.types import AuditKind

    def _boom(*args, **kwargs):
        raise RuntimeError("Paystack transfer failed")

    monkeypatch.setattr("app.physio.payouts.initiate_transfer", _boom)
    result = handle_turn(
        db_session,
        physio.phone_e164,
        "payout 500000 kobo",
        fake_llm,
        paystack=_FailingPaystack(),
    )
    rows = db_session.query(Payout).filter_by(physio_id=physio.id).all()
    assert rows
    assert rows[0].status == "requested"
    kinds = [r.kind for r in db_session.query(AuditEvent).all()]
    assert AuditKind.PAYOUT in kinds or "payout" in {str(k) for k in kinds}
    lower = result.reply_text.lower()
    assert "requested" in lower or "payout" in lower
    assert "payment is confirmed" not in lower
    assert "successfully paid" not in lower


def test_session_note_with_rates_still_files(db_session, confirmed_home_visit, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.session_note import SessionNote

    physio = db_session.get(Physiotherapist, confirmed_home_visit.physio_id)
    fake_llm.extraction = {
        "subjective": "elevated heart rates after stairs",
        "objective": "tachycardia on exertion",
        "plan": "paced walking",
    }
    result = handle_turn(
        db_session,
        physio.phone_e164,
        "session note: elevated heart rates after stairs",
        fake_llm,
    )
    notes = db_session.query(SessionNote).filter_by(booking_id=confirmed_home_visit.id).all()
    assert notes
    assert notes[0].subjective == "elevated heart rates after stairs"
    lower = result.reply_text.lower()
    assert "dashboard" not in lower
    assert "note" in lower or "subjective" in lower or "saved" in lower


def test_payout_uses_kobo_amount_not_session_count(db_session, physio, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.payout import Payout

    result = handle_turn(
        db_session, physio.phone_e164, "payout for 2 sessions 500000 kobo", fake_llm
    )
    rows = db_session.query(Payout).filter_by(physio_id=physio.id).all()
    assert rows
    assert rows[0].amount_kobo == 500000
    assert rows[0].amount_kobo != 200
    assert "requested" in result.reply_text.lower() or "payout" in result.reply_text.lower()


def test_handle_turn_dashboard_for_bio_photo_pricing(db_session, physio, fake_llm):
    from app.conversation.turn_handler import handle_turn

    for text in ("update my bio", "change my profile photo", "edit my pricing"):
        result = handle_turn(db_session, physio.phone_e164, text, fake_llm)
        lower = result.reply_text.lower()
        assert "dashboard" in lower
        assert "whatsapp" in lower or "not here" in lower


def test_handle_turn_physio_persona_does_not_confirm_payment(
    db_session, confirmed_home_visit, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    physio = db_session.get(Physiotherapist, confirmed_home_visit.physio_id)
    handle_turn(db_session, physio.phone_e164, "done", fake_llm)
    src = (
        Path(__file__).resolve().parents[1] / "app" / "physio" / "home_visit_checkin.py"
    ).read_text()
    assert "advance_to_confirmed" not in src
    db_session.refresh(confirmed_home_visit)
    assert confirmed_home_visit.status == BookingStatus.COMPLETED


def test_complete_frees_patient_for_new_draft(db_session, confirmed_home_visit):
    from app.physio.home_visit_checkin import complete

    complete(db_session, confirmed_home_visit.id)
    second = create_draft(
        db_session,
        confirmed_home_visit.patient_id,
        confirmed_home_visit.physio_id,
        "teleconsult",
        slot_start=None,
        amount_kobo=1_000_000,
    )
    assert second.status == BookingStatus.DRAFT
    assert second.id != confirmed_home_visit.id


def test_transfer_success_marks_payout_sent(db_session, physio, client):
    import hashlib
    import hmac
    import json

    from app.config import get_settings
    from app.models.payout import Payout
    from app.physio.payouts import request_payout

    secret = "test-paystack-secret"
    get_settings().paystack_webhook_secret = secret
    payout = request_payout(db_session, physio.id, 500000, paystack=FakePaystack())
    payload = {
        "event": "transfer.success",
        "data": {
            "id": 88001,
            "transfer_code": payout.transfer_code,
            "reference": "payout_ref",
            "amount": 500000,
            "status": "success",
        },
    }
    body = json.dumps(payload).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    response = client.post(
        "/webhooks/paystack",
        content=body,
        headers={"x-paystack-signature": sig},
    )
    assert response.status_code == 200
    db_session.refresh(payout)
    assert payout.status == "sent"
    assert db_session.get(Payout, payout.id).status == "sent"
    assert payout.sent_at is not None
