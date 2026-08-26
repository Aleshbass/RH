import hashlib
import hmac
import json
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.models.partner import Partner
from app.models.patient import Patient
from app.models.triage_session import TriageSession


@pytest.fixture
def partner(db_session) -> Partner:
    row = Partner(phone_e164="+2348220000099")
    db_session.add(row)
    db_session.flush()
    return row


def test_direct_refer_sets_attribution(db_session, partner):
    from app.partner.referral import direct_refer
    patient = direct_refer(db_session, partner.id, "+2348220000001")
    assert patient.referred_by_partner_id == partner.id


def test_ensure_code_is_unique(db_session, partner):
    from app.partner.referral import ensure_code

    other = Partner(phone_e164="+2348220000098")
    db_session.add(other)
    db_session.flush()
    first = ensure_code(partner)
    second = ensure_code(other)
    assert first
    assert second
    assert first != second
    assert ensure_code(partner) == first
    codes = db_session.scalars(select(Partner.referral_code)).all()
    assigned = [code for code in codes if code]
    assert len(assigned) == len(set(assigned))


def test_attribute_sets_referred_by_from_code(db_session, partner):
    from app.partner.referral import attribute, ensure_code

    code = ensure_code(partner)
    patient = Patient(phone_e164="+2348220000002")
    db_session.add(patient)
    db_session.flush()
    attribute(db_session, patient.id, code.lower())
    db_session.refresh(patient)
    assert patient.referred_by_partner_id == partner.id


def test_attribute_is_first_write_wins(db_session, partner):
    from app.partner.referral import attribute, ensure_code

    other = Partner(phone_e164="+2348220000097")
    db_session.add(other)
    db_session.flush()
    first = ensure_code(partner)
    second = ensure_code(other)
    patient = Patient(phone_e164="+2348220000003")
    db_session.add(patient)
    db_session.flush()
    attribute(db_session, patient.id, first)
    attribute(db_session, patient.id, second)
    db_session.refresh(patient)
    assert patient.referred_by_partner_id == partner.id


def test_direct_refer_is_idempotent_and_opens_triage(db_session, partner):
    from app.partner.referral import direct_refer

    first = direct_refer(db_session, partner.id, "08220000004")
    second = direct_refer(db_session, partner.id, "+2348220000004")
    assert first.id == second.id
    assert first.phone_e164 == "+2348220000004"
    open_sessions = db_session.scalars(
        select(TriageSession).where(
            TriageSession.patient_id == first.id,
            TriageSession.status == "open",
        )
    ).all()
    assert len(open_sessions) == 1


def test_patient_inbound_code_attributes(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.partner.referral import ensure_code

    code = ensure_code(partner)
    phone = "+2348220000101"
    fake_llm.extraction = {"body_location": "knee"}
    result = handle_turn(db_session, phone, f"my knee hurts {code}", fake_llm)
    assert "later" not in result.reply_text.lower()
    patient = db_session.scalar(select(Patient).where(Patient.phone_e164 == phone))
    assert patient is not None
    assert patient.referred_by_partner_id == partner.id


def test_unknown_sender_code_provisions_and_attributes(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.partner.referral import ensure_code

    code = ensure_code(partner)
    phone = "+2348220000102"
    result = handle_turn(db_session, phone, code, fake_llm)
    assert "later" not in result.reply_text.lower()
    patient = db_session.scalar(select(Patient).where(Patient.phone_e164 == phone))
    assert patient is not None
    assert patient.referred_by_partner_id == partner.id


def test_partner_steal_attempt_does_not_promise_booking(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.partner.referral import direct_refer

    other = Partner(phone_e164="+2348220000088")
    db_session.add(other)
    db_session.flush()
    patient = direct_refer(db_session, other.id, "+2348220000501")
    result = handle_turn(
        db_session, partner.phone_e164, "refer +2348220000501", fake_llm
    )
    db_session.refresh(patient)
    assert patient.referred_by_partner_id == other.id
    lowered = result.reply_text.lower()
    assert "already" in lowered
    assert "attribut" in lowered
    assert "confirm" not in lowered
    assert "book" not in lowered
    assert "fee" not in lowered
    assert "₦" not in result.reply_text


def test_partner_same_partner_retry_keeps_success_copy(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn

    first = handle_turn(
        db_session, partner.phone_e164, "refer +2348220000502", fake_llm
    )
    second = handle_turn(
        db_session, partner.phone_e164, "refer +2348220000502", fake_llm
    )
    patient = db_session.scalar(
        select(Patient).where(Patient.phone_e164 == "+2348220000502")
    )
    assert patient is not None
    assert patient.referred_by_partner_id == partner.id
    for result in (first, second):
        lowered = result.reply_text.lower()
        assert "confirm" in lowered or "book" in lowered
        assert "already" not in lowered


def test_partner_attributes_unattributed_existing_keeps_success_copy(
    db_session, partner, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    existing = Patient(phone_e164="+2348220000503")
    db_session.add(existing)
    db_session.flush()
    result = handle_turn(
        db_session, partner.phone_e164, "refer +2348220000503", fake_llm
    )
    db_session.refresh(existing)
    assert existing.referred_by_partner_id == partner.id
    lowered = result.reply_text.lower()
    assert "confirm" in lowered or "book" in lowered
    assert "already" not in lowered


def test_partner_urgent_steal_says_not_yours(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.partner.referral import _PARTNER_URGENT_NOT_YOURS, direct_refer

    other = Partner(phone_e164="+2348220000087")
    db_session.add(other)
    db_session.flush()
    patient = direct_refer(db_session, other.id, "+2348220000504")
    result = handle_turn(
        db_session, partner.phone_e164, "urgent +2348220000504", fake_llm
    )
    db_session.refresh(patient)
    assert patient.referred_by_partner_id == other.id
    assert patient.urgent is not True
    assert result.reply_text == _PARTNER_URGENT_NOT_YOURS
    lowered = result.reply_text.lower()
    assert "confirm" not in lowered
    assert "book" not in lowered
    assert "priorit" not in lowered


def test_partner_inbound_phone_direct_refers(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.identity.permissions import authorize
    from app.identity.resolver import resolve

    identity = resolve(db_session, partner.phone_e164)
    assert identity is not None
    assert authorize(identity, "partner_refer") is True
    result = handle_turn(
        db_session, partner.phone_e164, "refer +2348220000103", fake_llm
    )
    assert "later" not in result.reply_text.lower()
    patient = db_session.scalar(
        select(Patient).where(Patient.phone_e164 == "+2348220000103")
    )
    assert patient is not None
    assert patient.referred_by_partner_id == partner.id
    assert (
        db_session.scalar(
            select(func.count()).select_from(TriageSession).where(
                TriageSession.patient_id == patient.id
            )
        )
        >= 1
    )


def test_partner_inbound_code_with_phone_attributes(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.partner.referral import ensure_code

    other = Partner(phone_e164="+2348220000096")
    db_session.add(other)
    db_session.flush()
    code = ensure_code(other)
    handle_turn(
        db_session,
        partner.phone_e164,
        f"refer +2348220000104 code {code}",
        fake_llm,
    )
    patient = db_session.scalar(
        select(Patient).where(Patient.phone_e164 == "+2348220000104")
    )
    assert patient is not None
    assert patient.referred_by_partner_id == other.id


def test_referral_code_does_not_skip_safety(db_session, partner, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.partner.referral import ensure_code

    code = ensure_code(partner)
    patient = Patient(phone_e164="+2348220000201")
    db_session.add(patient)
    db_session.flush()
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    result = handle_turn(
        db_session, patient.phone_e164, f"chest pain {code}", fake_llm
    )
    assert result.blocked_by_safety is True
    assert "book" not in result.reply_text.lower()
    assert "doctor" in result.reply_text.lower() or "emergency" in result.reply_text.lower()
    db_session.refresh(patient)
    assert patient.referred_by_partner_id == partner.id


def test_charge_success_notifies_referring_partner(db_session, client, partner):
    from app.booking.state import create_draft, mark_awaiting_payment
    from app.config import get_settings
    from app.models.conversation import Message
    from app.models.physiotherapist import Physiotherapist
    from app.models.types import BookingStatus, Persona
    from app.queue.tasks import PARTNER_REFERRAL_QUEUE, _redis

    secret = "test-paystack-secret"
    get_settings().paystack_webhook_secret = secret
    patient = Patient(
        phone_e164="+2348220000301",
        name="Chidi",
        referred_by_partner_id=partner.id,
    )
    physio = Physiotherapist(
        phone_e164="+2348220000311",
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
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_partner_confirm")
    db_session.flush()

    redis_client = _redis()
    redis_client.delete(PARTNER_REFERRAL_QUEUE)
    payload = {
        "event": "charge.success",
        "data": {
            "id": 410014,
            "reference": booking.paystack_reference,
            "amount": booking.amount_kobo,
            "status": "success",
        },
    }
    body = json.dumps(payload).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    response = client.post(
        "/webhooks/paystack", content=body, headers={"x-paystack-signature": sig}
    )
    assert response.status_code == 200
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED
    partner_msgs = [
        row
        for row in db_session.query(Message).all()
        if row.conversation.person_id == partner.id
        and row.conversation.persona == Persona.PARTNER
        and row.role == "joy"
    ]
    assert partner_msgs
    text = partner_msgs[-1].text.lower()
    assert "confirm" in text or "book" in text
    assert "sk_live" not in text and "sk_test" not in text
    raw = redis_client.lpop(PARTNER_REFERRAL_QUEUE)
    assert raw is not None
    job = json.loads(raw)
    assert job["phone"] == partner.phone_e164
    assert "confirm" in str(job.get("text") or "").lower() or "book" in str(
        job.get("text") or ""
    ).lower()


def test_unreferred_confirm_does_not_notify_partner(db_session, client, partner):
    from app.booking.state import create_draft, mark_awaiting_payment
    from app.config import get_settings
    from app.models.conversation import Message
    from app.models.physiotherapist import Physiotherapist
    from app.queue.tasks import PARTNER_REFERRAL_QUEUE, _redis

    secret = "test-paystack-secret"
    get_settings().paystack_webhook_secret = secret
    patient = Patient(phone_e164="+2348220000302", name="Ada")
    physio = Physiotherapist(
        phone_e164="+2348220000312",
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
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_unreferred")
    db_session.flush()
    redis_client = _redis()
    redis_client.delete(PARTNER_REFERRAL_QUEUE)
    payload = {
        "event": "charge.success",
        "data": {
            "id": 410015,
            "reference": booking.paystack_reference,
            "amount": booking.amount_kobo,
            "status": "success",
        },
    }
    body = json.dumps(payload).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha512).hexdigest()
    assert (
        client.post(
            "/webhooks/paystack", content=body, headers={"x-paystack-signature": sig}
        ).status_code
        == 200
    )
    partner_joy = [
        row
        for row in db_session.query(Message).all()
        if row.conversation.person_id == partner.id and row.role == "joy"
    ]
    assert partner_joy == []
    assert redis_client.llen(PARTNER_REFERRAL_QUEUE) == 0


def test_conversation_does_not_confirm_referred_booking(db_session, partner, fake_llm):
    from app.booking.state import create_draft, mark_awaiting_payment
    from app.conversation.turn_handler import handle_turn
    from app.models.physiotherapist import Physiotherapist
    from app.models.types import BookingStatus
    from app.partner.referral import direct_refer

    patient = direct_refer(db_session, partner.id, "+2348220000401")
    physio = Physiotherapist(
        phone_e164="+2348220000411",
        specialty_tags=["msk"],
        lat=6.5244,
        lng=3.3792,
        price_kobo=2_000_000,
        rating=4.5,
        verified=True,
        service_radius_km=10.0,
    )
    db_session.add(physio)
    db_session.flush()
    booking = create_draft(
        db_session,
        patient.id,
        physio.id,
        "teleconsult",
        slot_start=None,
        amount_kobo=2_000_000,
    )
    mark_awaiting_payment(booking, "ref_chat_no_confirm")
    db_session.flush()
    handle_turn(db_session, partner.phone_e164, "payment successful?", fake_llm)
    handle_turn(db_session, patient.phone_e164, "my booking is confirmed", fake_llm)
    db_session.refresh(booking)
    assert booking.status != BookingStatus.CONFIRMED
    assert booking.status == BookingStatus.AWAITING_PAYMENT


def test_alembic_is_0014_not_0008():
    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    assert not (versions / "0008_referrals.py").exists()
    path = versions / "0014_referrals.py"
    assert path.is_file()
    source = path.read_text()
    assert 'revision: str = "0014_referrals"' in source
    assert 'down_revision: Union[str, Sequence[str], None] = "0013_audit_kind_family"' in source
    assert "referral_code" in source
    assert "referred_by_partner_id" in source


def test_no_partner_portal_or_task2_modules():
    root = Path(__file__).resolve().parents[1] / "app"
    assert not (root / "api" / "internal" / "partner_portal.py").exists()
    source = (root / "partner" / "referral.py").read_text()
    assert "sk_live" not in source
    assert "sk_test" not in source
    assert (root / "partner" / "urgent_flag.py").is_file()
    assert (root / "partner" / "fee_confirmation.py").is_file()
