import json

import httpx

from app.integrations.typesafe_client import TypeSafeClient, redact_direct_identifiers


def test_jev_client_uses_typed_questions_and_parses_decision() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://api.typesafe.ai/v1/systemone"
        assert request.headers["authorization"] == "Bearer test-key"
        body = json.loads(request.content)
        assert body["model"] == "jev-latest"
        assert set(body["questions"]) == {"intent", "needs_clarification"}
        return httpx.Response(200, json={"model": "jev-1.13.0", "answers": {
            "intent": {"type": "choice", "choice": "booking", "confidence": 0.93, "probabilities": {"booking": 0.93}},
            "needs_clarification": {"type": "noul", "noul": 0.04},
        }})

    client = TypeSafeClient("test-key", client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = client.evaluate_patient_message("I need to book a clinic visit", stage="TRIAGE_SUMMARY")
    assert result.intent == "booking"
    assert result.intent_confidence == 0.93
    client.client.close()


def test_jev_payload_redacts_direct_identifiers() -> None:
    redacted = redact_direct_identifiers("Call +234 801 234 5678 or email patient@example.com")
    assert "+234" not in redacted
    assert "patient@example.com" not in redacted
    assert "[PHONE]" in redacted and "[EMAIL]" in redacted
