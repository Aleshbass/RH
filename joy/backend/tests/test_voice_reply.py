"""A voice note back when the patient sends one (app/conversation/voice_reply.py). No database."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.conversation import voice_reply
from app.conversation.voice_reply import speakable, text_still_needed


def test_speakable_drops_links_and_formatting():
    spoken, dropped = speakable("Hi 👋 *Tolu*\n1️⃣ Back pain: ₦6,000.\n• Pay here: https://paystack.com/abc ✅")
    assert spoken == "Hi Tolu\n1. Back pain: 6,000 naira.\nPay here:"
    assert dropped  # the link must still go as text


def test_long_replies_are_cut_at_a_sentence():
    spoken, dropped = speakable("This is a sentence. " * 100)
    assert dropped and len(spoken) <= voice_reply.SPEAK_LIMIT and spoken.endswith(".")


@pytest.mark.parametrize("reply, interactive, safety, before, needed", [
    ("How are you feeling today?", None, False, [], False),
    ("Pick one", {"type": "button"}, False, [], True),
    ("Please go to hospital now.", None, True, [], True),
    ("Pay here: https://paystack.com/x", None, False, [], True),
    ("Thanks.", None, False, [{"text": "Choose", "interactive": {"type": "list"}}], True),
])
def test_when_the_text_still_goes(reply, interactive, safety, before, needed):
    assert text_still_needed(reply, interactive=interactive, blocked_by_safety=safety, before=before) is needed


@pytest.fixture
def whatsapp(monkeypatch):
    monkeypatch.setenv("WHATSAPP_ACCESS_TOKEN", "token")
    monkeypatch.setenv("WHATSAPP_PHONE_NUMBER_ID", "123")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("DISABLE_WHATSAPP_DELIVERY", "false")
    monkeypatch.delenv("JOY_VOICE_REPLIES", raising=False)
    monkeypatch.delenv("JOY_VOICE_REPLY_LANGUAGES", raising=False)
    monkeypatch.setattr("app.queue.tasks._in_service_window", lambda phone: True)
    monkeypatch.setattr("app.queue.tasks._localized", lambda phone, text: text)
    sent: list[dict] = []
    monkeypatch.setattr("app.queue.tasks._post_message", lambda settings, message: sent.append(message))
    calls: list[tuple[str, dict]] = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith("/audio/speech"):
            return SimpleNamespace(content=b"OggS" + b"\x00" * 400, raise_for_status=lambda: None)
        return SimpleNamespace(json=lambda: {"id": "media-1"}, raise_for_status=lambda: None)

    monkeypatch.setattr(voice_reply.httpx, "post", post)
    return SimpleNamespace(sent=sent, calls=calls)


def test_a_reply_is_spoken_and_sent_as_a_voice_note(whatsapp):
    assert voice_reply.send_voice_reply("+2348000000001", "Hello, *Ada*. How is your back today?", "en")
    speech = whatsapp.calls[0]
    assert speech[0] == "https://api.openai.com/v1/audio/speech"
    assert speech[1]["json"]["response_format"] == "opus"
    assert speech[1]["json"]["input"] == "Hello, Ada. How is your back today?"
    assert whatsapp.calls[1][1]["data"]["type"] == "audio/ogg"
    assert whatsapp.sent == [{"messaging_product": "whatsapp", "to": "2348000000001", "type": "audio", "audio": {"id": "media-1"}}]


def test_unapproved_languages_get_text(whatsapp):
    assert not voice_reply.send_voice_reply("+2348000000001", "Ẹ kú àárọ̀", "yo")
    assert whatsapp.calls == [] and whatsapp.sent == []


def test_a_speech_failure_sends_nothing(whatsapp, monkeypatch):
    def broken(url, **kwargs):
        raise OSError("down")

    monkeypatch.setattr(voice_reply.httpx, "post", broken)
    assert not voice_reply.send_voice_reply("+2348000000001", "Hello", "en")
    assert whatsapp.sent == []


# ---- the worker ----------------------------------------------------------------------------------

@pytest.fixture
def outbox(monkeypatch):
    from app.queue import worker

    box: list[tuple] = []
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda phone, text: box.append(("text", text)))
    monkeypatch.setattr(worker, "send_whatsapp_interactive", lambda phone, text, interactive, text_sender=None: box.append(("interactive", text)))
    monkeypatch.setattr(worker, "_send_items", lambda phone, items: box.extend(("item", item) for item in items or []))
    return box


def _result(**kwargs):
    return SimpleNamespace(language="en", before=None, blocked_by_safety=False, **kwargs)


def test_a_voice_note_gets_a_voice_note_only(outbox, monkeypatch):
    from app.queue import worker

    spoken = []
    monkeypatch.setattr("app.conversation.voice_reply.send_voice_reply", lambda phone, text, language: spoken.append(text) or True)
    worker._send_reply("+2348000000001", _result(), "How is your back today?", None, voice_in=True)
    assert spoken == ["How is your back today?"]
    assert outbox == []


def test_buttons_still_come_as_text_after_the_voice_note(outbox, monkeypatch):
    from app.queue import worker

    monkeypatch.setattr("app.conversation.voice_reply.send_voice_reply", lambda phone, text, language: True)
    worker._send_reply("+2348000000001", _result(), "Pick a time", {"type": "list"}, voice_in=True)
    assert outbox == [("interactive", "Pick a time")]


def test_text_when_the_voice_note_fails_or_they_typed(outbox, monkeypatch):
    from app.queue import worker

    tried = []
    monkeypatch.setattr("app.conversation.voice_reply.send_voice_reply", lambda phone, text, language: tried.append(text) or False)
    worker._send_reply("+2348000000001", _result(), "Hello", None, voice_in=True)
    worker._send_reply("+2348000000001", _result(), "Typed hello", None, voice_in=False)
    assert tried == ["Hello"]
    assert outbox == [("text", "Hello"), ("text", "Typed hello")]
