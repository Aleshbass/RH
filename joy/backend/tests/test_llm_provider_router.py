import pytest

from app.config import Settings
from app.llm.gemini_client import OpenAIClient, OpenRouterClient


def test_openai_requires_its_own_api_key():
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        OpenAIClient(Settings(llm_provider="openai"))._models()


def test_openrouter_uses_a_bounded_ordered_model_fallback():
    client = OpenRouterClient(
        Settings(
            llm_provider="openrouter",
            openrouter_api_key="test-key",
            openrouter_text_model="primary",
            openrouter_fallback_models="fallback-one,fallback-two",
        )
    )
    assert client._models() == ["primary", "fallback-one"]



def test_openai_tries_its_backup_model_and_uses_the_fastest_reasoning():
    client = OpenAIClient(Settings(openai_api_key="k", openai_text_model="gpt-5.4-mini", openai_fallback_models="gpt-4.1-mini"))
    assert client._models() == ["gpt-5.4-mini", "gpt-4.1-mini"]
    assert client._extra("gpt-5.4-mini") == {"reasoning_effort": "none"}
    assert client._extra("gpt-5-mini") == {"reasoning_effort": "minimal"}
    assert client._extra("gpt-4.1-mini") == {}


def _chain(monkeypatch, provider):
    from app.llm import gemini_client

    gemini_client.get_configured_llm_client.cache_clear()
    settings = Settings(llm_provider=provider, openai_api_key="k", gemini_api_key="g")
    monkeypatch.setattr(gemini_client, "get_settings", lambda: settings)
    monkeypatch.setattr(gemini_client.genai, "Client", lambda **kwargs: object())
    try:
        return gemini_client.get_configured_llm_client()
    finally:
        gemini_client.get_configured_llm_client.cache_clear()


def test_openai_first_with_gemini_as_backup(monkeypatch):
    from app.llm.gemini_client import GeminiClient, ProviderChainClient

    chain = _chain(monkeypatch, "openai")
    assert isinstance(chain, ProviderChainClient)
    assert [type(c) for c in chain._text] == [OpenAIClient, GeminiClient]
    assert [type(c) for c in chain._voice] == [OpenAIClient, GeminiClient]


def test_a_failing_provider_hands_over_to_the_next():
    from app.llm.gemini_client import LLMResponse, ProviderChainClient

    class Down:
        def complete(self, prompt, user_text):
            raise RuntimeError("503 UNAVAILABLE")

    class Up:
        def complete(self, prompt, user_text):
            return LLMResponse(reply_text="Tell me more.", extraction_json={}, triage_decision_json={}, language="en")

    assert ProviderChainClient([Down(), Up()], []).complete("p", "hi").reply_text == "Tell me more."
    with pytest.raises(RuntimeError):
        ProviderChainClient([Down(), Down()], []).complete("p", "hi")
