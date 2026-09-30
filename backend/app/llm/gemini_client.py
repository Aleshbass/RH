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
from google import genai
from google.genai import types

from app.config import Settings, get_settings

logger = logging.getLogger(__name__)

# Gemini enforces a 10-second minimum HTTP deadline. Keep one bounded request
# (never a second application retry) so slow calls cannot become 20–30 second
# worker stalls.
_TEXT_TIMEOUT_MS = 10_000


class GeminiTimeoutError(TimeoutError):
    """Gemini timed out after the single allowed retry."""

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


def _is_timeout(exc: BaseException) -> bool:
    if isinstance(exc, GeminiTimeoutError):
        return True
    if isinstance(exc, (TimeoutError, httpx.TimeoutException)):
        return True
    # google-genai raises ServerError for a provider-side deadline rather than
    # httpx.TimeoutException. Treat that transient 504 exactly like a client
    # deadline so the worker can return its bounded fallback response.
    detail = f"{type(exc).__name__} {exc}".casefold()
    return "timeout" in detail or "deadline_exceeded" in detail


def _with_timeout_retry(call: Callable[[], LLMResponse], *, retry_on_timeout: bool = True) -> LLMResponse:
    try:
        return call()
    except Exception as exc:
        if not _is_timeout(exc):
            raise
        if not retry_on_timeout:
            raise GeminiTimeoutError(str(exc)) from exc
        try:
            return call()
        except Exception as retry_exc:
            if _is_timeout(retry_exc):
                raise GeminiTimeoutError(str(retry_exc)) from retry_exc
            raise


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


class GeminiClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        # Reuse the SDK client across sequential worker jobs. Re-establishing
        # a client every WhatsApp turn adds avoidable connection overhead.
        self._client = genai.Client(
            api_key=self._settings.gemini_api_key,
            http_options=types.HttpOptions(timeout=_TEXT_TIMEOUT_MS),
        )

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
        def _call() -> LLMResponse:
            system = f"{prompt}\n\n{_JSON_INSTRUCTION}"
            response = self._client.models.generate_content(
                model=self._settings.gemini_text_model,
                contents=user_text,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                ),
            )
            payload = _parse_model_json(response.text or "")
            return _response_from_payload(payload)

        started = monotonic()
        try:
            # A retry could consume another full deadline and violate the
            # WhatsApp triage response target. The worker sends its concise
            # fallback immediately when this single bounded request times out.
            return _with_timeout_retry(_call, retry_on_timeout=False)
        finally:
            logger.info("joy_gemini_text_complete latency_ms=%d", int((monotonic() - started) * 1000))

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        # Plan 1: send audio bytes via generate_content on gemini_live_model (no Live websocket).
        def _call() -> LLMResponse:
            audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime)
            prompt = (
                "Transcribe this voice note exactly. "
                f"{_JSON_INSTRUCTION} "
                "reply_text must be the transcript."
            )
            response = self._client.models.generate_content(
                model=self._settings.gemini_live_model,
                contents=[prompt, audio_part],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            payload = _parse_model_json(response.text or "")
            return _response_from_payload(payload)

        return _with_timeout_retry(_call)


class _HTTPJSONTextClient:
    """Provider-neutral JSON text adapter for explicit OpenAI/OpenRouter use.

    It is intentionally limited to text triage. Voice remains on Gemini's
    dedicated audio path, rather than pretending another text provider can
    safely transcribe clinical audio.
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

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
        url, headers = self._url_and_headers()
        models = self._models()
        last_error: Exception | None = None
        for index, model in enumerate(models):
            try:
                response = httpx.post(
                    url,
                    headers=headers,
                    json=self._payload(model, prompt, user_text),
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
            except Exception as exc:
                last_error = exc
                if index == len(models) - 1:
                    break
        raise RuntimeError(f"{self.provider_name} text request failed safely") from last_error

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        if not self._settings.gemini_api_key:
            raise RuntimeError("Gemini is required for Joy voice transcription")
        return GeminiClient(self._settings).complete_voice(audio_bytes, mime)


class OpenAIClient(_HTTPJSONTextClient):
    provider_name = "openai"

    def _models(self) -> list[str]:
        if not self._settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        return [self._settings.openai_text_model]

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


@lru_cache(maxsize=1)
def get_configured_llm_client() -> LLMClient:
    """Return the explicitly selected text provider behind Joy's protocol."""
    settings = get_settings()
    provider = settings.llm_provider.casefold().strip()
    if provider == "gemini":
        return GeminiClient(settings)
    if provider == "openai":
        return OpenAIClient(settings)
    if provider == "openrouter":
        return OpenRouterClient(settings)
    raise RuntimeError("LLM_PROVIDER must be gemini, openai, or openrouter")
