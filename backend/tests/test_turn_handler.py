from sqlalchemy import select

import pytest

from app.conversation.state_manager import load, save_turn
from app.identity.resolver import resolve
from app.identity.unknown_sender import begin_unknown
from app.models.audit_log import AuditEvent
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.triage_session import TriageSession
from app.models.types import AuditKind, ConversationStage, ExtractedTriage, PatientPhase
from app.safety.protocol_runtime import NO, schedule_questions
from tests.fakes import FakeLLM


def _safety_cleared(extracted: ExtractedTriage) -> ExtractedTriage:
    """Return test triage state after a patient answered every scheduled safety item No."""
    questions = schedule_questions(extracted, limit=100)
    return extracted.model_copy(update={
        "safety_answers": {question.id: NO for question in questions},
        "safety_question_order": [question.id for question in questions],
    })


def test_rh_provider_selection_advances_to_slot_selection_stage():
    """Selecting a verified specialist must not fall back to triage summary."""
    from app.booking.booking_flow import AWAITING_RH_SLOT
    from app.conversation.turn_handler import _stage_for_booking_substate

    assert _stage_for_booking_substate(AWAITING_RH_SLOT) == ConversationStage.SLOT_SELECTION


def test_policy_acceptance_allows_short_unambiguous_reply():
    from app.conversation.turn_handler import _is_explicit_policy_acceptance

    assert _is_explicit_policy_acceptance("I accept") is True
    assert _is_explicit_policy_acceptance("  I   agree  ") is True
    assert _is_explicit_policy_acceptance("yes") is False


def test_mid_followup_helper_is_available_for_missing_severity():
    from app.conversation.turn_handler import _mid_followup_reply

    reply = _mid_followup_reply("Thanks for explaining.", "Could you rate it from 1 to 10?", PatientPhase.MID_TRIAGE)
    assert "1 to 10" in reply


def test_explicit_no_other_emergency_symptoms_clears_general_safety_question():
    from app.conversation.turn_handler import _narrative_no_answers
    from app.safety.protocol_runtime import NO, ScheduledQuestion

    question = ScheduledQuestion(
        id="GEN-001", rule_id="GEN", order=0,
        text="Any fever or feeling very unwell, unexplained weight loss, previous cancer, or unusual night pain?",
    )
    answers = _narrative_no_answers(
        "I have not had an injury, numbness, weakness, fever, bladder/bowel changes, or other emergency symptoms.",
        [("general_warning_signs", (question,))],
    )
    assert answers == {"GEN-001": NO}


def test_minor_assessed_accident_clears_serious_injury_question():
    from app.conversation.turn_handler import _narrative_no_answers
    from app.safety.protocol_runtime import NO, ScheduledQuestion

    question = ScheduledQuestion(
        id="GEN-001-Q1", rule_id="GEN", order=0,
        text="Did this start after a serious accident, major fall, or significant injury?",
    )
    answers = _narrative_no_answers(
        "I was in a minor car accident 10 days ago. I was checked at the hospital and they said there was no fracture.",
        [("major_injury", (question,))],
    )
    assert answers == {"GEN-001-Q1": NO}


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


def test_unknown_sender_uses_gemini_when_unclear_and_audits(db_session):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000001099"
    llm = _CountingLLM(
        reply="Hey — are you here for physio care, joining as a physiotherapist, or helping family?",
        extraction={"intent": "unclear"},
    )
    result = handle_turn(db_session, phone, "hello", llm)
    assert result.reply_text == llm.reply
    assert llm.complete_calls == 1
    events = db_session.scalars(
        select(AuditEvent).where(
            AuditEvent.kind == AuditKind.IDENTITY,
            AuditEvent.actor_phone == phone,
        )
    ).all()
    assert events
    assert events[0].person_id is None


def test_unknown_care_seeker_provisions_patient_and_uses_gemini(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000001101"
    fake_llm.reply = (
        "Thanks for reaching out — I'm Joy. Tell me what's going on with your body; "
        "a voice note is fine."
    )
    result = handle_turn(db_session, phone, "I'm looking for physiotherapy care", fake_llm)
    identity = resolve(db_session, phone)
    assert identity is not None
    assert identity.persona.value == "patient"
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is not None
    assert result.reply_text == fake_llm.reply
    assert fake_llm.complete_prompts  # patient triage path used Gemini


def test_unknown_curly_apostrophe_physio_claim_provisions(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000001102"
    # WhatsApp-style curly apostrophe in I’m
    result = handle_turn(db_session, phone, "I’m a physiotherapist", fake_llm)
    identity = resolve(db_session, phone)
    assert identity is not None
    assert identity.persona.value == "physiotherapist"
    assert db_session.scalar(
        select(Physiotherapist).where(Physiotherapist.phone_e164 == phone)
    ) is not None
    lower = result.reply_text.lower()
    assert "mrtb" in lower or "credential" in lower or "specialty" in lower


def test_unknown_family_claim_explains_add_flow_without_looping_script(
    db_session, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    phone = "+2348000001103"
    fake_llm.reply = (
        "Got it — you're here for family. Ask them to add this number from their chat "
        "with me, then come back."
    )
    fake_llm.extraction = {"intent": "family"}
    result = handle_turn(db_session, phone, "A family member added me here", fake_llm)
    assert resolve(db_session, phone) is None
    assert db_session.scalar(select(Patient).where(Patient.phone_e164 == phone)) is None
    assert result.reply_text == fake_llm.reply
    assert result.reply_text != begin_unknown(db_session, phone)


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

    complete = _safety_cleared(ExtractedTriage(
        onset="3 days",
        severity=6,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    ))
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

    complete = _safety_cleared(ExtractedTriage(
        onset="3 days",
        severity=6,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    ))
    state = load(db_session, patient_identity)
    save_turn(
        db_session, state, "knee", "summary", complete, PatientPhase.POST_TRIAGE, "en",
        stage=ConversationStage.TRIAGE_SUMMARY,
    )
    row = db_session.get(Conversation, state.conversation_id)
    row.summary_text = "Here's what I understood: knee."
    db_session.flush()

    fake_llm.reply = "Great, you're booked!"
    result = handle_turn(db_session, patient_identity.phone_e164, "yes that's correct", fake_llm)
    lower = result.reply_text.lower()
    assert "booked" not in lower
    assert "confirmed" not in lower
    assert result.blocked_by_safety is False
    assert "next slice" not in lower
    assert "consultation & booking policy" in lower
    assert "can’t continue" in lower or "cannot continue" in lower


@pytest.mark.parametrize(
    "confirm_text",
    [
        "Yh this is right",
        "Confirmed",
        "this is right",
        "ok",
        "sounds good",
    ],
)
def test_post_triage_accepts_common_confirm_phrases(
    db_session, patient_identity, fake_llm, confirm_text
):
    from app.conversation.turn_handler import handle_turn

    complete = _safety_cleared(ExtractedTriage(
        onset="4 days",
        severity=9,
        body_location="left knee",
        goals="get back to running",
        condition_area="msk",
    ))
    state = load(db_session, patient_identity)
    save_turn(
        db_session, state, "knee", "summary", complete, PatientPhase.POST_TRIAGE, "en",
        stage=ConversationStage.TRIAGE_SUMMARY,
    )
    row = db_session.get(Conversation, state.conversation_id)
    row.summary_text = (
        "Here's what I understood: left knee, for 4 days, severity 9 out of 10, "
        "hoping to get back to running, (msk physio). "
        "Please confirm this is right, or tell me what to correct?"
    )
    db_session.flush()

    fake_llm.reply = "should not loop the summary"
    result = handle_turn(db_session, patient_identity.phone_e164, confirm_text, fake_llm)
    lower = result.reply_text.lower()
    assert "here's what i understood" not in lower
    assert "please confirm this summary" not in lower
    assert "consultation & booking policy" in lower
    assert "can’t continue" in lower or "cannot continue" in lower


def test_mid_triage_moves_to_summary_after_safety_and_required_facts(
    db_session, patient_identity, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt 3 days",
        "tell me more",
        _safety_cleared(ExtractedTriage(onset="3 days", body_location="knee")),
        PatientPhase.MID_TRIAGE,
        "en",
        stage=ConversationStage.SAFETY_SCREEN,
    )
    fake_llm.reply = "Thanks — I hear you."
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "still the knee", fake_llm)
    assert result.phase == "post_triage"
    lower = result.reply_text.lower()
    assert "does this summary look right" in lower


def test_grouped_safety_no_answers_clear_all_duplicate_protocol_questions(
    db_session, patient_identity, fake_llm
):
    """One four-item screen must not cause a second duplicate safety checklist."""
    from app.conversation.turn_handler import handle_turn
    from app.safety.protocol_runtime import NO, schedule_questions

    complete = ExtractedTriage(
        onset="3 days",
        severity=5,
        body_location="lower back",
        goals="sit and stand comfortably",
        condition_area="msk",
    )
    state = load(db_session, patient_identity)
    save_turn(
        db_session, state, "back pain", "safety screen", complete,
        PatientPhase.MID_TRIAGE, "en", stage=ConversationStage.SAFETY_SCREEN,
    )
    fake_llm.reply = "unused"
    fake_llm.extraction = {}

    result = handle_turn(
        db_session,
        patient_identity.phone_e164,
        "1. No\n2. No\n3. No\n4. No",
        fake_llm,
    )

    assert result.phase == PatientPhase.POST_TRIAGE
    assert result.extracted is not None
    assert result.extracted.safety_answers
    assert all(answer == NO for answer in result.extracted.safety_answers.values())
    assert not schedule_questions(result.extracted, limit=1)
    assert "short safety check" not in result.reply_text.lower()


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
    assert "later" not in result.reply_text.lower()
    lower = result.reply_text.lower()
    assert "mrtb" in lower or "credential" in lower or "specialty" in lower
    assert (
        db_session.scalars(
            select(TriageSession).where(TriageSession.patient_id == physio.id)
        ).all()
        == []
    )


def test_physio_handle_turn_submits_complete_onboarding(db_session):
    from app.conversation.turn_handler import handle_turn
    from app.models.physiotherapist import Physiotherapist

    physio = Physiotherapist(phone_e164="+2348000001097")
    db_session.add(physio)
    db_session.flush()
    llm = _CountingLLM(reply="should not be used")
    result = handle_turn(
        db_session,
        physio.phone_e164,
        "MRTB 12345, specialties neuro and msk",
        llm,
        media=["https://files/cred.jpg"],
    )
    db_session.refresh(physio)
    assert llm.complete_calls == 0
    assert physio.onboarding_status == "submitted"
    assert physio.verification_due_at is not None
    lower = result.reply_text.lower()
    assert "submitted" in lower
    assert "48" in lower
    assert "verification" in lower


def test_mid_triage_does_not_forward_model_checklist(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt 3 days",
        "tell me more",
        _safety_cleared(ExtractedTriage(onset="3 days", body_location="knee")),
        PatientPhase.MID_TRIAGE,
        "en",
        stage=ConversationStage.SAFETY_SCREEN,
    )
    fake_llm.reply = (
        "When did it start? How bad is it 1-10? Any numbness? "
        "What makes it worse? What are your goals?"
    )
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "still the knee", fake_llm)
    assert result.phase == "post_triage"
    assert "When did it start?" not in result.reply_text
    assert "Any numbness?" not in result.reply_text
    assert "What makes it worse?" not in result.reply_text
    assert "What are your goals?" not in result.reply_text
    assert "How bad is it 1-10?" not in result.reply_text
    assert "does this summary look right" in result.reply_text.lower()


def test_mid_triage_does_not_block_summary_on_optional_severity(
    db_session, patient_identity, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt 3 days, want to walk",
        "tell me more",
        _safety_cleared(ExtractedTriage(
            onset="3 days",
            body_location="knee",
            goals="walk again",
            condition_area="msk",
        )),
        PatientPhase.MID_TRIAGE,
        "en",
        stage=ConversationStage.SAFETY_SCREEN,
    )
    fake_llm.reply = "Thanks — I hear you."
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "still the knee", fake_llm)
    lower = result.reply_text.lower()
    assert result.phase == "post_triage"
    assert "does this summary look right" in lower
    assert "1 to 10" not in lower


def test_mid_triage_keeps_severity_when_llm_omits_number(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    state = load(db_session, patient_identity)
    save_turn(
        db_session,
        state,
        "knee hurt 4 days",
        "how bad and goals?",
        _safety_cleared(ExtractedTriage(
            onset="4 days",
            body_location="knee",
            condition_area="msk",
        )),
        PatientPhase.MID_TRIAGE,
        "en",
        stage=ConversationStage.SAFETY_SCREEN,
    )
    fake_llm.reply = "Thanks — noted."
    # LLM mines goals but drops the leading severity digit — common live failure mode.
    fake_llm.extraction = {"goals": "get back to running"}
    result = handle_turn(
        db_session,
        patient_identity.phone_e164,
        "8 / i hope to get back to running, i'm athlete you see...",
        fake_llm,
    )
    assert result.extracted is not None
    assert result.extracted.severity == 8
    assert result.extracted.goals
    lower = result.reply_text.lower()
    assert "1 to 10" not in lower
    assert "saddle" not in lower
    assert "bladder" not in lower
    assert result.phase == "post_triage"


def test_first_contact_with_story_batches_leftovers_not_second_open_ask(
    db_session, patient_identity, fake_llm
):
    from app.conversation.turn_handler import handle_turn

    fake_llm.reply = (
        "Oh, I'm sorry about your knee. Please tell me a bit more about what's going on?"
    )
    fake_llm.extraction = {
        "onset": "4 days",
        "body_location": "knee",
        "condition_area": "msk",
    }
    result = handle_turn(
        db_session,
        patient_identity.phone_e164,
        "my knee hurts, it's been hurting for the past 4 days",
        fake_llm,
    )
    assert result.phase == "mid_triage"
    lower = result.reply_text.lower()
    assert "tell me a bit more" not in lower
    assert "short safety check" in lower
    assert result.reply_text.count("?") <= 2


def test_thats_not_correct_does_not_confirm_summary(db_session, patient_identity, fake_llm):
    from app.conversation.turn_handler import handle_turn

    complete = _safety_cleared(ExtractedTriage(
        onset="3 days",
        severity=6,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    ))
    state = load(db_session, patient_identity)
    save_turn(
        db_session, state, "knee", "summary", complete, PatientPhase.POST_TRIAGE, "en",
        stage=ConversationStage.TRIAGE_SUMMARY,
    )
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

    complete = _safety_cleared(ExtractedTriage(
        onset="3 days",
        severity=6,
        body_location="knee",
        goals="walk again",
        condition_area="msk",
    ))
    state = load(db_session, patient_identity)
    save_turn(
        db_session, state, "knee", "got it", complete, PatientPhase.MID_TRIAGE, "en",
        stage=ConversationStage.SAFETY_SCREEN,
    )
    fake_llm.reply = "unused"
    fake_llm.extraction = {}
    result = handle_turn(db_session, patient_identity.phone_e164, "that's everything", fake_llm)
    assert result.phase == "post_triage"
    triage = db_session.get(TriageSession, state.triage_session_id)
    assert triage is not None
    assert triage.status == "summarised"
