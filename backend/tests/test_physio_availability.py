from datetime import timedelta

import pytest

from app.models.physiotherapist import Physiotherapist


@pytest.fixture
def physio(db_session):
    row = Physiotherapist(phone_e164="+2348000005301")
    db_session.add(row)
    db_session.flush()
    return row


from app.physio.availability import parse_availability, write_slots

def test_parse_weekdays_hours():
    windows = parse_availability("free Mon-Fri 9-5")
    assert len(windows) == 5
    assert windows[0].start_hhmm == "09:00"
    assert windows[0].end_hhmm == "17:00"


def test_write_slots_not_called_until_confirm(db_session, physio):
    from app.models.availability_slot import AvailabilitySlot

    windows = parse_availability("free Mon-Fri 9-5")
    # parser must not write
    assert (
        db_session.query(AvailabilitySlot).filter_by(physio_id=physio.id).count() == 0
    )
    write_slots(db_session, physio.id, windows)
    assert db_session.query(AvailabilitySlot).filter_by(physio_id=physio.id).count() == 5


def test_write_slots_replaces_weekly_template(db_session, physio):
    from app.models.availability_slot import AvailabilitySlot

    write_slots(db_session, physio.id, parse_availability("free Mon-Fri 9-5"))
    write_slots(db_session, physio.id, parse_availability("free Mon 9-5"))
    rows = db_session.query(AvailabilitySlot).filter_by(physio_id=physio.id).all()
    assert len(rows) == 1
    assert rows[0].weekday == 0
    assert rows[0].start_hhmm == "09:00"
    assert rows[0].end_hhmm == "17:00"


def test_handle_turn_recaps_without_writing(db_session, physio):
    from app.conversation.turn_handler import handle_turn
    from app.models.availability_slot import AvailabilitySlot
    from tests.test_turn_handler import _CountingLLM

    llm = _CountingLLM(reply="should not be used")
    result = handle_turn(db_session, physio.phone_e164, "free Mon-Fri 9-5", llm)
    assert llm.complete_calls == 0
    lower = result.reply_text.lower()
    assert "monday" in lower and "friday" in lower
    assert "09:00" in result.reply_text and "17:00" in result.reply_text
    assert "yes" in lower
    assert db_session.query(AvailabilitySlot).filter_by(physio_id=physio.id).count() == 0


def test_handle_turn_writes_slots_only_on_yes(db_session, physio, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.availability_slot import AvailabilitySlot

    handle_turn(db_session, physio.phone_e164, "free Mon-Fri 9-5", fake_llm)
    assert db_session.query(AvailabilitySlot).filter_by(physio_id=physio.id).count() == 0
    result = handle_turn(db_session, physio.phone_e164, "yes", fake_llm)
    assert db_session.query(AvailabilitySlot).filter_by(physio_id=physio.id).count() == 5
    lower = result.reply_text.lower()
    assert "monday" in lower and "friday" in lower
    assert "09:00" in result.reply_text and "17:00" in result.reply_text


def test_availability_turn_does_not_run_patient_triage(db_session, physio):
    from app.conversation.turn_handler import handle_turn
    from app.models.triage_session import TriageSession
    from sqlalchemy import select
    from tests.test_turn_handler import _CountingLLM

    llm = _CountingLLM(reply="should not be used")
    result = handle_turn(db_session, physio.phone_e164, "free Mon-Fri 9-5", llm)
    assert llm.complete_calls == 0
    assert result.extracted is None or not result.extracted.body_location
    assert (
        db_session.scalars(
            select(TriageSession).where(TriageSession.patient_id == physio.id)
        ).all()
        == []
    )


def test_rank_next_slot_reads_written_windows(db_session, physio):
    from app.matching.ranking import rank
    from app.models.patient import Patient
    from app.models.types import ConditionArea
    from app.physio.availability import parse_availability, write_slots

    physio.specialty_tags = ["neuro"]
    physio.verified = True
    physio.lat = 6.5244
    physio.lng = 3.3792
    physio.price_kobo = 20_000_00
    physio.rating = 4.5
    patient = Patient(
        phone_e164="+2348000005311",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
        lat=6.5244,
        lng=3.3792,
    )
    db_session.add(patient)
    db_session.flush()

    write_slots(db_session, physio.id, parse_availability("free Mon-Fri 9-5"))
    out = rank(patient, [physio], ConditionArea.NEURO)
    assert len(out) == 1
    slot = out[0].next_slot
    assert slot is not None
    assert slot.tzinfo is not None
    assert slot.weekday() <= 4
    assert 9 <= slot.hour < 17


def test_rank_next_slot_skips_confirmed_booking(db_session, physio):
    from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
    from app.matching.ranking import rank
    from app.models.patient import Patient
    from app.models.types import ConditionArea
    from app.physio.availability import parse_availability, write_slots

    physio.specialty_tags = ["neuro"]
    physio.verified = True
    physio.lat = 6.5244
    physio.lng = 3.3792
    physio.price_kobo = 20_000_00
    physio.rating = 4.5
    patient = Patient(
        phone_e164="+2348000005312",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
        lat=6.5244,
        lng=3.3792,
    )
    db_session.add(patient)
    db_session.flush()

    write_slots(db_session, physio.id, parse_availability("free Mon-Fri 9-5"))
    first = rank(patient, [physio], ConditionArea.NEURO)[0].next_slot
    assert first is not None

    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=first,
        amount_kobo=2000000,
    )
    mark_awaiting_payment(booking, "ref_avail_1")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")

    later = rank(patient, [physio], ConditionArea.NEURO)[0].next_slot
    assert later is not None
    assert later > first
    assert later - first >= timedelta(hours=1)
