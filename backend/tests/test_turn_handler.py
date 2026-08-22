from sqlalchemy import select

from app.conversation.state_manager import load, save_turn
from app.identity.resolver import resolve
from app.identity.unknown_sender import begin_unknown
from app.models.audit_log import AuditEvent
from app.models.conversation import Conversation
from app.models.triage_session import TriageSession
from app.models.types import AuditKind, ExtractedTriage, PatientPhase
from tests.fakes import FakeLLM


def test_first_contact_does_not_checklist(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn
    fake_llm.reply = "Sorry about the knee — tell me the whole story when you can."
    result = handle_turn(db_session, patient_phone, "my knee is bad", fake_llm)
    assert result.phase == "first_contact"
    assert "1-10" not in result.reply_text
    assert "knee" in result.reply_text.lower() or "sorry" in result.reply_text.lower() or "sound" in result.reply_text.lower()


def test_safety_overrides_model_cheer(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    result = handle_turn(db_session, patient_phone, "chest pain and shoulder ache", fake_llm)
    assert result.blocked_by_safety is True
    assert "book" not in result.reply_text.lower()
    assert result.safety.fired is True
    assert result.reply_text != fake_llm.reply
    assert any(m in result.reply_text.lower() for m in ("concern", "sorry", "care", "worried"))
    assert "doctor" in result.reply_text.lower() or "emergency" in result.reply_text.lower() or "hospital" in result.reply_text.lower()


def test_booking_cannot_confirm_from_conversation():
    from app.booking.state import advance_to_confirmed
    try:
        advance_to_confirmed(booking_id="x")
        assert False, "must not confirm"
    except RuntimeError as exc:
        assert "webhook" in str(exc).lower()


class _CountingLLM(FakeLLM):
    def __init__(self, **kwargs) -> None:
        super().__init__(**kwargs)
        self.complete_calls = 0

    def complete(self, prompt: str, user_text: str):
        self.complete_calls += 1
        return super().complete(prompt, user_text)


def test_first_contact_does_not_append_severity_checklist(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "Sorry about the knee — tell me the whole story when you can."
    result = handle_turn(db_session, patient_phone, "my knee is bad", fake_llm)
    lower = result.reply_text.lower()
    assert "1 to 10" not in lower
    assert "1-10" not in lower
    assert result.reply_text == fake_llm.reply


def test_unknown_sender_returns_begin_unknown_and_audits(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000001099"
    fake_llm.reply = "should not be used"
    result = handle_turn(db_session, phone, "hello", fake_llm)
    assert result.reply_text == begin_unknown(db_session, phone)
    assert result.reply_text != fake_llm.reply
    events = db_session.scalars(select(AuditEvent).where(AuditEvent.kind == AuditKind.IDENTITY)).all()
    assert events
    assert events[0].actor_phone == phone
    assert events[0].person_id is None


def test_safety_discards_model_reply_without_second_llm_call(db_session, patient_phone):
    from app.conversation.turn_handler import handle_turn

    llm = _CountingLLM(
        reply="Let's book a physio for tomorrow!",
        extraction={"flags": {"chest_pain": True}},
    )
    result = handle_turn(db_session, patient_phone, "chest pain and shoulder ache", llm)
    assert llm.complete_calls == 1
    assert result.blocked_by_safety is True
    assert result.reply_text != llm.reply
    assert "book" not in result.reply_text.lower()


def test_safety_sets_escalated_and_skips_batching(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    result = handle_turn(db_session, patient_phone, "chest pain", fake_llm)
    identity = resolve(db_session, patient_phone)
    triage = db_session.scalar(select(TriageSession).where(TriageSession.patient_id == identity.person_id))
    assert triage is not None
    assert triage.status == "escalated"
    assert "1 to 10" not in result.reply_text.lower()
    safety_events = db_session.scalars(select(AuditEvent).where(AuditEvent.kind == AuditKind.SAFETY)).all()
    assert safety_events
    assert safety_events[0].payload.get("fired") is True


def test_decide_phase_rules(db_session, patient_identity):
    from app.conversation.orchestrator import decide_phase

    empty = load(db_session, patient_identity)
    assert decide_phase(empty) == PatientPhase.FIRST_CONTACT

    save_turn(
        db_session,
        empty,
        "knee hurt",
        "ok",
        ExtractedTriage(body_location="knee", onset="3 days"),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    mid = load(db_session, patient_identity)
    assert decide_phase(mid) == PatientPhase.MID_TRIAGE

    complete = ExtractedTriage(
        onset="3 days",
        severity=6,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    )
    save_turn(db_session, mid, "more", "summary?", complete, PatientPhase.MID_TRIAGE, "en")
    awaiting = load(db_session, patient_identity)
    row = db_session.get(Conversation, awaiting.conversation_id)
    row.summary_text = "Here's what I understood: knee."
    db_session.flush()
    post = load(db_session, patient_identity)
    assert decide_phase(post) == PatientPhase.POST_TRIAGE


def test_match_physios_raises_not_ready():
    from app.matching.specialty_match import NotReadyError, match_physios

    try:
        match_physios()
        assert False, "must raise"
    except NotReadyError:
        pass


def test_confirm_booking_does_not_exist():
    import app.booking.state as booking_state

    assert not hasattr(booking_state, "confirm_booking")


def test_post_triage_confirm_does_not_claim_booked(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    complete = ExtractedTriage(
        onset="3 days",
        severity=6,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    )
    state = load(db_session, patient_identity)
    save_turn(db_session, state, "knee", "summary", complete, PatientPhase.POST_TRIAGE, "en")
    row = db_session.get(Conversation, state.conversation_id)
    row.summary_text = "Here's what I understood: knee."
    db_session.flush()

    fake_llm.reply = "Great, you're booked!"
    result = handle_turn(db_session, patient_identity.phone_e164, "yes that's correct", fake_llm)
    lower = result.reply_text.lower()
    assert "booked" not in lower
    assert result.blocked_by_safety is False
    assert "match" in lower or "next" in lower


def test_mid_triage_sends_one_grouped_followup(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt 3 days",
        "tell me more",
        ExtractedTriage(onset="3 days", body_location="knee"),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    fake_llm.reply = "Thanks — I hear you."
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "still the knee", fake_llm)
    assert result.phase == "mid_triage"
    assert result.reply_text.count("?") <= 2
    assert "\n1." not in result.reply_text
    lower = result.reply_text.lower()
    assert "1 to 10" in lower or "hoping" in lower or "goal" in lower
