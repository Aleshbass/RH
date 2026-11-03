"""A shared WhatsApp location pin: the right travel zone, and physios listed nearest first."""

import pytest

from app.conversation import interactive as interactive_mod
from app.booking import booking_flow
from app.conversation.interactive import interactive_for
from app.conversation.state_manager import load
from app.integrations import geocode
from app.integrations.geocode import Place
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.types import ExtractedTriage

CITIES = [
    {"city": "Lagos", "state": "Lagos", "zones": [
        {"name": "Lekki", "areas": ["Lekki", "Lekki Phase 1", "Ikate"]},
        {"name": "Lagos, other areas", "areas": ["*", "Epe"]},
    ]},
    {"city": "Abuja", "state": "FCT", "zones": [{"name": "Central Abuja", "areas": ["Wuse", "Maitama"]}]},
    {"city": "Ibadan", "state": "Oyo", "zones": [{"name": "Ibadan North", "areas": ["Bodija"]}]},
    {"city": "Oyo State", "state": "Oyo", "zones": [{"name": "Oyo State (outside Ibadan)", "areas": ["*", "Ogbomoso"]}]},
    {"city": "Rivers State", "state": "Rivers", "zones": [{"name": "Rivers State", "areas": ["*", "Port Harcourt"]}]},
]


@pytest.fixture
def pin(monkeypatch):
    found: dict = {}
    monkeypatch.setattr(booking_flow, "_service_areas", lambda patient, ctx: CITIES)
    monkeypatch.setattr(geocode, "place_for_pin", lambda lat, lng: found.get("place"))
    return found


@pytest.mark.parametrize(("place", "expected"), [
    (Place(state="Lagos", town="Lagos", area="Lekki Phase 1"), ("Lagos", "Lekki Phase 1")),
    (Place(state="Lagos", town="Lagos", area="Ilasamaja"), ("Lagos", "Ilasamaja")),
    (Place(state="FCT", town="Abuja", area="Wuse 2"), ("Abuja", "Wuse 2")),
    (Place(state="Oyo", town="Ibadan", area="Bodija"), ("Ibadan", "Bodija")),
    (Place(state="Oyo", town="Iseyin", area=None), ("Oyo State", "Iseyin")),
    (Place(state="Rivers", town="Port Harcourt", area="GRA Phase 2"), ("Rivers State", "GRA Phase 2")),
])
def test_a_pin_lands_in_the_right_zone(db_session, patient_identity, pin, place, expected):
    pin["place"] = place
    patient = db_session.get(Patient, patient_identity.person_id)
    assert booking_flow.place_from_pin(db_session, patient, {}, 6.45, 3.47) == expected
    assert (patient.lat, patient.lng) == (6.45, 3.47)


def test_state_names_from_the_geocoder_match_zone_states():
    assert geocode._state("Federal Capital Territory") == "FCT"
    assert geocode._state("Lagos State") == "Lagos"
    assert geocode._state("Akwa-Ibom") == "Akwa Ibom"
    assert geocode.in_nigeria(6.45, 3.47) and not geocode.in_nigeria(51.5, -0.12)


def test_pin_at_the_location_step_carries_on_the_booking(db_session, patient_identity, pin):
    pin["place"] = Place(state="Lagos", town="Lagos", area="Lekki Phase 1")
    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_substate = booking_flow.AWAITING_RH_LOCATION
    conversation.booking_context = {"rh_patient_id": "rh-1"}
    patient = db_session.get(Patient, patient_identity.person_id)
    text, reply = booking_flow.location_pin_turn(db_session, conversation, patient, 6.45, 3.47, has_story=True)
    assert (text, reply) == ("Lekki Phase 1, Lagos", None)
    assert conversation.booking_context["pin_place"] == "Lekki Phase 1, Lagos"


def test_unreadable_pin_at_the_location_step_asks_to_type(db_session, patient_identity, pin):
    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_substate = booking_flow.AWAITING_RH_LOCATION
    patient = db_session.get(Patient, patient_identity.person_id)
    text, reply = booking_flow.location_pin_turn(db_session, conversation, patient, 6.45, 3.47, has_story=True)
    assert text is None and "please type your area and city" in reply


def test_pin_sent_any_other_time_is_saved_for_later(db_session, patient_identity, pin, fake_llm):
    from app.conversation.turn_handler import handle_turn

    pin["place"] = Place(state="Oyo", town="Ibadan", area="Bodija")
    result = handle_turn(db_session, patient_identity.phone_e164, "", fake_llm, location=(7.43, 3.91))
    assert result.reply_text.startswith("Thanks, I've saved your location as Bodija, Ibadan.")
    assert "tell me what's going on" in result.reply_text
    patient = db_session.get(Patient, patient_identity.person_id)
    assert (patient.city, patient.area, patient.lat) == ("Ibadan", "Bodija", 7.43)


def test_location_step_offers_send_location_when_pins_can_be_read(db_session, patient_identity, monkeypatch):
    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_substate = booking_flow.AWAITING_RH_LOCATION
    conversation.booking_context = {}
    monkeypatch.setattr(interactive_mod, "pin_lookup_enabled", lambda: True)
    assert interactive_for(conversation) == {"type": "location_request_message", "action": {"name": "send_location"}}
    monkeypatch.setattr(interactive_mod, "pin_lookup_enabled", lambda: False)
    assert interactive_for(conversation)["type"] == "button"


def test_matches_show_how_far_each_physio_is(db_session, patient_identity, monkeypatch):
    from app.integrations.rh_client import RHMatch

    sent = {}

    class _FakeRH:
        def match_physios(self, **kwargs):
            sent.update(kwargs)
            return [
                RHMatch("p1", "Tolu", ["msk"], ["home_visit"], 1_400_000, [], distance_km=0.8),
                RHMatch("p2", "Chidi", ["msk"], ["home_visit"], 1_400_000, [], distance_km=7.4),
            ]

    monkeypatch.setattr(booking_flow, "configured_rh_client", lambda: _FakeRH())
    monkeypatch.setattr(booking_flow, "_current_assessment", lambda session, patient: "assessment-1")
    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_context = {"pin_place": "Lekki Phase 1, Lagos"}
    patient = db_session.get(Patient, patient_identity.person_id)
    patient.city, patient.area, patient.lat, patient.lng = "Lagos", "Lekki Phase 1", 6.45, 3.47
    reply = booking_flow._find_rh_matches(
        db_session, conversation, patient, ExtractedTriage(), mode="home_visit", rh_patient_id="rh-1", tags=["msk"],
    )
    assert reply.startswith("From your pin, you're in Lekki Phase 1, Lagos.")
    assert "1. Tolu — ₦14,000 · about 1 km away" in reply
    assert "2. Chidi — ₦14,000 · about 7 km away" in reply
    assert (sent["latitude"], sent["longitude"]) == (6.45, 3.47)
    rows = interactive_for(conversation)["action"]["sections"][0]["rows"]
    assert rows[1]["description"] == "₦14,000 · about 7 km away"
