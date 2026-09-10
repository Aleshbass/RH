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
