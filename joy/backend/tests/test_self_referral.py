"""The self-referral flow (owner's guide "JOY (Initial triage and booking)", Nov 2026).

welcome + language -> consent -> name, age, area -> story -> 7-item red-flag screen ->
short questions -> outcome (not a diagnosis) -> named physios with photos -> Confirm and pay.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.integrations.rh_client import RHMatch
from app.models.patient import Patient
from app.models.rh_identity_mapping import RHIdentityMapping
from app.models.types import ExtractedTriage, Identity, Persona
from app.triage import self_referral as sr
from tests.fakes import FakeLLM

CLERK_DEFAULT = "https://img.clerk.com/eyJ0eXBlIjoiZGVmYXVsdCIsImlpZCI6Imluc18yIn0"
REAL_PHOTO = "https://img.clerk.com/eyJ0eXBlIjoicHJveHkiLCJzcmMiOiJodHRwcyJ9"


# ---------------------------------------------------------------------------------------------
# Parsing (no database)
# ---------------------------------------------------------------------------------------------

BACK = ExtractedTriage(main_complaint="lower back pain", body_location="lower back")
KNEE = ExtractedTriage(main_complaint="knee pain", body_location="knee")


@pytest.mark.parametrize("text, verdict, items", [
    ("7", "none", set()),
    ("None of these", "none", set()),
    ("No", "none", set()),
    ("no fever or weakness", "none", set()),
    ("2", "positive", {"2"}),
    ("1 and 5", "positive", {"1", "5"}),
    ("7, 3", "positive", {"3"}),
    ("I had a fever last week", "positive", {"5"}),
    ("the pain is severe", "positive", {"4"}),
    ("yes", "which", set()),
    ("hmm", "unclear", set()),
])
def test_red_flag_answers(text, verdict, items):
    assert sr.parse_red_flags(text, KNEE) == (verdict, items)


def test_back_pain_screen_also_asks_about_saddle_numbness():
    text, menu = sr.red_flag_prompt(BACK, "Ada")
    assert "numbness in your groin or bottom" in text
    verdict, items = sr.parse_red_flags("numbness around my groin", BACK)
    assert verdict == "positive" and "3" in items
    knee_text, _ = sr.red_flag_prompt(KNEE)
    assert "groin" not in knee_text
    rows = menu["action"]["sections"][0]["rows"]
    assert [row["id"] for row in rows] == ["1", "2", "3", "4", "5", "6", "7"]
    assert all(len(row["title"]) <= 24 and len(row.get("description", "")) <= 72 for row in rows)


@pytest.mark.parametrize("text, expected", [
    ("Ada, 34, Yaba", {"name": "Ada", "age": 34, "city": "Lagos", "area": "Yaba"}),
    ("My name is Tunde, I am 45 and I live in Lekki", {"name": "Tunde", "age": 45, "city": "Lagos", "area": "Lekki"}),
    ("ada 30 ikeja lagos", {"name": "Ada", "age": 30, "city": "Lagos", "area": "ikeja"}),
    ("Ada, Wuse 2, 34", {"name": "Ada", "age": 34, "city": "Abuja", "area": "Wuse 2"}),
    ("Yaba", {"city": "Lagos", "area": "Yaba"}),
    ("Chioma", {"name": "Chioma"}),
])
def test_profile_in_one_message(text, expected):
    assert sr.parse_profile(text, ["name", "age", "place"]) == expected


def test_only_unanswered_questions_are_asked():
    assert [q["key"] for q in sr.condition_questions(BACK)] == ["onset", "pain", "radiation", "impact", "seen"]
    told = BACK.model_copy(update={"onset": "3 weeks ago", "severity": 6, "seen_clinician": False})
    assert [q["key"] for q in sr.condition_questions(told)] == ["radiation", "impact"]
    assert "radiation" not in [q["key"] for q in sr.condition_questions(KNEE)]


def test_physio_summary_layout():
    patient = Patient(phone_e164="+2348000000000", name="Ada Bello", age=34, preferred_language="en", location="Yaba, Lagos")
    extracted = BACK.model_copy(update={"duration": "1–6 weeks"})
    text = sr.physio_summary(patient, extracted, {
        "outcome": "routine", "red_flag_screen": "negative",
        "answers": {"pain": "moderate", "impact": "yes", "radiation": "no"},
    }, appointment="Tomorrow, 10:00 AM")
    assert text.splitlines()[:5] == [
        "New self-referral — A. Bello, 34",
        "Triage outcome: Routine MSK physiotherapy",
        "Presenting issue: Lower back, 1–6 weeks",
        "Pain today: Moderate",
        "Red-flag screen: Negative",
    ]
    assert "Functional impact: Affects sleep, work or daily activities" in text
    assert text.endswith("Consultation: Tomorrow, 10:00 AM")


# ---------------------------------------------------------------------------------------------
# The conversation (test database)
# ---------------------------------------------------------------------------------------------


def _match(pid: str, name: str, hours: int, photo: str | None = None) -> RHMatch:
    start = int((datetime.now(timezone.utc) + timedelta(hours=hours)).timestamp() * 1000)
    return RHMatch(
        physiotherapist_id=pid, display_name=name, specialties=["msk"], service_modes=["online"],
        amount_kobo=600_000, match_reasons=[], next_slot_start=start, next_slot_end=start + 20 * 60_000,
        specialty_label="Back pain & posture", photo_url=photo,
    )


class FakeRH:
    uses_direct_convex_gateway = False

    def __init__(self, matches):
        self.matches = matches
        self.calls: list[tuple[str, object]] = []

    def current_policy(self, language="en"):
        return SimpleNamespace(
            policy_id="consultation-booking-policy", version="2026-11-06",
            url="https://physioaroundme.com/consultation-booking-policy", content_sha256="abc",
            effective_at="2026-11-06T00:00:00.000Z", acceptance_text="I accept", language="en", is_approved=True,
        )

    def match_physios(self, **kwargs):
        self.calls.append(("match", kwargs))
        return list(self.matches)

    def create_pending_booking(self, **kwargs):
        self.calls.append(("hold", kwargs))
        return SimpleNamespace(booking_id="bk-1", amount_kobo=600_000, booking_status="pending_payment", payment_status="pending")

    def operational_mutation(self, op, *, actor, data, idempotency_key):
        self.calls.append((op, data))
        return {}

    def operational_query(self, op, *, actor, data):
        return {"consents_required": [{"policy_id": "terms", "version": "2026-10-26"}, {"policy_id": "privacy", "version": "2026-10-26"}]}

    def upsert_intake(self, payload):
        self.calls.append(("intake", payload))

    def record_journey_event(self, **kwargs):
        return None

    def availability(self, *args, **kwargs):
        start = int((datetime.now(timezone.utc) + timedelta(hours=30)).timestamp() * 1000)
        return {"slots": [{"start": start, "end": start + 20 * 60_000, "duration": 20}]}


@pytest.fixture
def rh(monkeypatch):
    monkeypatch.setenv("JOY_SELF_REFERRAL_V2", "true")
    fake = FakeRH([_match("p1", "Tolu Adeyemi", 5, REAL_PHOTO), _match("p2", "Femi Bello", 8, CLERK_DEFAULT), _match("p3", "Ngozi Okafor", 20)])
    for target in (
        "app.integrations.rh_client.configured_rh_client",
        "app.booking.booking_flow.configured_rh_client",
        "app.booking.intake.configured_rh_client",
        "app.conversation.turn_handler.configured_rh_client",
    ):
        monkeypatch.setattr(target, lambda: fake)
    monkeypatch.setattr("app.booking.booking_flow._rh_patient_id", lambda session, patient: "rh-pat-1")
    return fake


@pytest.fixture
def new_patient(db_session) -> Identity:
    patient = Patient(phone_e164="+2348000009101")
    db_session.add(patient)
    db_session.flush()
    return Identity(persona=Persona.PATIENT, person_id=patient.id, phone_e164=patient.phone_e164)


def _turn(db_session, identity, llm, text):
    from app.conversation.turn_handler import handle_turn

    return handle_turn(db_session, identity.phone_e164, text, llm)


STORY = FakeLLM(extraction={
    "main_complaint": "lower back pain", "body_location": "lower back", "onset": "3 weeks ago",
})


def _through_intake(db_session, identity, llm=STORY):
    welcome = _turn(db_session, identity, llm, "Hi")
    assert welcome.reply_text.startswith("Hi 👋 I'm Joy, Rehabify's recovery companion.")
    assert "I don't provide a diagnosis or emergency care" in welcome.reply_text
    assert welcome.interactive["type"] == "list"
    consent = _turn(db_session, identity, llm, "1")
    assert consent.reply_text.startswith("Before we continue, please confirm:")
    assert consent.interactive["type"] == "button"
    profile = _turn(db_session, identity, llm, "I agree")
    assert "What is your first name?" in profile.reply_text
    reason = _turn(db_session, identity, llm, "Ada, 34, Yaba")
    assert reason.reply_text.startswith("Thanks, Ada. What would you like help with today?")
    screen = _turn(db_session, identity, llm, "My lower back has been hurting for 3 weeks")
    assert "I need to ask a few safety questions" in screen.reply_text
    assert "7️⃣ None of these" in screen.reply_text
    return screen


def test_full_self_referral_to_confirm_and_pay(db_session, new_patient, rh):
    _through_intake(db_session, new_patient)
    patient = db_session.get(Patient, new_patient.person_id)
    assert (patient.preferred_language, patient.name, patient.age, patient.city, patient.area) == ("en", "Ada", 34, "Lagos", "Yaba")
    assert patient.care_consent_at is not None
    consents = [data for op, data in rh.calls if op == "patient_record_consents"]
    assert consents and consents[0]["accepted"] == {"terms": "2026-10-26", "privacy": "2026-10-26"}

    first = _turn(db_session, new_patient, STORY, "7")
    assert "A few quick questions about your lower back" in first.reply_text
    assert "How would you rate the pain today?" in first.reply_text  # onset was in the story
    assert [b["reply"]["title"] for b in first.interactive["action"]["buttons"]] == ["Mild", "Moderate", "Severe"]
    assert "Does it travel into your leg?" in _turn(db_session, new_patient, STORY, "Moderate").reply_text
    assert "sleep, work, or daily activities" in _turn(db_session, new_patient, STORY, "no").reply_text
    assert "seen a doctor or physiotherapist" in _turn(db_session, new_patient, STORY, "yes").reply_text

    offer = _turn(db_session, new_patient, STORY, "no")
    assert offer.before[0]["text"].startswith("Thank you. Based on your answers, a physiotherapy assessment may be helpful.")
    assert "This is not a diagnosis." in offer.before[0]["text"]
    # Only the physio who uploaded a photo gets one: no placeholder for the others
    photos = [item for item in offer.before if item.get("photo_url")]
    assert [p["photo_url"] for p in photos] == [REAL_PHOTO]
    assert photos[0]["caption"].startswith("1️⃣ Tolu Adeyemi\nBack pain & posture\nNext available: ")
    assert "*Tolu Adeyemi*" in offer.reply_text and "*Ngozi Okafor*" in offer.reply_text
    assert "₦6,000: an online video call of about 20 minutes" in offer.reply_text
    match_call = next(kwargs for op, kwargs in rh.calls if op == "match")
    assert (match_call["service_mode"], match_call["within_hours"], match_call["duration_minutes"], match_call["urgent"]) == ("online", 24, 20, False)

    confirm = _turn(db_session, new_patient, STORY, "1")
    assert confirm.reply_text.startswith("You've selected *Tolu Adeyemi*.")
    assert "By tapping *Confirm and pay*, you accept our Consultation & Booking Policy" in confirm.reply_text

    held = _turn(db_session, new_patient, STORY, "confirm and pay")
    assert "is held for 30 minutes" in held.reply_text and "email address" in held.reply_text
    hold = next(kwargs for op, kwargs in rh.calls if op == "hold")
    assert (hold["physiotherapist_id"], hold["duration_minutes"], hold["service_mode"], hold["policy_version"]) == ("p1", 20, "online", "2026-11-06")
    intake = next(payload for op, payload in rh.calls if op == "intake")
    assert intake["clinician_summary"].startswith("New self-referral — Ada, 34\nTriage outcome: Routine MSK physiotherapy")


def test_confirm_and_pay_passes_the_safety_gate_on_the_direct_gateway(db_session, new_patient, rh, monkeypatch):
    """Live RH needs a safety reference for every hold. The policy accepted at Confirm and pay must
    already be on the conversation when Joy issues it (it wasn't, so every hold was refused)."""
    monkeypatch.setenv("RH_SAFETY_HMAC_SECRET", "test-safety-secret")
    rh.uses_direct_convex_gateway = True
    db_session.add(RHIdentityMapping(persona="patient", joy_person_id=new_patient.person_id, rh_record_id="rh-pat-1"))
    db_session.flush()
    _through_intake(db_session, new_patient)
    for answer in ("7", "Moderate", "no", "yes", "no", "1"):
        _turn(db_session, new_patient, STORY, answer)
    held = _turn(db_session, new_patient, STORY, "confirm and pay")
    assert "is held for 30 minutes" in held.reply_text
    hold = next(kwargs for op, kwargs in rh.calls if op == "hold")
    assert hold["eligibility_reference"]


def test_a_refused_safety_gate_hands_over_instead_of_looping(db_session, new_patient, rh, monkeypatch):
    monkeypatch.setenv("RH_SAFETY_HMAC_SECRET", "test-safety-secret")
    rh.uses_direct_convex_gateway = True  # no patient mapping: the gate refuses
    alerts = []
    monkeypatch.setattr("app.admin.escalation_router.route_escalation", lambda session, kind, payload: alerts.append((kind, payload)))
    _through_intake(db_session, new_patient)
    for answer in ("7", "Moderate", "no", "yes", "no", "1"):
        _turn(db_session, new_patient, STORY, answer)
    blocked = _turn(db_session, new_patient, STORY, "confirm and pay")
    assert "care team to check one thing" in blocked.reply_text
    assert not [op for op, _ in rh.calls if op == "hold"]
    assert ("booking_blocked", "PATIENT_MAPPING_NOT_FOUND") in [(kind, payload.get("reason")) for kind, payload in alerts]


def test_any_red_flag_stops_the_booking_and_alerts_the_team(db_session, new_patient, rh):
    from app.models.triage_session import TriageSession

    _through_intake(db_session, new_patient)
    stop = _turn(db_session, new_patient, STORY, "2")
    assert stop.reply_text.startswith("Thank you for telling me. Some of these symptoms can need urgent medical assessment.")
    assert stop.blocked_by_safety and stop.safety.risk_level == "RED"
    assert [b["reply"]["title"] for b in stop.interactive["action"]["buttons"]] == ["Emergency guidance", "I understand"]
    assert any(op == "patient_request_callback" and data["reason"] == "red_flag" for op, data in rh.calls)
    assert not any(op == "match" for op, _ in rh.calls)
    triage = db_session.scalars(__import__("sqlalchemy").select(TriageSession).where(TriageSession.patient_id == new_patient.person_id)).first()
    assert triage.status == "escalated"

    guidance = _turn(db_session, new_patient, STORY, "emergency guidance")
    assert "Call 112" in guidance.reply_text and guidance.blocked_by_safety
    again = _turn(db_session, new_patient, STORY, "can I book now?")
    assert again.reply_text.startswith("Thank you for telling me.")


def test_nobody_free_within_24_hours_goes_to_the_care_team(db_session, new_patient, rh):
    rh.matches = []
    _through_intake(db_session, new_patient)
    for answer in ("7", "mild", "no", "no"):
        reply = _turn(db_session, new_patient, STORY, answer)
    reply = _turn(db_session, new_patient, STORY, "no")
    assert "couldn't find a physiotherapist who fits your needs and is free in the next 24 hours" in reply.reply_text
    assert any(op == "patient_request_callback" and data["reason"] == "no_match" for op, data in rh.calls)
    later = _turn(db_session, new_patient, STORY, "hello?")
    assert later.reply_text.startswith("Our care team has your details")


def test_severe_pain_books_the_earliest_physio(db_session, new_patient, rh):
    _through_intake(db_session, new_patient)
    for answer in ("7", "severe", "no", "yes"):
        _turn(db_session, new_patient, STORY, answer)
    offer = _turn(db_session, new_patient, STORY, "no")
    assert "it would be best for a physiotherapist to assess you soon" in offer.before[0]["text"]
    assert next(kwargs for op, kwargs in rh.calls if op == "match")["urgent"] is True


def test_a_story_sent_first_is_kept_for_after_the_intake(db_session, new_patient, rh):
    welcome = _turn(db_session, new_patient, STORY, "My lower back has been hurting for 3 weeks")
    assert welcome.reply_text.startswith("Hi 👋 I'm Joy")
    _turn(db_session, new_patient, STORY, "English")
    _turn(db_session, new_patient, STORY, "I agree")
    screen = _turn(db_session, new_patient, STORY, "Ada, 34, Yaba")
    assert screen.reply_text.startswith("Thanks, Ada. I need to ask a few safety questions.")


def test_off_by_default(db_session, new_patient, monkeypatch):
    monkeypatch.delenv("JOY_SELF_REFERRAL_V2", raising=False)
    reply = _turn(db_session, new_patient, FakeLLM(), "Hi")
    assert not reply.reply_text.startswith("Hi 👋 I'm Joy, Rehabify's recovery companion.")
