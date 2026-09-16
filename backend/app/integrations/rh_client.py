"""Typed, signed client for RH's versioned Joy integration API.

This module is deliberately not connected to the WhatsApp turn handler yet. A later slice
will replace local operational writes only after the RH endpoint and contract tests deploy.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Literal
from uuid import uuid4

import httpx


class RHIntegrationError(RuntimeError):
    """A stable error returned by, or preventing a call to, RH."""

    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class RHActor:
    persona: Literal["patient", "physiotherapist", "family", "admin", "partner"]
    sender_phone: str
    rh_user_id: str | None = None
    persona_session_id: str | None = None

    def as_payload(self) -> dict[str, str]:
        payload = {"persona": self.persona, "sender_phone": self.sender_phone}
        if self.rh_user_id:
            payload["rh_user_id"] = self.rh_user_id
        if self.persona_session_id:
            payload["persona_session_id"] = self.persona_session_id
        return payload


@dataclass(frozen=True)
class PatientResolution:
    resolution: Literal["EXISTING", "CREATED", "NOT_FOUND", "AMBIGUOUS"]
    patient_id: str | None = None
    display_name: str | None = None


@dataclass(frozen=True)
class PhysiotherapistResolution:
    resolution: Literal["MATCH", "NO_MATCH", "INELIGIBLE", "AMBIGUOUS"]
    physiotherapist_id: str | None = None
    display_name: str | None = None
    capabilities: dict[str, Any] | None = None


@dataclass(frozen=True)
class PolicyDocument:
    policy_id: str
    version: str
    url: str
    content_sha256: str
    effective_at: str | None
    acceptance_text: str
    language: str
    approval_status: str

    @property
    def is_approved(self) -> bool:
        return self.approval_status == "APPROVED"


@dataclass(frozen=True)
class RHMatch:
    physiotherapist_id: str
    display_name: str | None
    specialties: list[str]
    service_modes: list[str]
    amount_kobo: int
    match_reasons: list[str]


@dataclass(frozen=True)
class RHBooking:
    booking_id: str
    booking_status: str
    payment_status: str
    amount_kobo: int
    hold_expires_at: int | None = None


@dataclass(frozen=True)
class RHPaymentInitialization:
    booking_id: str
    reference: str
    authorization_url: str
    payment_status: str


class RHClient:
    def __init__(self, base_url: str, key_id: str, hmac_secret: str, *, client: httpx.Client | None = None) -> None:
        if not base_url or not key_id or not hmac_secret:
            raise RHIntegrationError("INTEGRATION_NOT_CONFIGURED", "RH integration credentials are not configured")
        self.base_url = base_url.rstrip("/")
        self.key_id = key_id
        self.hmac_secret = hmac_secret.encode("utf-8")
        self.client = client or httpx.Client(timeout=10.0)

    @staticmethod
    def _canonical(method: str, path: str, timestamp: str, request_id: str, idempotency_key: str, actor_context: str, raw_body: bytes) -> bytes:
        body_hash = hashlib.sha256(raw_body).hexdigest()
        return "\n".join([method.upper(), path, timestamp, request_id, idempotency_key, actor_context, body_hash]).encode("utf-8")

    def _request(self, method: str, path: str, *, payload: dict[str, Any] | None = None, idempotency_key: str = "") -> dict[str, Any]:
        raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8") if payload is not None else b""
        timestamp = str(int(time.time()))
        request_id = str(uuid4())
        signature = hmac.new(self.hmac_secret, self._canonical(method, path, timestamp, request_id, idempotency_key, "", raw_body), hashlib.sha256).hexdigest()
        headers = {
            "Content-Type": "application/json",
            "X-Joy-Api-Version": "1",
            "X-Key-Id": self.key_id,
            "X-Timestamp": timestamp,
            "X-Request-Id": request_id,
            "X-Signature": signature,
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key
        try:
            response = self.client.request(method, f"{self.base_url}{path}", content=raw_body, headers=headers)
        except httpx.HTTPError as error:
            raise RHIntegrationError("DEPENDENCY_UNAVAILABLE", "RH integration is unavailable", retryable=True) from error
        try:
            envelope = response.json()
        except ValueError as error:
            raise RHIntegrationError("INVALID_RESPONSE", "RH returned an invalid integration response", retryable=True) from error
        if not response.is_success:
            error = envelope.get("error", {}) if isinstance(envelope, dict) else {}
            raise RHIntegrationError(error.get("code", "RH_REQUEST_FAILED"), error.get("message", "RH rejected the request"), retryable=bool(error.get("retryable")))
        if not isinstance(envelope, dict) or not isinstance(envelope.get("data"), dict):
            raise RHIntegrationError("INVALID_RESPONSE", "RH returned an invalid integration envelope", retryable=True)
        return envelope["data"]

    def health(self) -> dict[str, Any]:
        return self._request("GET", "/api/v1/joy/health")

    def resolve_patient(self, phone: str, joy_person_id: str, actor: RHActor, *, name: str | None = None, email: str | None = None) -> PatientResolution:
        payload: dict[str, Any] = {"phone": phone, "joy_person_id": joy_person_id, "actor": actor.as_payload()}
        if name: payload["name"] = name
        if email: payload["email"] = email
        data = self._request("POST", "/api/v1/joy/patients/resolve", payload=payload)
        return PatientResolution(resolution=data["resolution"], patient_id=data.get("patient_id"), display_name=data.get("display_name"))

    def resolve_physiotherapist(self, phone: str, actor: RHActor) -> PhysiotherapistResolution:
        data = self._request("POST", "/api/v1/joy/physiotherapists/resolve", payload={"phone": phone, "actor": actor.as_payload()})
        return PhysiotherapistResolution(resolution=data["resolution"], physiotherapist_id=data.get("physiotherapist_id"), display_name=data.get("display_name"), capabilities=data.get("capabilities"))

    def current_policy(self, *, service_type: str | None = None, language: str | None = None) -> PolicyDocument:
        query = "&".join(
            f"{key}={value}" for key, value in (("service_type", service_type), ("language", language)) if value
        )
        path = "/api/v1/joy/policy/current" + (f"?{query}" if query else "")
        data = self._request("GET", path)
        required = ("policy_id", "version", "url", "content_sha256", "acceptance_text", "language", "approval_status")
        if any(not isinstance(data.get(key), str) for key in required):
            raise RHIntegrationError("INVALID_RESPONSE", "RH returned incomplete policy metadata", retryable=True)
        return PolicyDocument(
            policy_id=data["policy_id"], version=data["version"], url=data["url"],
            content_sha256=data["content_sha256"], effective_at=data.get("effective_at"),
            acceptance_text=data["acceptance_text"], language=data["language"],
            approval_status=data["approval_status"],
        )

    def match_physios(self, *, patient_id: str, assessment_id: str, assessment_revision: int, required_specialties: list[str], service_mode: str, actor: RHActor, location: str | None = None) -> list[RHMatch]:
        payload: dict[str, Any] = {
            "patient_id": patient_id, "assessment_id": assessment_id,
            "assessment_revision": assessment_revision, "required_specialties": required_specialties,
            "service_mode": service_mode, "actor": actor.as_payload(),
        }
        if location:
            payload["location"] = location
        data = self._request("POST", "/api/v1/joy/matches", payload=payload)
        providers = data.get("providers")
        if not isinstance(providers, list):
            raise RHIntegrationError("INVALID_RESPONSE", "RH returned invalid match results", retryable=True)
        return [RHMatch(
            physiotherapist_id=item["physiotherapist_id"], display_name=item.get("display_name"),
            specialties=list(item.get("specialties") or []), service_modes=list(item.get("service_modes") or []),
            amount_kobo=int(item["amount_kobo"]), match_reasons=list(item.get("match_reasons") or []),
        ) for item in providers if isinstance(item, dict)]

    def availability(self, physiotherapist_id: str, *, start_ms: int, end_ms: int, duration_minutes: int, service_mode: str) -> dict[str, Any]:
        path = (
            f"/api/v1/joy/physiotherapists/{physiotherapist_id}/availability?from={start_ms}&to={end_ms}"
            f"&duration_minutes={duration_minutes}&service_mode={service_mode}&time_zone=Africa/Lagos"
        )
        return self._request("GET", path)

    def create_pending_booking(self, *, patient_id: str, physiotherapist_id: str, slot_start: int, duration_minutes: int, service_mode: str, session_type: str, triage_summary_reference: str, assessment_id: str, assessment_revision: int, protocol_version: str, policy_version: str, policy_acceptance_reference: str, conversation_id: str, actor: RHActor, idempotency_key: str, required_specialties: list[str], patient_address: str | None = None) -> RHBooking:
        payload: dict[str, Any] = {
            "patient_id": patient_id, "physiotherapist_id": physiotherapist_id, "slot_start": slot_start,
            "duration_minutes": duration_minutes, "service_mode": service_mode, "session_type": session_type,
            "triage_summary_reference": triage_summary_reference, "assessment_id": assessment_id,
            "assessment_revision": assessment_revision, "protocol_version": protocol_version,
            "policy_version": policy_version, "policy_acceptance_reference": policy_acceptance_reference,
            "joy_conversation_id": conversation_id, "required_specialties": required_specialties,
            "actor": actor.as_payload(),
        }
        if patient_address:
            payload["patient_address"] = patient_address
        data = self._request("POST", "/api/v1/joy/bookings", payload=payload, idempotency_key=idempotency_key)
        return RHBooking(booking_id=data["booking_id"], booking_status=data["booking_status"], payment_status=data["payment_status"], amount_kobo=int(data["amount_kobo"]), hold_expires_at=data.get("hold_expires_at"))

    def initialize_booking_payment(self, booking_id: str, *, patient_id: str, email: str, actor: RHActor, idempotency_key: str) -> RHPaymentInitialization:
        data = self._request("POST", f"/api/v1/joy/bookings/{booking_id}/payment", payload={"patient_id": patient_id, "email": email, "actor": actor.as_payload()}, idempotency_key=idempotency_key)
        if not isinstance(data.get("authorization_url"), str) or not isinstance(data.get("reference"), str):
            raise RHIntegrationError("INVALID_RESPONSE", "RH returned incomplete payment initialization", retryable=True)
        return RHPaymentInitialization(booking_id=data["booking_id"], reference=data["reference"], authorization_url=data["authorization_url"], payment_status=data["payment_status"])

    def booking_status(self, booking_id: str, *, patient_id: str) -> dict[str, Any]:
        return self._request("GET", f"/api/v1/joy/bookings/{booking_id}?persona=patient&patient_id={patient_id}")

    def cancel_booking(self, booking_id: str, *, patient_id: str, reason: str, actor: RHActor, idempotency_key: str) -> dict[str, Any]:
        return self._request("POST", f"/api/v1/joy/bookings/{booking_id}/cancel", payload={"patient_id": patient_id, "reason": reason, "actor": actor.as_payload()}, idempotency_key=idempotency_key)

    def replacement_candidates(self, booking_id: str, *, patient_id: str, actor: RHActor) -> list[RHMatch]:
        data = self._request("POST", f"/api/v1/joy/bookings/{booking_id}/replacement-candidates", payload={"patient_id": patient_id, "actor": actor.as_payload()})
        return [RHMatch(physiotherapist_id=item["physiotherapist_id"], display_name=item.get("display_name"), specialties=list(item.get("specialties") or []), service_modes=list(item.get("service_modes") or []), amount_kobo=int(item["amount_kobo"]), match_reasons=[]) for item in data.get("candidates", [])]

    def reassign_booking(self, booking_id: str, *, patient_id: str, physiotherapist_id: str, slot_start: int, actor: RHActor, idempotency_key: str) -> dict[str, Any]:
        return self._request("POST", f"/api/v1/joy/bookings/{booking_id}/reassign", payload={"patient_id": patient_id, "physiotherapist_id": physiotherapist_id, "slot_start": slot_start, "actor": actor.as_payload()}, idempotency_key=idempotency_key)


def configured_rh_client() -> RHClient:
    """Create the integration client only when all service credentials exist."""
    from app.config import get_settings

    settings = get_settings()
    return RHClient(
        settings.rh_api_base_url,
        settings.rh_api_key_id,
        settings.rh_api_hmac_secret,
    )
