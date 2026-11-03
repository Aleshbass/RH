"""Tap-to-answer buttons and lists: what Joy shows, what a tap sends back, and the fallbacks."""

from types import SimpleNamespace

import httpx
import pytest

from app.api.webhooks.whatsapp import _tapped_reply
from app.booking.booking_flow import (
    AWAITING_POLICY_ACCEPTANCE,
    AWAITING_RH_PROVIDER,
    AWAITING_RH_SERVICE_MODE,
    AWAITING_RH_SLOT,
    AWAITING_TREATMENT_OPTION,
    _treatment_option,
)
from app.config import Settings
from app.conversation.interactive import interactive_for, slot_label
from app.queue import tasks


def _conversation(step=None, **context):
    return SimpleNamespace(booking_substate=step, booking_context=context)


def _ids(interactive):
    if interactive["type"] == "button":
        return [b["reply"]["id"] for b in interactive["action"]["buttons"]]
    return [row["id"] for row in interactive["action"]["sections"][0]["rows"]]


def test_each_fixed_answer_step_gets_buttons_whose_ids_are_the_typed_replies():
    assert _ids(interactive_for(_conversation(AWAITING_POLICY_ACCEPTANCE))) == ["I agree", "no"]
    assert _ids(interactive_for(_conversation(AWAITING_RH_SERVICE_MODE))) == ["online", "home visit", "clinic"]
    options = _ids(interactive_for(_conversation(AWAITING_TREATMENT_OPTION)))
    assert [_treatment_option(option) for option in options] == ["quick_initial", "full_virtual", "home_visit", "quick_initial"]
    assert _ids(interactive_for(_conversation(triage_flow_state="awaiting_summary_confirmation"))) == ["yes", "no"]
    assert _ids(interactive_for(_conversation(triage_flow_state="awaiting_additional_details"))) == ["no", "yes"]
    assert interactive_for(_conversation()) is None
    assert interactive_for(None) is None


def test_physio_and_time_choices_are_numbered_lists_from_the_stored_options():
    providers = [{"display_name": "Ada Okafor", "amount_kobo": 600_000}, {"display_name": "Tunde Bello", "amount_kobo": 600_000}]
    menu = interactive_for(_conversation(AWAITING_RH_PROVIDER, providers=providers))
    rows = menu["action"]["sections"][0]["rows"]
    assert [r["id"] for r in rows] == ["1", "2"] and rows[0]["title"] == "Ada Okafor" and rows[0]["description"] == "₦6,000"

    start = 1_790_000_000_000
    menu = interactive_for(_conversation(AWAITING_RH_SLOT, slots=[{"start": start}]))
    assert menu["action"]["sections"][0]["rows"][0] == {"id": "1", "title": slot_label(start), "description": "Lagos time"}


def test_slot_labels_are_lagos_time_and_fit_a_list_row():
    # 11:00 UTC is 12:00 in Lagos
    label = slot_label(1_790_074_800_000)  # 2026-09-22 11:00 UTC
    assert label.endswith("12:00 PM") and len(label) <= 24


@pytest.mark.parametrize(("message", "expected"), [
    ({"type": "interactive", "interactive": {"type": "button_reply", "button_reply": {"id": "I agree", "title": "I agree"}}}, "I agree"),
    ({"type": "interactive", "interactive": {"type": "list_reply", "list_reply": {"id": "2", "title": "Full virtual consult"}}}, "2"),
    ({"type": "button", "button": {"payload": "LINK", "text": "Link my account"}}, "LINK"),
    ({"type": "interactive", "interactive": {"type": "nfm_reply", "nfm_reply": {"response_json": "{}"}}}, ""),
])
def test_a_tap_becomes_the_reply_it_stands_for(message, expected):
    assert _tapped_reply(message) == expected


def _send(monkeypatch, *, in_window=True, body="Choose one", fail=False):
    posted: list[dict] = []
    texts: list[str] = []

    def fake_post(url, *, headers, json, timeout):
        posted.append(json)
        if fail:
            return httpx.Response(400, request=httpx.Request("POST", url))
        return httpx.Response(200, json={}, request=httpx.Request("POST", url))

    settings = Settings(whatsapp_access_token="token", whatsapp_phone_number_id="123", disable_whatsapp_delivery=False)
    monkeypatch.setattr(tasks, "get_settings", lambda: settings)
    monkeypatch.setattr(tasks, "_in_service_window", lambda phone: in_window)
    monkeypatch.setattr(tasks.httpx, "post", fake_post)
    buttons = interactive_for(_conversation(AWAITING_POLICY_ACCEPTANCE))
    tasks.send_whatsapp_interactive("+2348012345678", body, buttons, text_sender=lambda phone, text: texts.append(text))
    return posted, texts


def test_buttons_go_out_inside_the_service_window(monkeypatch):
    posted, texts = _send(monkeypatch)
    assert posted[0]["type"] == "interactive" and posted[0]["interactive"]["body"]["text"] == "Choose one"
    assert texts == []


@pytest.mark.parametrize("case", ["outside_window", "rejected"])
def test_plain_text_fallback_never_loses_the_reply(monkeypatch, case):
    posted, texts = _send(monkeypatch, in_window=case != "outside_window", fail=case == "rejected")
    assert texts == ["Choose one"]


def test_a_long_message_goes_first_then_the_buttons_under_a_short_prompt(monkeypatch):
    posted, texts = _send(monkeypatch, body="x" * 1100)
    assert texts == ["x" * 1100]
    assert posted[0]["interactive"]["body"]["text"].startswith("Tap an option")


def test_initial_consultation_is_clearly_online_only():
    import app.conversation  # noqa: F401  (Joy's import order)
    from app.booking.booking_flow import initial_consultation_offer, treatment_options_prompt

    offer = initial_consultation_offer().lower()
    assert "online video call, not a home visit" in offer and "nobody will come to your house" in offer
    menu = treatment_options_prompt("Knee pain.")
    assert "₦6,000 (online only)" in menu and "(in person)" in menu


def test_no_buttons_on_safety_replies():
    from app.queue.worker import _interactive_reply

    assert _interactive_reply(None, "+2348012345678", SimpleNamespace(blocked_by_safety=True)) is None
    assert _interactive_reply(None, "+2348012345678", None) is None
