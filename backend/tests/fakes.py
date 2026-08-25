from typing import Any

from app.llm.gemini_client import LLMResponse


class FakePaystack:
    def __init__(self) -> None:
        self.last_callback_url: str | None = None
        self.last_transfer: dict[str, str | int] | None = None

    def initialize_transaction(
        self, email: str, amount_kobo: int, reference: str, callback_url: str
    ) -> dict[str, str]:
        self.last_callback_url = callback_url
        return {
            "authorization_url": f"https://checkout.paystack.com/{reference}",
            "reference": reference,
        }

    def initiate_transfer(
        self, amount_kobo: int, recipient: str, reference: str, reason: str = ""
    ) -> dict[str, str]:
        self.last_transfer = {
            "amount_kobo": amount_kobo,
            "recipient": recipient,
            "reference": reference,
            "reason": reason,
        }
        return {"transfer_code": f"TRF_{reference}", "reference": reference}


class FakeLLM:
    def __init__(
        self,
        reply: str = "",
        extraction: dict[str, Any] | None = None,
        language: str | None = "en",
    ) -> None:
        self.reply = reply
        self.extraction = extraction or {}
        self.language: str | None = language
        self.voice_transcript = ""
        self.last_prompt = ""
        self.complete_prompts: list[str] = []

    def complete(self, prompt: str, user_text: str) -> LLMResponse:
        self.last_prompt = prompt
        self.complete_prompts.append(prompt)
        # Scripted language echo: tests set `.language` per locale; never infer it.
        # Empty/None means "no assignment this turn" so persist last_known_language.
        return LLMResponse(
            reply_text=self.reply,
            extraction_json=self.extraction,
            language=self.language or "",
        )

    def complete_voice(self, audio_bytes: bytes, mime: str) -> LLMResponse:
        return LLMResponse(
            reply_text=self.voice_transcript or self.reply,
            extraction_json=self.extraction,
            language=self.language or "",
        )
