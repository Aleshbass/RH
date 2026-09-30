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
