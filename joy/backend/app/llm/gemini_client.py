from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from time import monotonic
from typing import Any, Protocol

import httpx

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Gemini was removed on 14 Nov 2026 (owner): its free tier may use data for training, so no
# patient text or voice goes to Google. This module keeps its old name; OpenAI does the work.


class GeminiTimeoutError(TimeoutError):
    """The language model timed out (historical name, still caught by the worker)."""

_JSON_INSTRUCTION = (
    "Respond with a single JSON object only, no markdown, with keys "
    "reply_text (string), extraction (object), triage_decision (object), and language (string). "
    "triage_decision must contain disposition (ASK_RELEVANT_FOLLOW_UP, READY_TO_SUMMARIZE, "
    "CORRECTION, SAFETY_ANSWER, or UNCLEAR), corrections (object), missing_relevant_fields "
    "(array), and confidence (0 to 1)."
)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)
_FALLBACK_REPLY = (
    "Thanks — I received what you shared. I’m keeping the important details and will ask only "
    "for anything still needed to continue safely."
)


@dataclass
class LLMResponse:
    reply_text: str
    extraction_json: dict[str, Any]
    triage_decision_json: dict[str, Any]
    language: str


class LLMClient(Protocol):
    def complete(self, prompt: str, user_text: str) -> LLMResponse: ...

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse: ...


@lru_cache(maxsize=1)
def get_llm_client() -> LLMClient:
    return get_configured_llm_client()


def _parse_model_json(text: str) -> dict[str, Any]:
    raw = (text or "").strip()
    fenced = _FENCE_RE.search(raw)
    if fenced:
        raw = fenced.group(1).strip()
    if not raw:
        return {}
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _response_from_payload(payload: dict[str, Any]) -> LLMResponse:
    extraction = payload.get("extraction")
    decision = payload.get("triage_decision")
    return LLMResponse(
        # Never allow malformed model JSON to turn into a silent WhatsApp turn.
        reply_text=str(payload.get("reply_text") or _FALLBACK_REPLY),
        extraction_json=extraction if isinstance(extraction, dict) else {},
        triage_decision_json=decision if isinstance(decision, dict) else {},
        language=str(payload.get("language") or ""),
    )


class _HTTPJSONTextClient:
    """Provider-neutral JSON text adapter (OpenAI; OpenRouter only when chosen explicitly).

    Voice notes are transcribed by OpenAI's own audio endpoint (OpenAIClient.complete_voice).
    """

    provider_name = ""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def _models(self) -> list[str]:
        raise NotImplementedError

    def _url_and_headers(self) -> tuple[str, dict[str, str]]:
        raise NotImplementedError

    def _payload(self, model: str, prompt: str, user_text: str) -> dict[str, Any]:
        return {
            "model": model,
            "messages": [
                {"role": "system", "content": f"{prompt}\n\n{_JSON_INSTRUCTION}"},
                {"role": "user", "content": user_text},
            ],
            "response_format": {"type": "json_object"},
        }

    def _extra(self, model: str) -> dict[str, Any]:
        return {}

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
        url, headers = self._url_and_headers()
        models = self._models()
        last_error: Exception | None = None
        for index, model in enumerate(models):
            try:
                response = httpx.post(
                    url,
                    headers=headers,
                    json={**self._payload(model, prompt, user_text), **self._extra(model)},
                    timeout=self._settings.llm_provider_timeout_seconds,
                )
                if response.status_code in {429, 502, 503, 504} and index < len(models) - 1:
                    continue
                response.raise_for_status()
                data = response.json()
                choices = data.get("choices") if isinstance(data, dict) else None
                content = (
                    choices[0].get("message", {}).get("content")
                    if isinstance(choices, list) and choices and isinstance(choices[0], dict)
                    else ""
                )
                payload = _parse_model_json(str(content or ""))
                if not payload:
                    raise RuntimeError(f"{self.provider_name} returned invalid JSON")
                return _response_from_payload(payload)
            except httpx.TimeoutException as exc:
                # OpenAI is Joy's only provider since Gemini was removed: a slow first model gets
                # one try on the backup model rather than "please send that again"
                last_error = exc
                if index == len(models) - 1:
                    raise
                logger.warning("joy_llm_model_timeout provider=%s model=%s trying=%s", self.provider_name, model, models[index + 1])
            except Exception as exc:
                last_error = exc
                if index == len(models) - 1:
                    break
        raise RuntimeError(f"{self.provider_name} text request failed safely") from last_error

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        raise RuntimeError(f"{self.provider_name} can't transcribe voice notes; OpenAI does")


class OpenAIClient(_HTTPJSONTextClient):
    provider_name = "openai"

    def _models(self) -> list[str]:
        if not self._settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        fallbacks = [m.strip() for m in self._settings.openai_fallback_models.split(",") if m.strip()]
        return list(dict.fromkeys([self._settings.openai_text_model, *fallbacks]))[:2]

    def _extra(self, model: str) -> dict[str, Any]:
        # GPT-5 models reason before answering; Joy's turns need speed, not long reasoning
        family = model.split("-")[1] if model.startswith("gpt-5") and "-" in model else ""
        if not family:
            return {}
        return {"reasoning_effort": "none" if "." in family else "minimal"}

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        """Transcribe a WhatsApp voice note with OpenAI (the transcript is all Joy uses)."""
        extension = {"audio/ogg": "ogg", "audio/opus": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a",
                     "audio/aac": "m4a", "audio/amr": "amr", "audio/wav": "wav", "audio/webm": "webm"}.get(mime, "ogg")
        response = httpx.post(
            "https://api.openai.com/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {self._settings.openai_api_key}"},
            data={"model": self._settings.openai_transcribe_model},
            files={"file": (f"voice.{extension}", audio_bytes, mime or "audio/ogg")},
            timeout=30.0,
        )
        response.raise_for_status()
        text = str((response.json() or {}).get("text") or "").strip()
        if not text:
            raise RuntimeError("openai returned an empty transcript")
        return LLMResponse(reply_text=text, extraction_json={}, triage_decision_json={}, language="")

    def _url_and_headers(self) -> tuple[str, dict[str, str]]:
        return (
            "https://api.openai.com/v1/chat/completions",
            {"Authorization": f"Bearer {self._settings.openai_api_key}", "Content-Type": "application/json"},
        )


class OpenRouterClient(_HTTPJSONTextClient):
    provider_name = "openrouter"

    def _models(self) -> list[str]:
        if not self._settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is required when LLM_PROVIDER=openrouter")
        primary = self._settings.openrouter_text_model.strip()
        if not primary:
            raise RuntimeError("OPENROUTER_TEXT_MODEL is required when LLM_PROVIDER=openrouter")
        fallbacks = [item.strip() for item in self._settings.openrouter_fallback_models.split(",") if item.strip()]
        # Two bounded attempts keep triage within the response target.
        return list(dict.fromkeys([primary, *fallbacks]))[:2]

    def _url_and_headers(self) -> tuple[str, dict[str, str]]:
        return (
            self._settings.openrouter_base_url.rstrip("/") + "/chat/completions",
            {"Authorization": f"Bearer {self._settings.openrouter_api_key}", "Content-Type": "application/json"},
        )


class ProviderChainClient:
    """The first provider that answers. A busy, slow or failing provider moves on to the next,
    so one provider's outage doesn't become "Sorry, I had a brief hiccup"."""

    def __init__(self, text_clients: list[Any], voice_clients: list[Any]) -> None:
        self._text = text_clients
        self._voice = voice_clients

    @staticmethod
    def _first(clients: list[Any], call: Callable[[Any], LLMResponse]) -> LLMResponse:
        last: Exception | None = None
        for index, client in enumerate(clients):
            try:
                return call(client)
            except Exception as exc:
                last = exc
                if index < len(clients) - 1:
                    logger.warning(
                        "joy_llm_provider_failed provider=%s error=%s trying=%s",
                        type(client).__name__, type(exc).__name__, type(clients[index + 1]).__name__,
                    )
        assert last is not None
        raise last

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
        return self._first(self._text, lambda client: client.complete(prompt, user_text))

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        return self._first(self._voice, lambda client: client.complete_voice(audio_bytes, mime))


@lru_cache(maxsize=1)
def get_configured_llm_client() -> LLMClient:
    """OpenAI for text and voice notes (its backup model takes over when the first is busy or slow).

    Gemini was removed on 14 Nov 2026 (owner): LLM_PROVIDER=gemini, left over on a server, also
    means OpenAI, so nothing is ever sent to Google. OpenRouter only when chosen explicitly.
    """
    settings = get_settings()
    provider = settings.llm_provider.casefold().strip()
    if provider in ("openai", "gemini"):
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required: Joy's language model is OpenAI")
        openai = OpenAIClient(settings)
        return ProviderChainClient([openai], [openai])
    if provider == "openrouter":
        return OpenRouterClient(settings)
    raise RuntimeError("LLM_PROVIDER must be openai or openrouter")
