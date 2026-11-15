"""Safety gaps from the Nov 2026 audit: "no X but Y", English/Pidgin red flags anywhere in a chat,
model-raised flags in other languages, crisis messages, and warning signs from new numbers and
family members. No database needed."""
import pytest

from app.conversation import turn_handler as th
from app.models.types import ExtractedTriage
from app.safety import escalation
from app.safety.crisis import crisis_reply, detect_crisis
from app.safety.evaluator import evaluate
from app.safety.volunteered_red_flags import detect_volunteered_red_flags, model_raised_red_flags
from app.triage.self_referral import parse_red_flags

E = ExtractedTriage()


@pytest.mark.parametrize("text,items", [
    ("no chest pain but my legs are weak", {"2"}),
    ("no but the pain is very severe", {"4"}),
    ("No, but I no fit hold my urine", {"3"}),
    ("I no fit breathe well", {"1"}),
    ("no chest pain and my legs are weak", {"2"}),
])
def test_the_screen_never_reads_no_but_as_none(text, items):
    assert parse_red_flags(text, E) == ("positive", items)


@pytest.mark.parametrize("text", ["no", "none of these", "7", "no chest pain and no numbness", "nope none"])
def test_a_clean_no_still_clears_the_screen(text):
    assert parse_red_flags(text, E)[0] == "none"


def test_no_but_something_off_the_list_asks_which_number():
    assert parse_red_flags("no but my back hurts a lot", E)[0] == "unclear"


@pytest.mark.parametrize("text,flag", [
    ("I no fit hold my urine", "bladder_bowel_change"),
    ("I've been wetting the bed", "bladder_bowel_change"),
    ("my legs are weak", "bilateral_leg_weakness"),
    ("I can't breathe", "breathing_difficulty"),
    ("shortness of breath since morning", "breathing_difficulty"),
    ("I fainted this morning", "syncope"),
])
def test_warning_signs_anywhere_in_a_chat(text, flag):
    assert detect_volunteered_red_flags(text).get(flag) is True


@pytest.mark.parametrize("text", ["no chest pain", "I don't have a fever", "I haven't fainted", "my leg is a bit stiff"])
def test_denials_and_ordinary_complaints_are_not_flags(text):
    assert detect_volunteered_red_flags(text) == {}


@pytest.mark.parametrize("flag", ["breathing_difficulty", "syncope", "chest_pain", "bladder_bowel_change"])
def test_each_new_flag_stops_the_booking(flag):
    assert evaluate(E.model_copy(update={"flags": {flag: True}})).fired


def test_the_model_can_raise_a_flag_only_outside_english_and_never_clear_one():
    assert model_raised_red_flags({"flags": {"chest_pain": True}}, "yo") == {"chest_pain": True}
    assert model_raised_red_flags({"flags": {"chest_pain": True}}, "en") == {}
    assert model_raised_red_flags({"flags": {"chest_pain": False, "made_up": True}}, "ha") == {}
    assert model_raised_red_flags(None, "ig") == {}


@pytest.mark.parametrize("text,kind", [
    ("I want to kill myself", "self_harm"),
    ("I no wan live again", "self_harm"),
    ("sometimes I think about suicide", "self_harm"),
    ("my husband beats me", "abuse"),
    ("I am being abused at home", "abuse"),
])
def test_crisis_is_detected(text, kind):
    assert detect_crisis(text) == kind


@pytest.mark.parametrize("text", ["this pain is killing me", "I'm not suicidal", "I hit my knee on the table"])
def test_crisis_false_alarms(text):
    assert detect_crisis(text) is None


def test_crisis_replies_give_112_and_vetted_helplines_only_when_set():
    assert "112" in crisis_reply("self_harm") and "112" in crisis_reply("abuse")
    assert crisis_reply("self_harm").count("\n\n") == crisis_reply("self_harm", "").count("\n\n")
    assert crisis_reply("self_harm", "Helpline: 0800 000 0000").endswith("Helpline: 0800 000 0000")


def test_every_emergency_instruction_names_112():
    assert "112" in escalation._RED_INSTRUCTION and "112" in escalation._ORANGE_INSTRUCTION


@pytest.fixture
def quiet(monkeypatch):
    alerts = []
    monkeypatch.setattr(th, "resolve", lambda *a: None)
    monkeypatch.setattr(th, "route_escalation", lambda session, kind, payload: alerts.append((kind, payload)))
    monkeypatch.setattr(th, "append", lambda *a, **k: None)

    from app.integrations.rh_client import RHIntegrationError

    class NoRH:
        def operational_query(self, *a, **k):
            raise RHIntegrationError("DEPENDENCY_UNAVAILABLE", "offline")

    monkeypatch.setattr(th, "configured_rh_client", lambda: NoRH())
    return alerts


def test_a_crisis_from_anyone_is_answered_first_and_the_care_team_told(quiet):
    result = th.handle_turn(None, "+2348030000000", "I want to end my life", llm=None)
    assert "112" in result.reply_text
    assert quiet and quiet[0][0] == "crisis" and quiet[0][1]["kind"] == "self_harm"


def test_a_warning_sign_from_a_new_number_gets_urgent_care_not_a_chat(quiet):
    result = th.handle_turn(None, "+2348030000000", "My dad collapsed and can't talk well", llm=None)
    assert "112" in result.reply_text
    assert quiet and quiet[0][0] == "safety"
