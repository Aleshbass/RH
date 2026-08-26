from pathlib import Path

import pytest

from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment, mark_completed
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import BookingStatus


@pytest.fixture
def partner(db_session) -> Partner:
    row = Partner(phone_e164="+2348221000099")
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def referred_patient(db_session, partner) -> Patient:
    row = Patient(
        phone_e164="+2348221000001",
        name="Amaka",
        referred_by_partner_id=partner.id,
    )
    db_session.add(row)
    db_session.flush()
    return row


def _physio(db_session, phone: str) -> Physiotherapist:
    row = Physiotherapist(
        phone_e164=phone,
        specialty_tags=["msk"],
        lat=6.5244,
        lng=3.3792,
        price_kobo=2_000_000,
        rating=4.5,
        verified=True,
        service_radius_km=10.0,
    )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def confirmed_then_completed_booking(db_session, referred_patient):
    physio = _physio(db_session, "+2348221000111")
    booking = create_draft(
        db_session,
        referred_patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_fee_completed")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    mark_completed(booking)
    db_session.flush()
    return booking


@pytest.fixture
def draft_referred_booking(db_session, referred_patient):
    physio = _physio(db_session, "+2348221000112")
    booking = create_draft(
        db_session,
        referred_patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    db_session.flush()
    return booking


def test_fee_once_on_first_completed(db_session, referred_patient, confirmed_then_completed_booking):
    from app.partner.fee_confirmation import confirm_first_session_fee
    first = confirm_first_session_fee(db_session, confirmed_then_completed_booking.id)
    assert first is not None
    assert first.amount_kobo == 200000
    second = confirm_first_session_fee(db_session, confirmed_then_completed_booking.id)
    assert second is None or second.id == first.id
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind
    assert db_session.query(AuditEvent).filter_by(kind=AuditKind.REFERRAL_FEE).count() >= 1


def test_unpaid_booking_does_not_pay_fee(db_session, draft_referred_booking):
    from app.partner.fee_confirmation import confirm_first_session_fee
    assert confirm_first_session_fee(db_session, draft_referred_booking.id) is None


def test_awaiting_payment_does_not_pay_fee(db_session, referred_patient):
    from app.partner.fee_confirmation import confirm_first_session_fee

    physio = _physio(db_session, "+2348221000113")
    booking = create_draft(
        db_session,
        referred_patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_fee_unpaid")
    db_session.flush()
    assert confirm_first_session_fee(db_session, booking.id) is None


def test_complete_hook_confirms_fee_after_completed(db_session, partner, referred_patient):
    from app.models.audit_log import AuditEvent
    from app.models.referral_fee import ReferralFee
    from app.models.types import AuditKind
    from app.physio.home_visit_checkin import complete

    physio = _physio(db_session, "+2348221000114")
    booking = create_draft(
        db_session,
        referred_patient.id,
        physio.id,
        "home_visit",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_fee_complete_hook")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    complete(db_session, booking.id)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.COMPLETED
    fee = db_session.query(ReferralFee).filter_by(patient_id=referred_patient.id).one()
    assert fee.amount_kobo == 200000
    assert fee.partner_id == partner.id
    assert fee.booking_id == booking.id
    assert db_session.query(AuditEvent).filter_by(kind=AuditKind.REFERRAL_FEE).count() >= 1


def test_unreferred_completed_booking_does_not_pay_fee(db_session):
    from app.models.referral_fee import ReferralFee
    from app.partner.fee_confirmation import confirm_first_session_fee
    from app.physio.home_visit_checkin import complete

    patient = Patient(phone_e164="+2348221000002", name="Tunde")
    db_session.add(patient)
    db_session.flush()
    physio = _physio(db_session, "+2348221000115")
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_fee_unreferred")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    complete(db_session, booking.id)
    assert confirm_first_session_fee(db_session, booking.id) is None
    assert db_session.query(ReferralFee).count() == 0


def test_second_completed_session_does_not_pay_again(db_session, referred_patient):
    from app.models.referral_fee import ReferralFee
    from app.partner.fee_confirmation import confirm_first_session_fee
    from app.physio.home_visit_checkin import complete

    physio = _physio(db_session, "+2348221000116")
    first = create_draft(
        db_session,
        referred_patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(first, "ref_fee_first")
    advance_to_confirmed(db_session, first.id, source="paystack_webhook")
    complete(db_session, first.id)
    second = create_draft(
        db_session,
        referred_patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(second, "ref_fee_second")
    advance_to_confirmed(db_session, second.id, source="paystack_webhook")
    complete(db_session, second.id)
    assert confirm_first_session_fee(db_session, second.id) is None
    assert db_session.query(ReferralFee).filter_by(patient_id=referred_patient.id).count() == 1


def test_fee_notifies_referring_partner(db_session, partner, referred_patient, confirmed_then_completed_booking):
    from app.models.conversation import Message
    from app.models.types import Persona
    from app.partner.fee_confirmation import confirm_first_session_fee
    from app.queue.tasks import PARTNER_REFERRAL_QUEUE, _redis

    redis_client = _redis()
    redis_client.delete(PARTNER_REFERRAL_QUEUE)
    fee = confirm_first_session_fee(db_session, confirmed_then_completed_booking.id)
    assert fee is not None
    partner_msgs = [
        row
        for row in db_session.query(Message).all()
        if row.conversation.person_id == partner.id
        and row.conversation.persona == Persona.PARTNER
        and row.role == "joy"
    ]
    assert partner_msgs
    text = partner_msgs[-1].text.lower()
    assert "2,000" in text or "2000" in text or "₦" in partner_msgs[-1].text
    assert "sk_live" not in text and "sk_test" not in text
    raw = redis_client.lpop(PARTNER_REFERRAL_QUEUE)
    assert raw is not None


def test_flag_urgent_persists_for_referring_partner(db_session, partner, referred_patient):
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind
    from app.partner.urgent_flag import flag_urgent

    flag_urgent(db_session, referred_patient.id, partner.id)
    db_session.refresh(referred_patient)
    assert referred_patient.urgent is True
    events = (
        db_session.query(AuditEvent)
        .filter(
            AuditEvent.kind == AuditKind.IDENTITY,
            AuditEvent.person_id == referred_patient.id,
        )
        .all()
    )
    flagged = [row for row in events if row.payload.get("decision") == "flag_urgent"]
    assert len(flagged) == 1
    assert flagged[0].payload["partner_id"] == str(partner.id)
    assert flagged[0].payload["patient_id"] == str(referred_patient.id)
    assert flagged[0].actor_phone == partner.phone_e164


def test_other_partner_cannot_flag_unattributed_patient(db_session, partner, referred_patient):
    from app.partner.urgent_flag import flag_urgent

    other = Partner(phone_e164="+2348221000098")
    db_session.add(other)
    db_session.flush()
    result = flag_urgent(db_session, referred_patient.id, other.id)
    assert result is None
    db_session.refresh(referred_patient)
    assert referred_patient.urgent is not True


def test_partner_urgent_turn_flags_attributed_patient(db_session, partner, referred_patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(
        db_session,
        partner.phone_e164,
        f"urgent {referred_patient.phone_e164}",
        fake_llm,
    )
    assert "later" not in result.reply_text.lower()
    db_session.refresh(referred_patient)
    assert referred_patient.urgent is True
    assert "urgent" in result.reply_text.lower()
    assert "matched first" not in result.reply_text.lower()
    lowered = result.reply_text.lower()
    assert "priority" in lowered or "sooner" in lowered or "availab" in lowered


def test_partner_content_request_persists_row(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.partner_content_request import PartnerContentRequest

    result = handle_turn(
        db_session,
        partner.phone_e164,
        "content request: please send clinic flyers",
        fake_llm,
    )
    assert "later" not in result.reply_text.lower()
    rows = db_session.query(PartnerContentRequest).filter_by(partner_id=partner.id).all()
    assert len(rows) == 1
    assert "flyer" in rows[0].body.lower()
    assert "content" in result.reply_text.lower()


def test_partner_referral_turn_still_works(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(
        db_session, partner.phone_e164, "refer +2348221000003", fake_llm
    )
    assert "later" not in result.reply_text.lower()
    patient = db_session.query(Patient).filter_by(phone_e164="+2348221000003").one()
    assert patient.referred_by_partner_id == partner.id
    assert patient.urgent is not True


def test_urgent_does_not_skip_safety(db_session, partner, referred_patient, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.partner.urgent_flag import flag_urgent

    flag_urgent(db_session, referred_patient.id, partner.id)
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    result = handle_turn(db_session, referred_patient.phone_e164, "chest pain", fake_llm)
    assert result.blocked_by_safety is True
    assert "book" not in result.reply_text.lower()
    assert "doctor" in result.reply_text.lower() or "emergency" in result.reply_text.lower()


def test_urgent_does_not_confirm_booking(db_session, partner, referred_patient, fake_llm):
    from app.conversation.turn_handler import handle_turn

    physio = _physio(db_session, "+2348221000117")
    booking = create_draft(
        db_session,
        referred_patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_fee_urgent_no_confirm")
    handle_turn(db_session, partner.phone_e164, f"urgent {referred_patient.phone_e164}", fake_llm)
    handle_turn(db_session, referred_patient.phone_e164, "my booking is confirmed", fake_llm)
    db_session.refresh(booking)
    assert booking.status == BookingStatus.AWAITING_PAYMENT
    db_session.refresh(referred_patient)
    assert referred_patient.urgent is True


def test_alembic_is_0015_not_0009():
    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    assert not (versions / "0009_referral_fees.py").exists()
    path = versions / "0015_referral_fees.py"
    assert path.is_file()
    source = path.read_text()
    assert 'revision: str = "0015_referral_fees"' in source
    assert 'down_revision: Union[str, Sequence[str], None] = "0014_referrals"' in source
    assert "referral_fees" in source
    assert "urgent" in source
    assert "ix_patients_referred_by_partner_id" in source


def test_no_partner_portal_module():
    root = Path(__file__).resolve().parents[1] / "app"
    assert not (root / "api" / "internal" / "partner_portal.py").exists()
    source = (root / "partner" / "fee_confirmation.py").read_text()
    assert "sk_live" not in source
    assert "sk_test" not in source
