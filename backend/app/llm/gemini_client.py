from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Protocol

from google import genai
from google.genai import types

from app.config import Settings, get_settings

_JSON_INSTRUCTION = (
    "Respond with a single JSON object only, no markdown, with keys "
    "reply_text (string), extraction (object), and language (string)."
)

_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL | re.IGNORECASE)


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
    payload = json.loads(raw)
    return payload if isinstance(payload, dict) else {}


class GeminiClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
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
        extraction = payload.get("extraction")
        return LLMResponse(
            reply_text=str(payload.get("reply_text") or ""),
            extraction_json=extraction if isinstance(extraction, dict) else {},
            language=str(payload.get("language") or ""),
        )

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        raise NotImplementedError("Gemini Live voice is Task 12")
