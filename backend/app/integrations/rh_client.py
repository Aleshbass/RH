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
    resolution: Literal["EXISTING", "NOT_FOUND", "AMBIGUOUS"]
    patient_id: str | None = None
    display_name: str | None = None


@dataclass(frozen=True)
class PhysiotherapistResolution:
    resolution: Literal["MATCH", "NO_MATCH", "INELIGIBLE", "AMBIGUOUS"]
    physiotherapist_id: str | None = None
    display_name: str | None = None
    capabilities: dict[str, Any] | None = None


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
