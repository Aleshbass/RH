import httpx

from app.config import Settings
from app.queue import tasks


def _capture(monkeypatch, *, template: str, in_window: bool) -> dict:
    sent: dict = {}

    def fake_post(url, *, headers, json, timeout):
        sent.update(json)
        return httpx.Response(200, json={"messages": [{"id": "wamid.1"}]}, request=httpx.Request("POST", url))

    settings = Settings(
        whatsapp_access_token="token", whatsapp_phone_number_id="123",
        whatsapp_update_template=template, disable_whatsapp_delivery=False,
    )
    monkeypatch.setattr(tasks, "get_settings", lambda: settings)
    monkeypatch.setattr(tasks, "_in_service_window", lambda phone: in_window)
    monkeypatch.setattr(tasks.httpx, "post", fake_post)
    tasks.send_whatsapp_text("+2348012345678", "Reminder: your appointment\n\nstarts in 30 minutes.")
    return sent


def test_plain_text_inside_the_service_window(monkeypatch):
    sent = _capture(monkeypatch, template="joy_update", in_window=True)
    assert sent["type"] == "text"
    assert sent["text"]["body"].startswith("Reminder")


def test_template_outside_the_service_window_with_flattened_text(monkeypatch):
    sent = _capture(monkeypatch, template="joy_update", in_window=False)
    assert sent["type"] == "template"
    assert sent["template"]["name"] == "joy_update"
    parameter = sent["template"]["components"][0]["parameters"][0]["text"]
    assert parameter == "Reminder: your appointment starts in 30 minutes."


def test_without_a_template_behaviour_is_unchanged(monkeypatch):
    sent = _capture(monkeypatch, template="", in_window=False)
    assert sent["type"] == "text"
