from pathlib import Path

import pytest
from sqlalchemy import select

from app.conversation.state_manager import load, save_turn
from app.models.admin import Admin
from app.models.audit_log import AuditEvent
from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, ExtractedTriage, Identity, PatientPhase, Persona
from tests.fakes import FakeLLM


@pytest.fixture
def admin_row(db_session) -> Admin:
    row = Admin(phone_e164="+2348000006103")
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def admin_identity(db_session, admin_row) -> Identity:
    return Identity(
        persona=Persona.ADMIN,
        person_id=admin_row.id,
        phone_e164=admin_row.phone_e164,
    )


@pytest.fixture
def patient_conversation(db_session) -> Conversation:
    patient = Patient(phone_e164="+2348000006101", name="Ada Okonkwo")
    db_session.add(patient)
    db_session.flush()
    identity = Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=patient.phone_e164,
    )
    state = load(db_session, identity)
    return db_session.get(Conversation, state.conversation_id)


@pytest.fixture
def submitted_physio(db_session) -> Physiotherapist:
    row = Physiotherapist(
        phone_e164="+2348000006102",
        mrtb_number="12345",
        specialty_tags=["msk"],
        credential_urls=["https://files/cred.jpg"],
        onboarding_status="submitted",
        verified=False,
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_takeover_is_visible(db_session, patient_conversation):
    from app.admin.escalation_router import set_takeover
    text = set_takeover(db_session, patient_conversation.id, True)
    assert "human" in text.lower() or "person" in text.lower() or "team" in text.lower()
    db_session.refresh(patient_conversation)
    assert patient_conversation.human_takeover is True


def test_quick_approve_physio(db_session, submitted_physio, admin_identity):
    from app.admin.verification_queue import quick_reply_verify
    quick_reply_verify(db_session, submitted_physio.id, "approve")
    db_session.refresh(submitted_physio)
    assert submitted_physio.onboarding_status == "verified"


def test_takeover_records_notice_and_joy_message(db_session, patient_conversation):
    from app.admin.escalation_router import set_takeover

    text = set_takeover(db_session, patient_conversation.id, True)
    db_session.refresh(patient_conversation)
    assert patient_conversation.takeover_notified_at is not None
    assert patient_conversation.takeover_notified_at.tzinfo is not None
    joy = [
        row
        for row in db_session.scalars(
            select(Message).where(Message.conversation_id == patient_conversation.id)
        ).all()
        if row.role == "joy"
    ]
    assert joy
    assert joy[-1].text == text


def test_takeover_off_clears_flag(db_session, patient_conversation):
    from app.admin.escalation_router import set_takeover

    set_takeover(db_session, patient_conversation.id, True)
    cleared = set_takeover(db_session, patient_conversation.id, False)
    db_session.refresh(patient_conversation)
    assert patient_conversation.human_takeover is False
    assert isinstance(cleared, str)


def test_quick_reject_physio(db_session, submitted_physio, admin_identity):
    from app.admin.verification_queue import quick_reply_verify

    quick_reply_verify(db_session, submitted_physio.id, "reject")
    db_session.refresh(submitted_physio)
    assert submitted_physio.onboarding_status == "rejected"
    assert submitted_physio.verified is False


def test_quick_web_leaves_submitted_and_needs_review(
    db_session, submitted_physio, admin_identity
):
    from app.admin.verification_queue import quick_reply_verify

    quick_reply_verify(db_session, submitted_physio.id, "web")
    db_session.refresh(submitted_physio)
    assert submitted_physio.onboarding_status == "submitted"
    assert submitted_physio.needs_web_review is True
    assert submitted_physio.verified is False


def test_quick_approve_sets_verified_true(db_session, submitted_physio, admin_identity):
    from app.admin.verification_queue import quick_reply_verify

    quick_reply_verify(db_session, submitted_physio.id, "approve")
    db_session.refresh(submitted_physio)
    assert submitted_physio.verified is True
    assert submitted_physio.needs_web_review is not True


def test_quick_verify_appends_admin_audit(
    db_session, submitted_physio, admin_identity
):
    from app.admin.verification_queue import quick_reply_verify

    quick_reply_verify(db_session, submitted_physio.id, "approve")
    events = db_session.scalars(
        select(AuditEvent).where(AuditEvent.kind == AuditKind.ADMIN)
    ).all()
    matching = [
        event
        for event in events
        if event.payload.get("physio_id") == str(submitted_physio.id)
        and event.payload.get("decision") == "approve"
    ]
    assert matching


def test_route_escalation_whatsapps_all_admins(db_session, admin_row):
    from app.admin.escalation_router import ADMIN_ESCALATION_QUEUE, route_escalation
    from app.queue.tasks import _redis

    other = Admin(phone_e164="+2348000006104")
    db_session.add(other)
    db_session.flush()
    client = _redis()
    client.delete(ADMIN_ESCALATION_QUEUE)
    try:
        route_escalation(
            db_session,
            "safety",
            {"rule_ids": ["cardiac"], "reason": "chest pain"},
        )
        admin_msgs = [
            row
            for row in db_session.query(Message).all()
            if row.role == "joy"
            and row.conversation.persona == Persona.ADMIN
            and row.conversation.person_id in {admin_row.id, other.id}
        ]
        assert len(admin_msgs) >= 2
        phones = {admin_row.phone_e164, other.phone_e164}
        jobs = []
        while True:
            raw = client.rpop(ADMIN_ESCALATION_QUEUE)
            if raw is None:
                break
            jobs.append(raw)
        queued_phones = set()
        for raw in jobs:
            import json

            payload = json.loads(raw)
            queued_phones.add(payload["phone"])
            assert payload["text"]
        assert phones <= queued_phones or phones <= {
            row.conversation.person_id and admin_row.phone_e164 for row in admin_msgs
        }
        # Redis is best-effort; joy rows are the source of truth
        notified_ids = {row.conversation.person_id for row in admin_msgs}
        assert notified_ids == {admin_row.id, other.id}
        assert any("chest" in (row.text or "").lower() or "cardiac" in (row.text or "").lower() or "safety" in (row.text or "").lower() for row in admin_msgs)
    finally:
        client.delete(ADMIN_ESCALATION_QUEUE)


def test_route_escalation_enqueue_failure_is_logged_not_raised(
    db_session, admin_row, caplog, monkeypatch
):
    import logging

    from app.admin.escalation_router import route_escalation

    monkeypatch.setattr(
        "app.queue.tasks.enqueue_notify_admin_escalation",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("redis down")),
    )
    with caplog.at_level(logging.ERROR):
        route_escalation(db_session, "safety", {"rule_ids": ["cardiac"]})
    joy = [
        row
        for row in db_session.query(Message).all()
        if row.role == "joy" and row.conversation.person_id == admin_row.id
    ]
    assert joy
    assert any(rec.exc_info for rec in caplog.records)
    assert "enqueue" in caplog.text.lower()


def test_off_platform_keywords_detect():
    from app.admin.escalation_router import detect_off_platform

    assert detect_off_platform("please pay me direct tomorrow") == "off_platform"
    assert detect_off_platform("use my personal number instead") == "off_platform"
    assert detect_off_platform("my knee hurts") is None


def test_takeover_skips_llm(db_session, patient_conversation):
    from app.admin.escalation_router import set_takeover
    from app.conversation.turn_handler import handle_turn

    set_takeover(db_session, patient_conversation.id, True)
    patient = db_session.get(Patient, patient_conversation.person_id)
    llm = FakeLLM(reply="I would love to book you a physio")
    llm.complete_calls = 0

    def _complete(prompt, user_text):
        llm.complete_calls += 1
        return FakeLLM.complete(llm, prompt, user_text)

    llm.complete = _complete
    result = handle_turn(db_session, patient.phone_e164, "hello again", llm)
    assert llm.complete_calls == 0
    assert result.reply_text != "I would love to book you a physio"
    lower = result.reply_text.lower()
    assert "human" in lower or "person" in lower or "team" in lower or "helping" in lower
    assert "book" not in lower or "not" in lower


def test_takeover_still_runs_safety_and_routes_admin(
    db_session, patient_conversation, admin_row
):
    from app.admin.escalation_router import set_takeover
    from app.conversation.turn_handler import handle_turn

    set_takeover(db_session, patient_conversation.id, True)
    patient = db_session.get(Patient, patient_conversation.person_id)
    llm = FakeLLM(reply="Let's book a physio for tomorrow!")
    result = handle_turn(db_session, patient.phone_e164, "I have chest pain", llm)
    assert result.blocked_by_safety is True
    assert result.safety is not None and result.safety.fired is True
    assert "book" not in result.reply_text.lower()
    assert any(m in result.reply_text.lower() for m in ("concern", "sorry", "care", "worried"))
    assert "doctor" in result.reply_text.lower() or "emergency" in result.reply_text.lower() or "hospital" in result.reply_text.lower()
    admin_msgs = [
        row
        for row in db_session.query(Message).all()
        if row.role == "joy"
        and row.conversation.persona == Persona.ADMIN
        and row.conversation.person_id == admin_row.id
    ]
    assert admin_msgs


def test_takeover_does_not_book_or_pay(db_session, patient_conversation, fake_llm):
    from app.admin.escalation_router import set_takeover
    from app.conversation.turn_handler import handle_turn
    from app.models.booking import Booking

    identity = Identity(
        persona=Persona.PATIENT,
        person_id=patient_conversation.person_id,
        phone_e164=db_session.get(Patient, patient_conversation.person_id).phone_e164,
    )
    state = load(db_session, identity)
    complete = ExtractedTriage(
        onset="2 weeks",
        severity=5,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    )
    save_turn(
        db_session,
        state,
        "knee hurt",
        "summary",
        complete,
        PatientPhase.POST_TRIAGE,
        "en",
    )
    patient_conversation.summary_text = "knee"
    db_session.flush()
    set_takeover(db_session, patient_conversation.id, True)
    patient = db_session.get(Patient, patient_conversation.person_id)
    fake_llm.reply = "I'll book you now"
    result = handle_turn(db_session, patient.phone_e164, "yes book a physio", fake_llm)
    assert "confirmed" not in result.reply_text.lower()
    bookings = db_session.scalars(
        select(Booking).where(Booking.patient_id == patient.id)
    ).all()
    assert bookings == []


def test_normal_safety_fire_routes_to_admin(db_session, admin_row, fake_llm):
    from app.conversation.turn_handler import handle_turn

    patient = Patient(phone_e164="+2348000006105")
    db_session.add(patient)
    db_session.flush()
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    result = handle_turn(db_session, patient.phone_e164, "chest pain", fake_llm)
    assert result.blocked_by_safety is True
    admin_msgs = [
        row
        for row in db_session.query(Message).all()
        if row.role == "joy"
        and row.conversation.persona == Persona.ADMIN
        and row.conversation.person_id == admin_row.id
    ]
    assert admin_msgs


def test_off_platform_on_physio_turn_routes_without_breaking_onboarding(
    db_session, admin_row, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    physio = Physiotherapist(phone_e164="+2348000006106")
    db_session.add(physio)
    db_session.flush()
    result = handle_turn(
        db_session,
        physio.phone_e164,
        "please pay me direct, MRTB 99999 specialties msk",
        fake_llm,
        media=["https://files/cred.jpg"],
    )
    db_session.refresh(physio)
    assert physio.onboarding_status == "submitted"
    assert "48" in result.reply_text
    admin_msgs = [
        row
        for row in db_session.query(Message).all()
        if row.role == "joy"
        and row.conversation.persona == Persona.ADMIN
        and row.conversation.person_id == admin_row.id
    ]
    assert admin_msgs
    assert any("off" in (row.text or "").lower() or "platform" in (row.text or "").lower() or "personal" in (row.text or "").lower() or "direct" in (row.text or "").lower() for row in admin_msgs)


def test_physio_submit_routes_verification_to_admin(
    db_session, admin_row, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    physio = Physiotherapist(phone_e164="+2348000006107")
    db_session.add(physio)
    db_session.flush()
    handle_turn(
        db_session,
        physio.phone_e164,
        "MRTB 12345, specialties neuro and msk",
        fake_llm,
        media=["https://files/cred.jpg"],
    )
    db_session.refresh(physio)
    assert physio.onboarding_status == "submitted"
    admin_msgs = [
        row
        for row in db_session.query(Message).all()
        if row.role == "joy"
        and row.conversation.persona == Persona.ADMIN
        and row.conversation.person_id == admin_row.id
    ]
    assert admin_msgs
    joined = " ".join(row.text for row in admin_msgs).lower()
    assert "verif" in joined or "submitted" in joined or str(physio.id).lower() in joined


def test_admin_whatsapp_quick_reply_approve(
    db_session, submitted_physio, admin_identity, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(
        db_session,
        admin_identity.phone_e164,
        f"approve {submitted_physio.id}",
        fake_llm,
    )
    assert "later" not in result.reply_text.lower()
    db_session.refresh(submitted_physio)
    assert submitted_physio.onboarding_status == "verified"
    assert submitted_physio.verified is True


def test_admin_whatsapp_quick_reply_web(
    db_session, submitted_physio, admin_identity, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(
        db_session,
        admin_identity.phone_e164,
        f"web {submitted_physio.id}",
        fake_llm,
    )
    assert "later" not in result.reply_text.lower()
    db_session.refresh(submitted_physio)
    assert submitted_physio.onboarding_status == "submitted"
    assert submitted_physio.needs_web_review is True


def test_alembic_is_0016_not_0010():
    versions = Path(__file__).resolve().parents[1] / "alembic" / "versions"
    assert not (versions / "0010_admin.py").exists()
    path = versions / "0016_admin.py"
    assert path.is_file()
    source = path.read_text()
    assert 'revision: str = "0016_admin"' in source
    assert 'down_revision: Union[str, Sequence[str], None] = "0015_referral_fees"' in source
    assert "human_takeover" in source
    assert "takeover_notified_at" in source
    assert "needs_web_review" in source


def test_no_retool_or_hmo_export():
    root = Path(__file__).resolve().parents[1] / "app"
    assert not (root / "admin" / "broadcast.py").exists()
    assert not (root / "admin" / "stats_digest.py").exists()
    assert not (root / "api" / "internal" / "admin_panel.py").exists()
    source = (root / "admin" / "escalation_router.py").read_text()
    assert "hmo" not in source.lower()
    assert "retool" not in source.lower()
