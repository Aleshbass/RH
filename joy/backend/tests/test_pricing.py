"""Price questions answered in code from Rehabify's live prices (app/conversation/pricing.py).

The landing page's "Ask Joy about pricing" sends "Hi Joy, how much will my physiotherapy cost?".
The first tests need no database; the scenarios at the end go through handle_turn.
"""

from __future__ import annotations

from dataclasses import replace

import pytest
from sqlalchemy import select

from app.conversation.pricing import is_price_question, price_answer, price_topic
from app.integrations import rh_catalogue
from app.integrations.rh_catalogue import DEFAULTS
from app.models.conversation import Conversation, Message
from tests.fakes import FakeLLM
from tests.test_self_referral import FakeRH, _match, new_patient, rh  # noqa: F401  (fixtures)

LANDING = "Hi Joy, how much will my physiotherapy cost?"


# ---- the words -----------------------------------------------------------------------------------

@pytest.mark.parametrize("text, topic", [
    (LANDING, "general"),
    ("How much is it?", "general"),
    ("is it free?", "general"),
    ("wetin be the price", "general"),
    ("how much is a home visit", "home"),
    ("how much is each treatment session", "treatment"),
    ("how much is the full assessment", "assessment"),
    ("send me your price list", "list"),
    ("how much are the reminders", "support"),
    ("I can't afford it", "afford"),
    ("do you accept HMO?", "hmo"),
])
def test_price_questions_and_their_topics(text, topic):
    assert is_price_question(text)
    assert price_topic(text) == topic


@pytest.mark.parametrize("text", [
    "How much does it hurt when you bend?",
    "how much exercise should I do",
    "I can't afford to stop work, my back hurts",
    "my knee pain is costing me sleep",
    "I paid but I haven't got a receipt",
    "I want a refund",
    "",
])
def test_not_price_questions(text):
    assert not is_price_question(text)


# ---- the answers ---------------------------------------------------------------------------------

def test_the_general_answer_explains_the_first_step_and_what_comes_after():
    answer, topic = price_answer(LANDING, DEFAULTS)
    assert topic == "general"
    assert answer.startswith("Chatting with me is free.")
    assert "Initial Recovery Consultation, ₦6,000" in answer
    assert "show you the exact price before you pay" in answer
    assert "pay-later" in answer and "rehabify-access" in answer
    # The owner shows only the first price unless a patient asks about later care
    assert "₦30,000" not in answer and "₦12,000" not in answer


def test_answers_use_the_live_prices():
    live = {**DEFAULTS, "recovery_consultation": replace(DEFAULTS["recovery_consultation"], price_kobo=700_000)}
    assert "₦7,000" in price_answer(LANDING, live)[0]


def test_home_visits_come_after_the_online_first_step_with_travel():
    answer, _ = price_answer("how much is a home visit?", DEFAULTS)
    assert "₦30,000 plus a travel charge for your area" in answer
    assert "after your first consultation" in answer
    assert "₦6,000 online Initial Recovery Consultation" in answer


def test_a_service_switched_off_in_admin_is_not_quoted():
    live = {**DEFAULTS, "home_review": replace(DEFAULTS["home_review"], bookable=False)}
    assert "Home Physiotherapy Review" not in price_answer("how much is a home visit?", live)[0]


def test_hmo_is_passed_to_the_team():
    answer, topic = price_answer("Do you take my HMO?", DEFAULTS)
    assert topic == "hmo" and "within 1 working day" in answer


# ---- the live price list -------------------------------------------------------------------------

def test_the_convex_url_comes_from_the_site_url(monkeypatch):
    monkeypatch.setenv("RH_CONVEX_READ_BASE_URL", "https://adept-horse-443.convex.site")
    monkeypatch.delenv("RH_CONVEX_URL", raising=False)
    assert rh_catalogue._convex_url() == "https://adept-horse-443.convex.cloud"


def test_the_catalogue_reads_rh_and_falls_back_to_defaults(monkeypatch):
    class Response:
        def __init__(self, body):
            self.body = body

        def raise_for_status(self):
            return None

        def json(self):
            return self.body

    calls = []

    def post(url, json, timeout):
        calls.append((url, json["path"]))
        return Response({"status": "success", "value": {"services": [
            {"id": "recovery_consultation", "name": "Initial Recovery Consultation", "durationLabel": "15–20 minutes",
             "priceKobo": 650000.0, "travelApplies": False, "bookable": True},
            {"id": "not_a_service", "priceKobo": 1},
        ]}})

    monkeypatch.setenv("RH_CONVEX_URL", "https://example.convex.cloud")
    monkeypatch.setattr(rh_catalogue.httpx, "post", post)
    rh_catalogue.clear_cache()
    services = rh_catalogue.catalogue()
    assert calls == [("https://example.convex.cloud/api/query", "serviceTariffs:getCatalogue")]
    assert services["recovery_consultation"].price_kobo == 650_000
    assert services["home_treatment"] == DEFAULTS["home_treatment"]

    def down(url, json, timeout):
        raise OSError("RH is down")

    monkeypatch.setattr(rh_catalogue.httpx, "post", down)
    rh_catalogue.clear_cache()
    assert rh_catalogue.catalogue() == DEFAULTS
    rh_catalogue.clear_cache()


# ---- in a chat (Postgres) ------------------------------------------------------------------------

@pytest.fixture
def prices(monkeypatch):
    monkeypatch.setattr("app.conversation.pricing.catalogue", lambda: DEFAULTS)


def _messages(db_session, identity):
    conversation = db_session.scalar(select(Conversation).where(Conversation.person_id == identity.person_id))
    rows = db_session.scalars(
        select(Message).where(Message.conversation_id == conversation.id).order_by(Message.created_at)
    ).all()
    return conversation, [(row.role, row.text) for row in rows]


def test_the_landing_question_is_answered_then_the_welcome(db_session, rh, new_patient, prices):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(db_session, new_patient.phone_e164, LANDING, FakeLLM())
    assert result.before[0]["text"].startswith("Chatting with me is free.")
    assert result.reply_text.startswith("Hi 👋 I'm Joy, Rehabify's recovery companion.")
    assert result.interactive["type"] == "list"
    conversation, messages = _messages(db_session, new_patient)
    assert messages[0] == ("user", LANDING)
    assert messages[1][0] == "joy" and messages[1][1].startswith("Chatting with me is free.")
    assert messages[2][1].startswith("Hi 👋 I'm Joy")
    # A price question is not their story
    assert "opening_story" not in (conversation.booking_context or {}).get("self_referral", {})


def test_a_price_question_mid_step_is_answered_and_the_step_asked_again(db_session, rh, new_patient, prices):
    from app.conversation.turn_handler import handle_turn

    phone = new_patient.phone_e164
    handle_turn(db_session, phone, "Hi", FakeLLM())
    consent = handle_turn(db_session, phone, "1", FakeLLM())
    asked = handle_turn(db_session, phone, "how much is a home visit?", FakeLLM())
    assert "travel charge for your area" in asked.before[0]["text"]
    assert asked.reply_text == consent.reply_text
    assert asked.interactive["type"] == "button"
    conversation, _ = _messages(db_session, new_patient)
    assert conversation.booking_context["triage_flow_state"] == "sr_consent"
    # Asked twice in a row: the step is asked again, not the previous answer
    again = handle_turn(db_session, phone, "and how much is each session?", FakeLLM())
    assert again.reply_text == consent.reply_text
    profile = handle_turn(db_session, phone, "I agree", FakeLLM())
    assert "What is your first name?" in profile.reply_text


def test_a_story_with_a_price_question_keeps_the_story(db_session, rh, new_patient, prices):
    from app.conversation.turn_handler import handle_turn

    text = "My knee hurts when I climb stairs, how much will it cost?"
    result = handle_turn(db_session, new_patient.phone_e164, text, FakeLLM())
    assert result.before[0]["text"].startswith("Chatting with me is free.")
    assert result.reply_text.startswith("Hi 👋 I'm Joy")
    conversation, messages = _messages(db_session, new_patient)
    assert conversation.booking_context["self_referral"]["opening_story"] == text
    assert messages[0] == ("user", text)


def test_warning_signs_lead_and_no_price_is_sent(db_session, rh, new_patient, prices):
    from app.conversation.turn_handler import handle_turn

    result = handle_turn(db_session, new_patient.phone_e164, "I have chest pain and can't breathe, how much is it?", FakeLLM())
    assert not result.before
    assert result.blocked_by_safety
    assert "emergency" in result.reply_text.lower()


def test_an_hmo_question_alerts_the_team(db_session, rh, new_patient, prices, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    alerts = []
    monkeypatch.setattr("app.conversation.turn_handler.route_escalation", lambda session, kind, payload: alerts.append((kind, payload)))
    handle_turn(db_session, new_patient.phone_e164, "Hi", FakeLLM())
    result = handle_turn(db_session, new_patient.phone_e164, "Do you accept AXA Mansard HMO?", FakeLLM())
    assert "HMO or insurance cover" in result.before[0]["text"]
    assert alerts and alerts[0][0] == "hmo" and "AXA" in alerts[0][1]["text"]


def test_the_older_flow_answers_then_welcomes(db_session, new_patient, prices, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    monkeypatch.delenv("JOY_SELF_REFERRAL_V2", raising=False)
    result = handle_turn(db_session, new_patient.phone_e164, LANDING, FakeLLM())
    assert result.before[0]["text"].startswith("Chatting with me is free.")
    assert result.reply_text.startswith("Hello 👋 Welcome to Rehabify.")
