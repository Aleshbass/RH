"""A physio's voice note sent with a home programme reaches the patient on WhatsApp (16 Nov 2026).

No Redis, database or network: settings, the 24-hour window and the Graph API are stand-ins.
"""
import json
from types import SimpleNamespace

from app.api.internal.rh_events import programme_sent_text
from app.queue import tasks, voice_notes, worker

STORAGE = "https://adept-horse-443.convex.cloud/api/storage/0b1c2d3e-aaaa-bbbb-cccc-123456789abc"


def _settings(**overrides):
    base = dict(disable_whatsapp_delivery=False, whatsapp_access_token="token", whatsapp_phone_number_id="123", joy_environment="test")
    base.update(overrides)
    return SimpleNamespace(**base)


def _wire(monkeypatch, *, window=True, ffmpeg=False):
    posted = []
    monkeypatch.setattr(voice_notes, "get_settings", lambda: _settings())
    monkeypatch.setattr(tasks, "_in_service_window", lambda phone: window)
    monkeypatch.setattr(tasks, "_post_message", lambda settings, message: posted.append(message) or "wamid.1")
    monkeypatch.setattr(voice_notes.shutil, "which", lambda name: "/usr/bin/ffmpeg" if ffmpeg else None)
    return posted


def test_the_programme_message_mentions_the_voice_note():
    text = programme_sent_text(
        {"sender_name": "Bisi Okafor", "title": "Knee programme", "change": "new", "voice_note_url": STORAGE},
        reminders_on=True,
    )
    assert text.startswith("🏋️ Bisi Okafor sent you a new home programme: *Knee programme*.")
    assert "🎧 Bisi Okafor also left you a voice note." in text
    without = programme_sent_text({"sender_name": "Bisi", "title": "Knee", "change": "new"}, reminders_on=True)
    assert "voice note" not in without


def test_only_rh_storage_links_are_fetched():
    assert voice_notes.allowed_audio_url(STORAGE)
    assert voice_notes.allowed_audio_url("https://adept-horse-443.convex.site/files/x")
    assert not voice_notes.allowed_audio_url("http://adept-horse-443.convex.cloud/api/storage/x")
    assert not voice_notes.allowed_audio_url("https://evil.example.com/a.mp3")
    assert not voice_notes.allowed_audio_url("https://convex.cloud.evil.com/a.mp3")
    assert not voice_notes.allowed_audio_url(None)


def test_an_mp4_voice_note_goes_by_link(monkeypatch):
    posted = _wire(monkeypatch)
    assert voice_notes.send_programme_voice_note("+2348030000000", STORAGE, "audio/mp4;codecs=mp4a.40.2")
    assert posted == [{"messaging_product": "whatsapp", "to": "2348030000000", "type": "audio", "audio": {"link": STORAGE}}]


def test_a_webm_voice_note_is_skipped_without_ffmpeg(monkeypatch):
    posted = _wire(monkeypatch, ffmpeg=False)
    assert not voice_notes.send_programme_voice_note("+2348030000000", STORAGE, "audio/webm")
    assert posted == []
    assert not voice_notes.can_play_on_whatsapp("audio/webm")
    assert voice_notes.can_play_on_whatsapp("audio/mp4")


def test_a_webm_voice_note_is_converted_and_uploaded_with_ffmpeg(monkeypatch):
    posted = _wire(monkeypatch, ffmpeg=True)
    monkeypatch.setattr(voice_notes.httpx, "get", lambda url, **kw: SimpleNamespace(content=b"webm" * 100, raise_for_status=lambda: None))
    monkeypatch.setattr(voice_notes, "_to_ogg_opus", lambda audio: b"ogg" * 100)
    import app.conversation.voice_reply as voice_reply

    monkeypatch.setattr(voice_reply, "_upload", lambda audio: "media-42")
    assert voice_notes.send_programme_voice_note("+2348030000000", STORAGE, "audio/webm;codecs=opus")
    assert posted == [{"messaging_product": "whatsapp", "to": "2348030000000", "type": "audio", "audio": {"id": "media-42"}}]


def test_nothing_is_sent_outside_the_24_hour_window(monkeypatch):
    posted = _wire(monkeypatch, window=False)
    assert not voice_notes.send_programme_voice_note("+2348030000000", STORAGE, "audio/mp4")
    assert posted == []


def test_a_link_from_elsewhere_is_never_sent(monkeypatch):
    posted = _wire(monkeypatch)
    assert not voice_notes.send_programme_voice_note("+2348030000000", "https://evil.example.com/a.mp3", "audio/mpeg")
    assert posted == []


def test_the_worker_sends_the_text_then_the_voice_note(monkeypatch):
    calls = []
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda phone, text: calls.append(("text", phone, text)))
    monkeypatch.setattr(voice_notes, "send_programme_voice_note", lambda phone, url, mime: calls.append(("audio", phone, url, mime)) or True)
    worker._send_queued_text({"phone": "+2348030000000", "text": "New programme", "audio_url": STORAGE, "audio_mime": "audio/mp4"})
    assert calls == [("text", "+2348030000000", "New programme"), ("audio", "+2348030000000", STORAGE, "audio/mp4")]


def test_a_failed_voice_note_never_resends_the_text(monkeypatch):
    calls = []
    monkeypatch.setattr(worker, "send_whatsapp_text", lambda phone, text: calls.append("text"))
    monkeypatch.setattr(voice_notes, "send_programme_voice_note", lambda phone, url, mime: False)
    worker._send_queued_text({"phone": "+2348030000000", "text": "New programme", "audio_url": STORAGE})
    assert calls == ["text"]


def test_the_job_carries_the_voice_note_only_when_there_is_one(monkeypatch):
    pushed = []
    monkeypatch.setattr(tasks, "_redis", lambda: SimpleNamespace(lpush=lambda key, value: pushed.append((key, json.loads(value)))))
    tasks.enqueue_booking_confirmed("+2348030000000", "", "Hello")
    tasks.enqueue_booking_confirmed("+2348030000000", "", "Hello", audio_url=STORAGE, audio_mime="audio/mp4")
    assert pushed[0][1] == {"phone": "+2348030000000", "booking_id": "", "text": "Hello"}
    assert pushed[1][1] == {"phone": "+2348030000000", "booking_id": "", "text": "Hello", "audio_url": STORAGE, "audio_mime": "audio/mp4"}
