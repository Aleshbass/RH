"""Joy's fixed messages in the patient's language, with the safety checks around the translation."""

from types import SimpleNamespace

import pytest

from app.conversation.localize import localize, remember_language

PHONE = "+2348012345678"


class _Redis:
    def __init__(self):
        self.data = {}

    def get(self, key):
        return self.data.get(key)

    def set(self, key, value, ex=None):
        self.data[key] = value

    def exists(self, key):
        return int(key in self.data)

    def delete(self, key):
        self.data.pop(key, None)


class _Model:
    def __init__(self, text):
        self.text = text
        self.calls = 0

    def complete(self, prompt, user_text):
        self.calls += 1
        return SimpleNamespace(reply_text=self.text)


ENGLISH = "To go ahead, pay securely here: https://checkout.paystack.com/x1 Reply DONE when you finish. It's ₦6,000."
YORUBA = "Láti tẹ̀síwájú, sanwó níbí: https://checkout.paystack.com/x1 Fèsì DONE nígbà tí o bá parí. Ó jẹ́ ₦6,000."


def test_english_speakers_get_the_text_unchanged():
    redis, model = _Redis(), _Model(YORUBA)
    remember_language(redis, PHONE, "en")
    assert localize(redis, PHONE, ENGLISH, llm=model) == ENGLISH and model.calls == 0


def test_a_yoruba_speaker_gets_yoruba_once_then_from_the_cache():
    redis, model = _Redis(), _Model(YORUBA)
    remember_language(redis, PHONE, "yo")
    assert localize(redis, PHONE, ENGLISH, llm=model) == YORUBA
    assert localize(redis, PHONE, ENGLISH, llm=model) == YORUBA
    assert model.calls == 1
    # Sending the translation again (a fallback path) does not translate it twice
    assert localize(redis, PHONE, YORUBA, llm=model) == YORUBA and model.calls == 1


@pytest.mark.parametrize("bad", [
    "Láti tẹ̀síwájú, sanwó níbí: https://evil.example/pay Fèsì DONE. Ó jẹ́ ₦6,000.",  # link changed
    "Láti tẹ̀síwájú, sanwó níbí: https://checkout.paystack.com/x1 Fèsì PARÍ. Ó jẹ́ ₦6,000.",  # command translated
    "Láti tẹ̀síwájú, sanwó níbí: https://checkout.paystack.com/x1 Fèsì DONE. Ó jẹ́ ẹgbẹ̀rún mẹ́fà.",  # price lost
    "",
])
def test_a_translation_that_loses_a_link_command_or_price_sends_the_english(bad):
    redis = _Redis()
    remember_language(redis, PHONE, "yo")
    assert localize(redis, PHONE, ENGLISH, llm=_Model(bad)) == ENGLISH


def test_safety_guidance_is_sent_translated_then_in_english():
    redis = _Redis()
    remember_language(redis, PHONE, "ha")
    english = "Please see a doctor or go to an emergency hospital now. Call 112."
    hausa = "Don Allah ka je asibitin gaggawa yanzu. Kira 112."
    assert localize(redis, PHONE, english, llm=_Model(hausa)) == f"{hausa}\n\n— English —\n{english}"


def test_the_physios_own_message_is_sent_as_written():
    redis, model = _Redis(), _Model("anything")
    remember_language(redis, PHONE, "pcm")
    text = "Message from your physiotherapist: do the bridge 3 times a day."
    assert localize(redis, PHONE, text, llm=model) == text and model.calls == 0


def test_a_model_error_sends_the_english():
    class _Broken:
        def complete(self, prompt, user_text):
            raise TimeoutError("slow")

    redis = _Redis()
    remember_language(redis, PHONE, "ig")
    assert localize(redis, PHONE, ENGLISH, llm=_Broken()) == ENGLISH


def test_the_sender_translates_and_the_refused_form_fallback_too(monkeypatch):
    import httpx

    from app.config import Settings
    from app.flows.signup import WELCOME_WITH_FORM, WELCOME_WITHOUT_FORM
    from app.flows.signup_flow import signup_flow_message
    from app.queue import tasks

    redis = _Redis()
    remember_language(redis, PHONE, "pcm")
    seen = []

    def fake_localize(client, phone, text, *, llm=None):
        seen.append(text)
        return f"[pcm] {text}"

    def refused(url, *, headers, json, timeout):
        return httpx.Response(400, text='{"error":{"code":139000}}', request=httpx.Request("POST", url))

    settings = Settings(whatsapp_access_token="t", whatsapp_phone_number_id="1", disable_whatsapp_delivery=False)
    monkeypatch.setattr(tasks, "get_settings", lambda: settings)
    monkeypatch.setattr(tasks, "_redis", lambda: redis)
    monkeypatch.setattr(tasks, "_in_service_window", lambda phone: True)
    monkeypatch.setattr(tasks.httpx, "post", refused)
    monkeypatch.setattr("app.conversation.localize.localize", fake_localize)
    sent = []
    tasks.send_whatsapp_interactive(PHONE, WELCOME_WITH_FORM, signup_flow_message("1", "t", mode="draft"),
                                    text_sender=lambda phone, text: sent.append(text))
    assert sent == [f"[pcm] {WELCOME_WITHOUT_FORM}"]
    assert seen == [WELCOME_WITH_FORM, WELCOME_WITHOUT_FORM]
