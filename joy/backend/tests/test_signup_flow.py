"""The WhatsApp sign-up form: building it, offering it, and saving what comes back."""

import hashlib
import hmac
import json
import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.config import Settings
from app.flows.signup import parse_answers, resolve_location, rh_payload
from app.flows.signup_flow import MAX_DROPDOWN_ROWS, build_signup_flow, signup_flow_message
from app.integrations.rh_client import RHIntegrationError
from app.models.patient import Patient
from app.models.rh_identity_mapping import RHIdentityMapping

CITIES = [
    {"city": "Lagos", "state": "Lagos", "zones": [
        {"name": "Lekki", "areas": ["Lekki", "Lekki Phase 1", "Chevron"]},
        {"name": "Ikeja & Ogba", "areas": ["Ikeja", "Ogba"]},
        {"name": "Lagos, other areas", "areas": ["*", "Epe", "Badagry"]},
    ]},
    {"city": "Abuja", "state": "FCT", "zones": [
        {"name": "Central Abuja", "areas": ["Wuse", "Maitama"]},
        {"name": "Abuja, other areas", "areas": ["*"]},
    ]},
    {"city": "Ibadan", "state": "Oyo", "zones": [
        {"name": "Bodija", "areas": ["Bodija", "UI"]},
        {"name": "Ibadan, other areas", "areas": ["*"]},
    ]},
    {"city": "Oyo State", "state": "Oyo", "zones": [{"name": "Oyo State (outside Ibadan)", "areas": ["*", "Ogbomoso", "Oyo"]}]},
    {"city": "Kano State", "state": "Kano", "zones": [{"name": "Kano State", "areas": ["*", "Kano", "Wudil"]}]},
]

# Component label limits from the WhatsApp Flows reference
_LABEL_LIMITS = {"TextInput": 20, "TextArea": 20, "Dropdown": 20, "RadioButtonsGroup": 30, "CheckboxGroup": 30, "OptIn": 120}


def _children(flow, screen_id):
    screen = next(s for s in flow["screens"] if s["id"] == screen_id)
    return screen["layout"]["children"]


def test_form_has_three_screens_and_ends_with_complete():
    flow = build_signup_flow(CITIES)
    assert [s["id"] for s in flow["screens"]] == ["ABOUT_YOU", "WHERE_YOU_ARE", "HEALTH_AND_CONSENT"]
    assert flow["screens"][-1]["terminal"] is True
    footer = _children(flow, "HEALTH_AND_CONSENT")[-1]
    payload = footer["on-click-action"]["payload"]
    assert footer["on-click-action"]["name"] == "complete"
    for key in ("first_name", "date_of_birth", "state", "town", "accept_terms", "area_lagos", "area_fct", "area_oyo"):
        assert key in payload
    assert "area_kano" not in payload  # one zone for the whole state: the town box is enough


def test_labels_and_lists_fit_whatsapp_limits():
    flow = build_signup_flow(CITIES)
    for screen in flow["screens"]:
        for child in screen["layout"]["children"]:
            limit = _LABEL_LIMITS.get(child["type"])
            if limit:
                assert len(child["label"]) <= limit, child["label"]
            for row in child.get("data-source") or []:
                assert len(row["title"]) <= 30
    states = next(c for c in _children(flow, "WHERE_YOU_ARE") if c.get("name") == "state")["data-source"]
    assert [row["id"] for row in states[:2]] == ["Lagos", "FCT"]
    lagos = next(c for c in _children(flow, "WHERE_YOU_ARE") if c.get("name") == "area_lagos")
    assert lagos["visible"] == "`${form.state} == 'Lagos'`"
    assert {"id": "*|Lagos", "title": "Other area in Lagos"} in lagos["data-source"]
    oyo = next(c for c in _children(flow, "WHERE_YOU_ARE") if c.get("name") == "area_oyo")
    assert {"id": "*|Oyo State", "title": "Elsewhere in Oyo State"} in oyo["data-source"]


def test_a_city_with_too_many_areas_lists_its_zones_and_keeps_other_areas():
    huge = [{"city": "Lagos", "state": "Lagos", "zones": [
        {"name": f"Zone {z}", "areas": [f"Area {z}-{a}" for a in range(30)]} for z in range(9)
    ] + [{"name": "Lagos, other areas", "areas": ["*"]}]}]
    flow = build_signup_flow(huge)
    rows = next(c for c in _children(flow, "WHERE_YOU_ARE") if c.get("name") == "area_lagos")["data-source"]
    assert len(rows) <= MAX_DROPDOWN_ROWS
    assert rows[0] == {"id": "Area 0-0|Lagos", "title": "Zone 0"}
    assert rows[-1]["id"] == "*|Lagos"


def test_flow_message_uses_draft_mode_only_when_asked():
    published = signup_flow_message("42", "signup:abc")
    assert published["type"] == "flow"
    assert published["action"]["parameters"]["flow_cta"] == "Get started"
    assert "mode" not in published["action"]["parameters"]
    assert signup_flow_message("42", "signup:abc", mode="draft")["action"]["parameters"]["mode"] == "draft"


def test_answers_are_cleaned_and_bounded():
    answers = parse_answers({
        "first_name": "  ada ", "last_name": "OKONKWO", "gender": "female", "date_of_birth": "1990-11-04",
        "email": "Ada@Example.com", "state": "Lagos", "area_lagos": "Lekki|Lagos", "area_fct": "",
        "health_conditions": ["none", "diabetes"], "other_conditions": "Metformin", "accept_terms": True,
        "flow_token": "signup:x",
    }, today=date(2026, 11, 3))
    assert answers["first_name"] == "Ada" and answers["last_name"] == "Okonkwo"
    assert answers["age"] == 35  # birthday tomorrow
    assert answers["email"] == "ada@example.com"
    assert answers["area_pick"] == "Lekki|Lagos"
    assert answers["conditions"] == ["diabetes"]
    assert answers["accepted_terms"] is True
    bad = parse_answers({"email": "x@y", "date_of_birth": "2099-01-01", "gender": "robot"}, today=date(2026, 11, 3))
    assert bad["email"] is None and bad["date_of_birth"] is None and bad["gender"] is None


@pytest.mark.parametrize(("answers", "expected"), [
    ({"state": "Lagos", "area_pick": "Lekki|Lagos", "town": None}, ("Lagos", "Lekki")),
    ({"state": "Lagos", "area_pick": "*|Lagos", "town": "Ikorodu"}, ("Lagos", "Ikorodu")),
    ({"state": "Kano", "area_pick": None, "town": "Wudil"}, ("Kano State", "Wudil")),
    ({"state": "Kano", "area_pick": None, "town": None}, ("Kano State", None)),
    ({"state": "Oyo", "area_pick": None, "town": "Ogbomoso"}, ("Oyo State", "Ogbomoso")),
    ({"state": "Oyo", "area_pick": None, "town": "somewhere"}, (None, "somewhere")),
])
def test_location_comes_from_the_area_or_the_town(answers, expected):
    assert resolve_location(answers, CITIES) == expected


def test_location_without_rehabify_uses_the_zone_city_names():
    assert resolve_location({"state": "FCT", "area_pick": None, "town": "Kubwa"}, []) == ("Abuja", "Kubwa")
    assert resolve_location({"state": "Rivers", "area_pick": None, "town": None}, []) == ("Rivers State", None)


def test_rh_payload_drops_empty_fields_and_keeps_the_consent_flag():
    answers = parse_answers({"first_name": "Ada", "health_conditions": ["other"], "accept_terms": "true"})
    payload = rh_payload(answers, "Lagos", None)
    assert payload == {"first_name": "Ada", "city": "Lagos", "accepted_terms": True}


class _FakeRH:
    def __init__(self, *, fail=False):
        self.fail = fail
        self.calls: list[tuple[str, dict]] = []

    def service_areas(self, *, actor):
        return {"cities": CITIES}

    def operational_query(self, operation, *, actor, data):
        self.calls.append((operation, data))
        return {"consents_required": [
            {"policy_id": "terms", "version": "2026-10-28"}, {"policy_id": "privacy", "version": "2026-10-28"},
        ]}

    def operational_mutation(self, operation, *, actor, data, idempotency_key):
        if self.fail:
            raise RHIntegrationError("DEPENDENCY_UNAVAILABLE", "down", retryable=True)
        self.calls.append((operation, data))
        return {"updated": True}


@pytest.fixture
def mapped_patient(db_session):
    patient = Patient(phone_e164=f"+234810{uuid.uuid4().int % 10**7:07d}")
    db_session.add(patient)
    db_session.flush()
    db_session.add(RHIdentityMapping(persona="patient", joy_person_id=patient.id, rh_record_id="rh-patient-1"))
    db_session.flush()
    return patient


_FORM = {
    "form": "signup_v1", "first_name": "Ada", "last_name": "Okonkwo", "gender": "female",
    "date_of_birth": "1990-05-01", "email": "ada@example.com", "state": "Lagos",
    "area_lagos": "Lekki|Lagos", "town": "", "health_conditions": ["high_blood_pressure"],
    "other_conditions": "", "accept_terms": True, "flow_token": "signup:test",
}


def test_completed_form_is_saved_in_joy_and_rehabify(db_session, mapped_patient, fake_llm, monkeypatch):
    from app.queue.worker import process_inbound

    fake = _FakeRH()
    monkeypatch.setattr("app.flows.signup.configured_rh_client", lambda: fake)
    result = process_inbound(db_session, f"wamid.flow.{uuid.uuid4()}", mapped_patient.phone_e164, "", fake_llm, flow_response=_FORM)

    assert result.reply_text.startswith("Thanks, Ada. Your Rehabify profile is set up. I have you in Lekki, Lagos.")
    db_session.refresh(mapped_patient)
    assert mapped_patient.name == "Ada Okonkwo"
    assert (mapped_patient.city, mapped_patient.area, mapped_patient.state) == ("Lagos", "Lekki", "Lagos")
    assert mapped_patient.email == "ada@example.com" and mapped_patient.gender == "female"
    assert mapped_patient.signup_completed_at is not None and mapped_patient.signup_pending_rh is None
    ops = [name for name, _ in fake.calls]
    assert ops == ["patient_update_profile", "patient_consent_status", "patient_record_consents"]
    profile = fake.calls[0][1]
    assert profile["patient_id"] == "rh-patient-1"
    assert profile["health_conditions"] == ["High blood pressure"]
    assert "accepted_terms" not in profile
    assert fake.calls[2][1]["accepted"] == {"terms": "2026-10-28", "privacy": "2026-10-28"}


def test_answers_wait_and_retry_when_rehabify_is_down(db_session, mapped_patient, fake_llm, monkeypatch):
    from app.flows.signup import apply_signup_response, sync_pending_signup

    fake = _FakeRH(fail=True)
    monkeypatch.setattr("app.flows.signup.configured_rh_client", lambda: fake)
    result = apply_signup_response(db_session, mapped_patient.phone_e164, _FORM, f"wamid.flow.{uuid.uuid4()}")
    assert result.reply_text.startswith("Thanks, Ada.")
    db_session.refresh(mapped_patient)
    assert mapped_patient.signup_pending_rh["first_name"] == "Ada"

    fake.fail = False
    assert sync_pending_signup(db_session, mapped_patient.phone_e164) is True
    db_session.refresh(mapped_patient)
    assert mapped_patient.signup_pending_rh is None
    assert [name for name, _ in fake.calls][:1] == ["patient_update_profile"]


def _form_settings(monkeypatch, flow_id="9001", testers="+2348000004001, +234810"):
    settings = Settings(whatsapp_signup_flow_id=flow_id, whatsapp_signup_flow_mode="draft", whatsapp_signup_flow_testers=testers)
    monkeypatch.setattr("app.flows.signup.get_settings", lambda: settings)


def test_a_draft_form_goes_only_to_testers(monkeypatch):
    from app.flows.signup import signup_form_enabled

    _form_settings(monkeypatch, testers="+234 800 000 4001")
    assert signup_form_enabled("+2348000004001") is True
    assert signup_form_enabled("+2348099999999") is False
    settings = Settings(whatsapp_signup_flow_id="9001", whatsapp_signup_flow_mode="published")
    monkeypatch.setattr("app.flows.signup.get_settings", lambda: settings)
    assert signup_form_enabled("+2348099999999") is True


def test_the_first_hello_carries_the_get_started_button(db_session, mapped_patient, fake_llm, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    _form_settings(monkeypatch, testers=mapped_patient.phone_e164)
    result = handle_turn(db_session, mapped_patient.phone_e164, "Hi", fake_llm)
    assert "Tap *Get started*" in result.reply_text
    assert result.interactive["type"] == "flow"
    params = result.interactive["action"]["parameters"]
    assert params["flow_id"] == "9001" and params["mode"] == "draft"
    assert params["flow_token"].startswith("signup:")


def test_no_button_without_a_configured_form(db_session, mapped_patient, fake_llm, monkeypatch):
    from app.conversation.turn_handler import handle_turn

    _form_settings(monkeypatch, flow_id="")
    result = handle_turn(db_session, mapped_patient.phone_e164, "Hi", fake_llm)
    assert result.interactive is None
    assert "no need to fill out a form" in result.reply_text


@pytest.mark.parametrize("text", ["sign up", "Register", "update my details", "create an account"])
def test_typing_sign_up_sends_the_form(db_session, mapped_patient, fake_llm, monkeypatch, text):
    from app.conversation.turn_handler import handle_turn

    _form_settings(monkeypatch, testers=mapped_patient.phone_e164)
    result = handle_turn(db_session, mapped_patient.phone_e164, text, fake_llm)
    assert result.interactive is not None and result.interactive["type"] == "flow"
    assert "Get started" in result.reply_text


def _sign(body: bytes, secret: str = "test-secret") -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def test_webhook_queues_a_completed_form(client, monkeypatch):
    queued = []
    monkeypatch.setattr("app.api.webhooks.whatsapp.enqueue_inbound", lambda *a, **k: queued.append((a, k)))
    message = {
        "from": "2348000004999", "id": "wamid.nfm.1", "type": "interactive",
        "interactive": {"type": "nfm_reply", "nfm_reply": {"name": "flow", "body": "Sent", "response_json": json.dumps(_FORM)}},
    }
    body = json.dumps({"entry": [{"changes": [{"value": {"messages": [message]}}]}]}).encode()
    response = client.post("/webhook", content=body, headers={"Content-Type": "application/json", "X-Hub-Signature-256": _sign(body)})
    assert response.status_code == 200
    assert queued == [(("wamid.nfm.1", "+2348000004999", ""), {"flow_response": _FORM})]


def test_booking_offers_the_email_from_the_form(db_session, mapped_patient):
    from app.booking.booking_flow import AWAITING_RH_PAYMENT_EMAIL, _continue_rh_payment_email
    from app.conversation.interactive import interactive_for
    from app.models.conversation import Conversation
    from app.models.types import PatientPhase, Persona

    conversation = Conversation(
        person_id=mapped_patient.id, persona=Persona.PATIENT, phase=PatientPhase.FIRST_CONTACT, stage="story_capture",
        booking_substate=AWAITING_RH_PAYMENT_EMAIL,
        booking_context={"suggested_email": "ada@example.com"},
    )
    db_session.add(conversation)
    db_session.flush()
    assert interactive_for(conversation)["action"]["buttons"][0]["reply"]["title"] == "Yes, use that email"
    # "yes" uses the suggested address; without a booking it stops before payment
    reply = _continue_rh_payment_email(db_session, conversation, mapped_patient, "Yes")
    assert "refresh your booking details" in reply
    assert "Reply YES to use ada@example.com" in _continue_rh_payment_email(db_session, conversation, mapped_patient, "maybe")
