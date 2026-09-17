from __future__ import annotations

import json
import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
from google import genai
from google.genai import types

from app.config import Settings, get_settings


class GeminiTimeoutError(TimeoutError):
    """Gemini timed out after the single allowed retry."""

_JSON_INSTRUCTION = (
    "Respond with a single JSON object only, no markdown, with keys "
    "reply_text (string), extraction (object), and language (string)."
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
    language: str


class LLMClient(Protocol):
    def complete(self, prompt: str, user_text: str) -> LLMResponse: ...

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse: ...


def get_llm_client() -> LLMClient:
    return GeminiClient()


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
    return "timeout" in type(exc).__name__.lower()


def _with_timeout_retry(call: Callable[[], LLMResponse]) -> LLMResponse:
    try:
        return call()
    except Exception as exc:
        if not _is_timeout(exc):
            raise
        try:
            return call()
        except Exception as retry_exc:
            if _is_timeout(retry_exc):
                raise GeminiTimeoutError(str(retry_exc)) from retry_exc
            raise


def _response_from_payload(payload: dict[str, Any]) -> LLMResponse:
    extraction = payload.get("extraction")
    return LLMResponse(
        # Never allow malformed model JSON to turn into a silent WhatsApp turn.
        reply_text=str(payload.get("reply_text") or _FALLBACK_REPLY),
        extraction_json=extraction if isinstance(extraction, dict) else {},
        language=str(payload.get("language") or ""),
    )


class GeminiClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
        def _call() -> LLMResponse:
            client = genai.Client(api_key=self._settings.gemini_api_key)
            system = f"{prompt}\n\n{_JSON_INSTRUCTION}"
            response = client.models.generate_content(
                model=self._settings.gemini_text_model,
                contents=user_text,
                config=types.GenerateContentConfig(
                    system_instruction=system,
                    response_mime_type="application/json",
                ),
            )
            payload = _parse_model_json(response.text or "")
            return _response_from_payload(payload)

        return _with_timeout_retry(_call)

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        # Plan 1: send audio bytes via generate_content on gemini_live_model (no Live websocket).
        def _call() -> LLMResponse:
            client = genai.Client(api_key=self._settings.gemini_api_key)
            audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime)
            prompt = (
                "Transcribe this voice note exactly. "
                f"{_JSON_INSTRUCTION} "
                "reply_text must be the transcript."
            )
            response = client.models.generate_content(
                model=self._settings.gemini_live_model,
                contents=[prompt, audio_part],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            payload = _parse_model_json(response.text or "")
            return _response_from_payload(payload)

        return _with_timeout_retry(_call)
