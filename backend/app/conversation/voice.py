from app.llm.gemini_client import LLMClient


def ingest_voice(llm: LLMClient, audio: bytes, mime: str) -> str:
    return llm.complete_voice(audio, mime).reply_text
