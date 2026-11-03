"""Home-visit location in two taps: city buttons, then that city's travel-zone areas as a list."""

import pytest

from app.conversation import interactive as interactive_mod  # noqa: F401  (Joy's import order)
from app.booking import booking_flow
from app.conversation.interactive import interactive_for
from app.conversation.state_manager import load
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.types import ExtractedTriage

LAGOS = {"cities": [{"city": "Lagos", "state": "Lagos", "zones": [
    {"name": "Lekki", "areas": ["Lekki", "Ikate", "Osapa"]},
    {"name": "Ikeja & Ogba", "areas": ["Ikeja", "Ogba"]},
]}]}


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
    fake = _FakeRH(LAGOS)
    matched: list[tuple[str, str]] = []
    monkeypatch.setattr(booking_flow, "configured_rh_client", lambda: fake)
    monkeypatch.setattr(
        booking_flow, "_find_rh_matches",
        lambda session, conversation, patient, extracted, **kw: matched.append((patient.city, patient.area)) or "MATCHES",
    )
    patient = db_session.get(Patient, patient_identity.person_id)
    patient.city = patient.area = None

    def say(text):
        return booking_flow._continue_rh_location(db_session, conversation, patient, ExtractedTriage(), text)

    return conversation, fake, matched, say


def test_city_buttons_first_then_the_city_areas_as_a_list(setup):
    conversation, fake, matched, say = setup
    assert [b["reply"]["id"] for b in interactive_for(conversation)["action"]["buttons"]] == ["Lagos", "Abuja", "other city"]

    assert say("Lagos").startswith("Which part of Lagos")
    rows = interactive_for(conversation)["action"]["sections"][0]["rows"]
    assert rows[0] == {"id": "Lekki, Lagos", "title": "Lekki", "description": "Lekki, Ikate, Osapa"}

    assert say(rows[0]["id"]) == "MATCHES"
    assert fake.saved == [("Lagos", "Lekki")] and matched == [("Lagos", "Lekki")]
    assert "location_zones" not in conversation.booking_context


def test_an_area_typed_after_choosing_the_city(setup):
    conversation, fake, matched, say = setup
    say("lagos")
    assert say("Ikate") == "MATCHES"
    assert fake.saved == [("Lagos", "Ikate")]


def test_other_city_moves_to_online_or_clinic(setup):
    conversation, fake, matched, say = setup
    reply = say("Other city")
    assert "Lagos and Abuja" in reply and "Online" in reply
    assert conversation.booking_substate == booking_flow.AWAITING_RH_SERVICE_MODE


def test_a_city_without_zones_offers_online(setup):
    conversation, fake, matched, say = setup
    fake.areas = {"cities": []}
    reply = say("Abuja")
    assert "aren’t available in Abuja yet" in reply
    assert conversation.booking_substate == booking_flow.AWAITING_RH_SERVICE_MODE


def test_typed_area_and_city_still_works(setup):
    conversation, fake, matched, say = setup
    assert say("Lekki Phase 1, Lagos") == "MATCHES"
    assert fake.saved == [("Lagos", "Lekki Phase 1")]
