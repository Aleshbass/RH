"""Home-visit location anywhere in Nigeria: Lagos / Abuja / Other state, then the right areas."""

import pytest

from app.conversation import interactive as interactive_mod  # noqa: F401  (Joy's import order)
from app.booking import booking_flow
from app.conversation.interactive import interactive_for
from app.conversation.state_manager import load
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.types import ExtractedTriage

AREAS = {"cities": [
    {"city": "Lagos", "state": "Lagos", "zones": [
        {"name": "Lekki", "areas": ["Lekki", "Ikate", "Osapa"]},
        {"name": "Ikeja & Ogba", "areas": ["Ikeja", "Ogba"]},
        {"name": "Lagos, other areas", "areas": ["*", "Epe"]},
    ]},
    {"city": "Ibadan", "state": "Oyo", "zones": [
        {"name": "Ibadan North", "areas": ["Bodija", "Agodi"]},
        {"name": "Ibadan, other areas", "areas": ["*"]},
    ]},
    {"city": "Oyo State", "state": "Oyo", "zones": [{"name": "Oyo State (outside Ibadan)", "areas": ["*", "Ogbomoso"]}]},
    {"city": "Ondo State", "state": "Ondo", "zones": [{"name": "Ondo State", "areas": ["*", "Akure", "Owo"]}]},
]}


class _FakeRH:
    def __init__(self, areas):
        self.areas = areas
        self.saved: list[tuple[str, str]] = []

    def service_areas(self, *, actor):
        return self.areas

    def update_patient_location(self, patient_id, *, city, area, actor):
        self.saved.append((city, area))


@pytest.fixture
def setup(db_session, patient_identity, monkeypatch):
    state = load(db_session, patient_identity)
    conversation = db_session.get(Conversation, state.conversation_id)
    conversation.booking_substate = booking_flow.AWAITING_RH_LOCATION
    conversation.booking_context = {"rh_patient_id": "rh-1", "service_mode": "home_visit", "required_specialties": ["msk"]}
    db_session.flush()
    fake = _FakeRH(AREAS)
    monkeypatch.setattr(booking_flow, "configured_rh_client", lambda: fake)
    monkeypatch.setattr(booking_flow, "_find_rh_matches", lambda *args, **kw: "MATCHES")
    patient = db_session.get(Patient, patient_identity.person_id)

    def say(text):
        return booking_flow._continue_rh_location(db_session, conversation, patient, ExtractedTriage(), text)

    return conversation, fake, say


def _rows(conversation):
    return interactive_for(conversation)["action"]["sections"][0]["rows"]


def test_lagos_tap_then_an_area_from_the_list(setup):
    conversation, fake, say = setup
    assert [b["reply"]["id"] for b in interactive_for(conversation)["action"]["buttons"]] == ["Lagos", "Abuja", "other state"]
    assert say("Lagos").startswith("Which part of Lagos")
    rows = _rows(conversation)
    assert rows[0]["id"] == "Lekki, Lagos" and rows[-1] == {"id": "Epe, Lagos", "title": "Lagos, other areas", "description": "Epe"}
    assert say(rows[0]["id"]) == "MATCHES" and fake.saved == [("Lagos", "Lekki")]
    assert "location_zones" not in conversation.booking_context


def test_area_typed_after_choosing_the_city(setup):
    conversation, fake, say = setup
    say("lagos")
    assert say("Ikate") == "MATCHES" and fake.saved == [("Lagos", "Ikate")]


def test_other_state_then_a_state_with_one_zone_asks_for_the_town(setup):
    conversation, fake, say = setup
    assert "Which state or town" in say("Other state")
    assert interactive_for(conversation) is None  # waiting for typing
    assert say("Ondo State") == "Which town or area in Ondo State are you in (for example, Akure)?"
    assert interactive_for(conversation) is None
    assert say("Owo") == "MATCHES" and fake.saved == [("Ondo State", "Owo")]


def test_a_town_typed_goes_straight_to_its_state_zone(setup):
    conversation, fake, say = setup
    say("other state")
    assert say("Akure") == "MATCHES" and fake.saved == [("Ondo State", "Akure")]


def test_a_state_with_several_zones_lists_them_all(setup):
    conversation, fake, say = setup
    say("Other state")
    assert say("Oyo").startswith("Which part of Oyo")
    ids = [row["id"] for row in _rows(conversation)]
    assert ids == ["Bodija, Ibadan", "Other areas, Ibadan", "Ogbomoso, Oyo State"]
    assert say("Ogbomoso") == "MATCHES" and fake.saved == [("Oyo State", "Ogbomoso")]


def test_an_unknown_place_offers_online(setup):
    conversation, fake, say = setup
    say("other state")
    reply = say("Atlantis")
    assert "couldn’t find that place" in reply and "Online" in reply
    assert conversation.booking_substate == booking_flow.AWAITING_RH_SERVICE_MODE


def test_typed_area_and_city_still_works(setup):
    conversation, fake, say = setup
    assert say("Lekki Phase 1, Lagos") == "MATCHES" and fake.saved == [("Lagos", "Lekki Phase 1")]
