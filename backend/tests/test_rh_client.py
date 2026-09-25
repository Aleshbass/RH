import hashlib
import hmac
import json

import httpx

from app.integrations.rh_client import RHActor, RHClient


def test_patient_location_uses_structured_city_and_area() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "PATCH"
        assert request.url.path == "/api/v1/joy/patients/rh_patient_1/location"
        assert json.loads(request.content) == {
            "city": "Abuja", "area": "Jabi",
            "actor": {"persona": "patient", "sender_phone": "+2348012345678"},
        }
        return httpx.Response(200, json={"data": {"patient_id": "rh_patient_1", "city": "Abuja", "area": "Jabi"}})

    client = RHClient("https://rh.test", "joy-test", "test-secret", client=httpx.Client(transport=httpx.MockTransport(handler)))
    client.update_patient_location(
        "rh_patient_1", city="Abuja", area="Jabi",
        actor=RHActor(persona="patient", sender_phone="+2348012345678"),
    )


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


def test_referral_context_is_scoped_to_the_verified_patient() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/joy/referrals/resolve"
        assert json.loads(request.content) == {
            "tracking_code": "RHB-95942",
            "phone": "+2348012345678",
            "joy_person_id": "joy_patient_1",
            "actor": {
                "persona": "patient",
                "sender_phone": "+2348012345678",
                "rh_user_id": "rh_patient_1",
            },
        }
        return httpx.Response(200, json={"data": {
            "resolution": "MATCH",
            "referral": {"referral_id": "referral_1", "billing_mode": "hmo_direct_billing"},
        }})

    client = RHClient("https://rh.test", "joy-test", "test-secret", client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = client.resolve_referral_context(
        "RHB-95942",
        phone="+2348012345678",
        joy_person_id="joy_patient_1",
        actor=RHActor(persona="patient", sender_phone="+2348012345678", rh_user_id="rh_patient_1"),
    )
    assert result.resolution == "MATCH"
    assert result.referral == {"referral_id": "referral_1", "billing_mode": "hmo_direct_billing"}


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


def test_availability_signs_the_exact_encoded_query_target() -> None:
    secret = "test-secret"

    def handler(request: httpx.Request) -> httpx.Response:
        assert "time_zone" not in request.url.params
        canonical = "\n".join([
            request.method,
            f"{request.url.path}?{request.url.query.decode()}",
            request.headers["X-Timestamp"], request.headers["X-Request-Id"], "", "",
            hashlib.sha256(request.content).hexdigest(),
        ]).encode()
        assert request.headers["X-Signature"] == hmac.new(secret.encode(), canonical, hashlib.sha256).hexdigest()
        return httpx.Response(200, json={"data": {"slots": []}})

    client = RHClient("https://rh.test", "joy-test", secret, client=httpx.Client(transport=httpx.MockTransport(handler)))
    result = client.availability(
        "physio_1", start_ms=1_790_200_000_000, end_ms=1_790_804_800_000,
        duration_minutes=60, service_mode="online",
    )
    assert result == {"slots": []}


def test_rh_client_opens_circuit_after_repeated_retryable_failures() -> None:
    RHClient._circuit_open_until.clear()
    RHClient._consecutive_failures.clear()

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"error": {"code": "UNAVAILABLE", "message": "down", "retryable": True}})

    client = RHClient("https://rh-circuit.test", "joy-test", "test-secret", client=httpx.Client(transport=httpx.MockTransport(handler)))
    from app.integrations.rh_client import RHIntegrationError
    for _ in range(3):
        try:
            client.health()
        except RHIntegrationError as error:
            assert error.retryable is True
    try:
        client.health()
        assert False, "expected the circuit breaker to reject the fourth request"
    except RHIntegrationError as error:
        assert error.code == "DEPENDENCY_UNAVAILABLE"
