"""Joy's fixed messages in the patient's language (Nigerian Pidgin, Yoruba, Igbo, Hausa).

Most of Joy's replies are fixed text written in English (booking steps, reminders, check-ins,
safety guidance). When a patient writes in another language Joy supports, each outgoing message
is translated just before it is sent:
  - links, phone numbers, prices, numbers and command words in capitals (DONE, STOP, YES,
    CHECK IN, CALL ME...) must come through unchanged, or the English is sent instead
  - urgent safety guidance (112, emergency, hospital) is sent translated, then in English
  - a message from the physio is sent as they wrote it
  - translations are cached, so a fixed message is translated once per language
Any failure sends the English, so a message is never lost. JOY_TRANSLATE_MESSAGES=false turns
this off.

The translations are machine-made: a native speaker should review the common ones (cached under
joy:l10n:*), safety messages first.
"""

from __future__ import annotations

import hashlib
import logging
import re

logger = logging.getLogger(__name__)

LANGUAGE_NAMES = {"pcm": "Nigerian Pidgin English", "yo": "Yoruba", "ig": "Igbo", "ha": "Hausa"}
_CACHE_SECONDS = 60 * 60 * 24 * 30
_LANG_SECONDS = 60 * 60 * 24 * 90

_URL_RE = re.compile(r"https?://\S+")
_NAIRA_RE = re.compile(r"₦\s?[\d,]+")
_PHONE_RE = re.compile(r"\+?\d[\d -]{6,}\d")
_CAPS_RE = re.compile(r"\b[A-Z]{2,}(?:\s[A-Z]{2,})*\b")
_DIGITS_RE = re.compile(r"\d+")
_SAFETY_RE = re.compile(r"\b(112|emergency|hospital|urgent care|see a doctor|seek medical care)\b", re.I)
_KEEP_AS_WRITTEN_RE = re.compile(r"Message from your physiotherapist", re.I)


def _language_key(phone: str) -> str:
    return f"joy:lang:{(phone or '').lstrip('+')}"


def _cache_key(language: str, text: str) -> str:
    return f"joy:l10n:{language}:{hashlib.sha256(text.encode('utf-8')).hexdigest()[:32]}"


def _done_key(text: str) -> str:
    return f"joy:l10n:out:{hashlib.sha256(text.encode('utf-8')).hexdigest()[:32]}"


def remember_language(client, phone: str, language: str | None) -> None:
    """Called after each patient turn: the language later messages to this number are sent in."""
    try:
        if language in LANGUAGE_NAMES:
            client.set(_language_key(phone), language, ex=_LANG_SECONDS)
        elif language:
            client.delete(_language_key(phone))
    except Exception:
        pass


def _protected(text: str) -> list[str]:
    return _URL_RE.findall(text) + _NAIRA_RE.findall(text) + _PHONE_RE.findall(text) + _CAPS_RE.findall(text)


def _kept_everything(source: str, translated: str) -> bool:
    if any(token not in translated for token in _protected(source)):
        return False
    return set(_DIGITS_RE.findall(source)) <= set(_DIGITS_RE.findall(translated))


def _translate(llm, text: str, language: str) -> str | None:
    name = LANGUAGE_NAMES[language]
    prompt = (
        f"Translate this WhatsApp message from Joy, Rehabify's care assistant, into {name}. "
        "Keep the meaning exactly: it may be medical, safety or payment information. "
        "Keep these exactly as written: links, phone numbers, prices (₦...), every number, dates and times, "
        "words in capital letters (commands such as DONE, STOP, YES, KEEP, CHECK IN, CALL ME, PT, LINK), "
        "and names of people, clinics and places. Keep the WhatsApp formatting: *bold*, _italic_, "
        "line breaks, numbered lists and emoji. Use plain, warm everyday words. "
        f"If it is already in {name}, return it unchanged. "
        "Put only the translation in reply_text; leave extraction and triage_decision empty."
    )
    try:
        reply = (llm.complete(prompt, text).reply_text or "").strip()
    except Exception:
        logger.warning("joy_translate_failed language=%s", language, exc_info=True)
        return None
    if not reply or len(reply) > max(400, len(text) * 3) or not _kept_everything(text, reply):
        logger.warning("joy_translate_rejected language=%s", language)
        return None
    return reply


def localize(client, phone: str, text: str, *, llm=None) -> str:
    """``text`` in the language this number writes in, or unchanged. Never raises."""
    try:
        from app.config import get_settings

        if not getattr(get_settings(), "joy_translate_messages", True):
            return text
        if not text or len(text.strip()) < 8 or _KEEP_AS_WRITTEN_RE.search(text):
            return text
        language = client.get(_language_key(phone))
        if language not in LANGUAGE_NAMES:
            return text
        if client.exists(_done_key(text)):
            return text  # already translated (a fallback path sending it a second time)
        cached = client.get(_cache_key(language, text))
        if cached:
            return cached
        if llm is None:
            from app.llm.gemini_client import get_llm_client

            llm = get_llm_client()
        translated = _translate(llm, text, language)
        if translated is None:
            return text
        if _SAFETY_RE.search(text):
            translated = f"{translated}\n\n— English —\n{text}"
        client.set(_cache_key(language, text), translated, ex=_CACHE_SECONDS)
        client.set(_done_key(translated), "1", ex=_CACHE_SECONDS)
        return translated
    except Exception:
        logger.warning("joy_localize_skipped", exc_info=True)
        return text
