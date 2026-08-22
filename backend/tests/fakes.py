from typing import Any

from app.llm.gemini_client import LLMResponse


class FakeLLM:
    def __init__(
        self,
        reply: str = "",
        extraction: dict[str, Any] | None = None,
        language: str = "en",
    ) -> None:
        self.reply = reply
        self.extraction = extraction or {}
        self.language = language
        self.voice_transcript = ""
        self.last_prompt = ""
        self.complete_prompts: list[str] = []

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
        self.last_prompt = prompt
        self.complete_prompts.append(prompt)
        # Scripted language echo: tests set `.language` per locale; never infer it.
        return LLMResponse(
            reply_text=self.reply,
            extraction_json=self.extraction,
            language=self.language,
        )

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        return LLMResponse(
            reply_text=self.voice_transcript or self.reply,
            extraction_json=self.extraction,
            language=self.language,
        )
