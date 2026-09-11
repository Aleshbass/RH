import hashlib
import hmac
import json

import httpx

from app.integrations.rh_client import RHActor, RHClient


def test_resolve_patient_signs_the_exact_json_payload() -> None:
    secret = "test-secret"

    def handler(request: httpx.Request) -> httpx.Response:
        body = request.content
        canonical = "\n".join([
            request.method,
            request.url.path,
            request.headers["X-Timestamp"],
            request.headers["X-Request-Id"],
            request.headers.get("Idempotency-Key", ""),
            request.headers.get("X-Actor-Context", ""),
            hashlib.sha256(body).hexdigest(),
        ]).encode()
        assert request.headers["X-Signature"] == hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()
        assert json.loads(body)["actor"]["sender_phone"] == "+2348012345678"
        return httpx.Response(200, json={"request_id": request.headers["X-Request-Id"], "data": {"resolution": "EXISTING", "patient_id": "rh_patient_1"}})

    client = RHClient("https://rh.test", "joy-test", secret, client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = client.resolve_patient(
        "+2348012345678",
        "0eb98306-7ae8-4ebc-8a31-69d0792ca937",
        RHActor(persona="patient", sender_phone="+2348012345678"),
    )

    assert result.resolution == "EXISTING"
    assert result.patient_id == "rh_patient_1"


def test_current_policy_signs_query_string_and_requires_complete_metadata() -> None:
    secret = "test-secret"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/joy/policy/current"
        assert request.url.query == b"language=en"
        canonical = "\n".join([
            request.method, f"{request.url.path}?{request.url.query.decode()}",
            request.headers["X-Timestamp"], request.headers["X-Request-Id"], "", "",
            hashlib.sha256(request.content).hexdigest(),
        ]).encode()
        assert request.headers["X-Signature"] == hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()
        return httpx.Response(200, json={"data": {
            "policy_id": "policy_1", "version": "2026-09", "url": "https://rh.test/policy",
            "content_sha256": "a" * 64, "effective_at": "2026-09-10T00:00:00Z",
            "acceptance_text": "I accept", "language": "en", "approval_status": "APPROVED",
        }})

    client = RHClient("https://rh.test", "joy-test", secret, client=httpx.Client(transport=httpx.MockTransport(handler)))
    policy = client.current_policy(language="en")
    assert policy.is_approved is True
    assert policy.version == "2026-09"
