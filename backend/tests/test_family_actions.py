import pytest

from app.family.access import add_family
from app.identity.resolver import resolve
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import Identity, PermissionTier, Persona

LAGOS_LAT = 6.5244
LAGOS_LNG = 3.3792


@pytest.fixture
def patient(db_session) -> Patient:
    row = Patient(
        phone_e164="+2348000004201",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
    )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def family_view(db_session, patient) -> Identity:
    member = add_family(
        db_session, patient.id, "+2348110000101", PermissionTier.VIEW_ONLY
    )
    identity = resolve(db_session, member.phone_e164)
    assert identity is not None
    return identity


@pytest.fixture
def family_full(db_session, monkeypatch) -> Identity:
    from app.conversation.state_manager import load, save_turn
    from app.models.conversation import Conversation
    from app.models.types import ExtractedTriage, PatientPhase

    monkeypatch.setattr(
        "app.booking.booking_flow.initialize_transaction",
        lambda email, amount_kobo, reference, callback_url: {
            "authorization_url": f"https://checkout.paystack.com/{reference}",
            "reference": reference,
        },
    )
    patient = Patient(
        phone_e164="+2348000004202",
        name="Chidi Okeke",
        age=41,
        location="Lagos",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
    )
    db_session.add(patient)
    db_session.flush()
    physio = Physiotherapist(
        phone_e164="+2348000008301",
        specialty_tags=["neuro"],
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
        price_kobo=20_000_00,
        rating=4.5,
        verified=True,
        service_radius_km=10.0,
    )
    db_session.add(physio)
    db_session.flush()
    member = add_family(
        db_session, patient.id, "+2348110000102", PermissionTier.FULL_ACCESS
    )
    patient_identity = Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=patient.phone_e164,
    )
    state = load(db_session, patient_identity)
    complete = ExtractedTriage(
        onset="2 weeks",
        severity=5,
        body_location="left arm",
        goals="use my hand again",
        condition_area="neuro",
    )
    save_turn(
        db_session,
        state,
        "stroke left arm",
        "Here's what I understood: left arm after a stroke.",
        complete,
        PatientPhase.POST_TRIAGE,
        "en",
    )
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.summary_text = "Here's what I understood: left arm after a stroke."
    conversation.booking_substate = "awaiting_slot_mode"
    conversation.booking_context = {
        "physio_ids": [str(physio.id)],
        "selected_index": 1,
    }
    db_session.flush()
    identity = resolve(db_session, member.phone_e164)
    assert identity is not None
    return identity


def test_full_access_can_initiate_payment_for_patient(db_session, family_full, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.identity.permissions import authorize
    assert authorize(family_full, "pay") is True
    result = handle_turn(db_session, family_full.phone_e164, "book the neuro physio teleconsult", fake_llm)
    assert "pay" in result.reply_text.lower() or "http" in result.reply_text.lower() or "processing" in result.reply_text.lower()


def test_enqueue_family_notice_failure_is_logged_not_raised(
    db_session, patient, family_view, fake_llm, caplog, monkeypatch
):
    import logging

    from app.conversation.turn_handler import handle_turn

    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_family_safety",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")),
    )
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    with caplog.at_level(logging.ERROR):
        result = handle_turn(db_session, patient.phone_e164, "chest pain", fake_llm)
    assert result.blocked_by_safety is True
    assert any(rec.exc_info for rec in caplog.records)
    assert "enqueue" in caplog.text.lower()


def test_safety_notifies_family(db_session, patient, family_view, fake_llm):
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    from app.conversation.turn_handler import handle_turn
    handle_turn(db_session, patient.phone_e164, "chest pain", fake_llm)
    from app.models.conversation import Message
    family_msgs = [m for m in db_session.query(Message).all() if m.conversation.person_id == family_view.person_id]
    assert any("chest" in (m.text or "").lower() or "doctor" in (m.text or "").lower() for m in family_msgs)


def test_view_only_sees_progress_not_paystack(db_session, patient, family_view, fake_llm):
    from app.conversation.state_manager import load, save_turn
    from app.conversation.turn_handler import handle_turn
    from app.identity.permissions import authorize
    from app.models.conversation import Conversation
    from app.models.types import ExtractedTriage, PatientPhase

    assert authorize(family_view, "pay") is False
    assert authorize(family_view, "view_progress") is True
    patient_identity = Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=patient.phone_e164,
    )
    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt",
        "Here's what I understood: knee pain.",
        ExtractedTriage(
            onset="3 days",
            severity=4,
            body_location="knee",
            goals="walk",
            condition_area="msk",
        ),
        PatientPhase.POST_TRIAGE,
        "en",
    )
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.summary_text = "Here's what I understood: knee pain."
    db_session.flush()

    result = handle_turn(
        db_session, family_view.phone_e164, "book the neuro physio teleconsult", fake_llm
    )
    lower = result.reply_text.lower()
    assert "later" not in lower
    assert "knee" in lower
    assert "checkout.paystack.com" not in lower
    assert "http" not in lower


def test_full_access_payment_is_for_linked_patient(db_session, family_full, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.booking import Booking
    from sqlalchemy import select

    result = handle_turn(
        db_session, family_full.phone_e164, "book the neuro physio teleconsult", fake_llm
    )
    assert "confirmed" not in result.reply_text.lower()
    booking = db_session.scalar(
        select(Booking).where(Booking.patient_id == family_full.linked_patient_id)
    )
    assert booking is not None
    assert booking.patient_id == family_full.linked_patient_id
    assert booking.patient_id != family_full.person_id
    assert booking.status.value != "confirmed"


def test_revoked_family_is_not_notified(db_session, patient, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.family.access import revoke
    from app.models.conversation import Message

    member = add_family(
        db_session, patient.id, "+2348110000103", PermissionTier.VIEW_ONLY
    )
    revoke(db_session, patient.id, member.phone_e164)
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    handle_turn(db_session, patient.phone_e164, "chest pain", fake_llm)
    family_msgs = [
        m
        for m in db_session.query(Message).all()
        if m.conversation.person_id == member.id
    ]
    assert family_msgs == []


def test_safety_family_copy_matches_patient_message(db_session, patient, family_view, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.models.conversation import Message
    from app.safety.escalation import patient_message

    fake_llm.extraction = {"flags": {"chest_pain": True}}
    result = handle_turn(db_session, patient.phone_e164, "chest pain", fake_llm)
    expected = patient_message(result.safety)
    family_msgs = [
        m
        for m in db_session.query(Message).all()
        if m.conversation.person_id == family_view.person_id and m.role == "joy"
    ]
    assert family_msgs
    assert family_msgs[-1].text == expected
    assert "+234" not in family_msgs[-1].text
    assert "sk_live" not in family_msgs[-1].text.lower()
    assert "sk_test" not in family_msgs[-1].text.lower()
    assert "paystack" not in family_msgs[-1].text.lower()
