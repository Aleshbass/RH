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


def test_booking_cannot_confirm_from_conversation(db_session):
    from app.booking.state import advance_to_confirmed
    try:
        advance_to_confirmed(db_session, booking_id="x", source="conversation")
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


def test_unknown_sender_returns_begin_unknown_and_audits(db_session):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000001099"
    llm = _CountingLLM(reply="should not be used")
    result = handle_turn(db_session, phone, "hello", llm)
    assert result.reply_text == begin_unknown(db_session, phone)
    assert result.reply_text != llm.reply
    assert llm.complete_calls == 0
    events = db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.kind == AuditKind.IDENTITY,
            AuditEvent.actor_phone == phone,
        )
    ).all()
    assert events
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
    safety_events = db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.kind == AuditKind.SAFETY,
            AuditEvent.actor_phone == patient_phone,
        )
    ).all()
    assert safety_events
    assert safety_events[0].payload.get("fired") is True
    assert safety_events[0].payload.get("notify_family") is False


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


def test_safety_followup_stays_blocked_without_new_triage(db_session, patient_phone):
    from app.conversation.turn_handler import handle_turn

    llm = _CountingLLM(
        reply="Let's book a physio for tomorrow!",
        extraction={"flags": {"chest_pain": True}},
    )
    first = handle_turn(db_session, patient_phone, "chest pain", llm)
    assert first.blocked_by_safety is True
    assert first.extracted is not None
    assert first.extracted.flags.get("chest_pain") is True

    llm.complete_calls = 0
    llm.extraction = {}
    llm.reply = "opening a fresh triage"
    second = handle_turn(db_session, patient_phone, "ok", llm)

    assert second.blocked_by_safety is True
    assert second.extracted is not None
    assert second.extracted.flags.get("chest_pain") is True
    assert llm.complete_calls == 0
    identity = resolve(db_session, patient_phone)
    sessions = db_session.scalars(
        select(TriageSession).where(TriageSession.patient_id == identity.person_id)
    ).all()
    assert len(sessions) == 1
    assert sessions[0].status == "escalated"


def test_first_contact_prompt_includes_known_name(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = "Sorry about the knee — tell me the whole story when you can."
    result = handle_turn(db_session, patient_identity.phone_e164, "my knee is bad", fake_llm)
    assert result.phase == "first_contact"
    assert "Ada Okonkwo" in fake_llm.last_prompt


def test_physio_does_not_extract_msk_triage(db_session):
    from app.conversation.turn_handler import handle_turn
    from app.models.physiotherapist import Physiotherapist

    physio = Physiotherapist(phone_e164="+2348000001098")
    db_session.add(physio)
    db_session.flush()
    llm = _CountingLLM(
        reply="should not be used",
        extraction={"body_location": "knee", "onset": "3 days", "condition_area": "msk"},
    )
    result = handle_turn(db_session, physio.phone_e164, "my knee has been bad for 3 days", llm)
    assert llm.complete_calls == 0
    assert result.extracted is None or not result.extracted.body_location
    assert "later" in result.reply_text.lower()
    assert (
        db_session.scalars(
            select(TriageSession).where(TriageSession.patient_id == physio.id)
        ).all()
        == []
    )


def test_mid_triage_does_not_forward_model_checklist(db_session, patient_identity, fake_llm):
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
    fake_llm.reply = (
        "When did it start? How bad is it 1-10? Any numbness? "
        "What makes it worse? What are your goals?"
    )
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "still the knee", fake_llm)
    assert result.phase == "mid_triage"
    assert "When did it start?" not in result.reply_text
    assert "Any numbness?" not in result.reply_text
    assert "What makes it worse?" not in result.reply_text
    assert "What are your goals?" not in result.reply_text
    assert "How bad is it 1-10?" not in result.reply_text
    assert "I've got that" in result.reply_text


def test_mid_triage_followup_is_not_only_a_severity_ask(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt 3 days, want to walk",
        "tell me more",
        ExtractedTriage(
            onset="3 days",
            body_location="knee",
            goals="walk again",
            condition_area="msk",
        ),
        PatientPhase.MID_TRIAGE,
        "en",
    )
    fake_llm.reply = "Thanks — I hear you."
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "still the knee", fake_llm)
    lower = result.reply_text.lower()
    assert "1 to 10" in lower or "1-10" in lower
    assert result.reply_text.strip() != "Could you tell me how bad it feels from 1 to 10?"
    assert any(word in lower for word in ("thanks", "hear", "got", "sorry"))
    assert result.reply_text.count("?") <= 2


def test_thats_not_correct_does_not_confirm_summary(db_session, patient_identity, fake_llm):
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

    fake_llm.reply = "Let me correct that."
    result = handle_turn(db_session, patient_identity.phone_e164, "that's not correct", fake_llm)
    lower = result.reply_text.lower()
    assert "matching you with a specialist" not in lower
    assert "next slice" not in lower
    assert result.phase == "post_triage"


def test_sending_summary_sets_summarised_status(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    complete = ExtractedTriage(
        onset="3 days",
        severity=6,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    )
    state = load(db_session, patient_identity)
    save_turn(db_session, state, "knee", "got it", complete, PatientPhase.MID_TRIAGE, "en")
    fake_llm.reply = "unused"
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "that's everything", fake_llm)
    assert result.phase == "post_triage"
    triage = db_session.get(TriageSession, state.triage_session_id)
    assert triage is not None
    assert triage.status == "summarised"
