"""Small, strict client for TypeSafe's Jev System One API.

Jev is intentionally a decision sidecar: it never generates patient-facing
text, changes a safety outcome, or confirms a booking.  The call below is
limited to a narrow route/completeness judgment and is safe to run in shadow
mode while we calibrate it against Rehabify's own reviewed examples.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

import httpx


_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
_PHONE = re.compile(r"\+?\d[\d\s().-]{6,}\d")
_EMAIL = re.compile(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b")


class TypeSafeError(RuntimeError):
    pass


@dataclass(frozen=True)
class JevDecision:
    intent: str
    intent_confidence: float | None
    needs_clarification_probability: float | None
    model: str


def redact_direct_identifiers(text: str) -> str:
    """Minimise direct identifiers before an optional external evaluation."""
    return _PHONE.sub("[PHONE]", _EMAIL.sub("[EMAIL]", text or ""))[:4_000]


class TypeSafeClient:
    def __init__(self, api_key: str, model: str = "jev-latest", *, client: httpx.Client | None = None) -> None:
        if not api_key:
            raise TypeSafeError("TypeSafe API key is not configured")
        self.api_key = api_key
        self.model = model
        self._owns_client = client is None
        self.client = client or httpx.Client(timeout=6.0)

    def close(self) -> None:
        """Release the internal connection pool when this is a one-shot call."""
        if self._owns_client:
            self.client.close()

    def evaluate_patient_message(self, text: str, *, stage: str) -> JevDecision:
        payload: dict[str, Any] = {
            "model": self.model,
            "state": {"message": redact_direct_identifiers(text), "journey_stage": stage},
            "questions": {
                "intent": {
                    "type": "choice",
                    "instructions": "What is the user's primary intent in `message`?",
                    "criteria": {
                        "triage": "Describes symptoms, answers a symptom or safety question, or asks for care advice.",
                        "booking": "Requests a provider, a service mode, a location-related booking action, or a time slot.",
                        "payment": "Asks about a payment link, payment verification, receipt, refund, or payment status.",
                        "family_access": "Asks to add, update, revoke, or use family access.",
                        "general_support": "General non-clinical Rehabify support.",
                        "unclear": "No option clearly applies.",
                    },
                },
                "needs_clarification": {
                    "type": "noul",
                    "instructions": "Does `message` lack enough information to route the user without asking a short clarification?",
                    "criteria": {"true": "The message is ambiguous or incomplete for routing.", "false": "The main route is clear."},
                },
            },
        }
        try:
            response = self.client.post(
                _ENDPOINT,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        except httpx.HTTPError as exc:
            raise TypeSafeError("TypeSafe is unavailable") from exc
        if response.status_code in {429, 529}:
            raise TypeSafeError("TypeSafe is temporarily unavailable")
        if not response.is_success:
            raise TypeSafeError(f"TypeSafe rejected the request ({response.status_code})")
        try:
            data = response.json()
            answers = data["answers"]
            intent = answers["intent"]
            clarification = answers["needs_clarification"]
            choice = intent["choice"]
            confidence = intent.get("confidence")
            noul = clarification.get("noul")
        except (KeyError, TypeError, ValueError) as exc:
            raise TypeSafeError("TypeSafe returned an invalid response") from exc
        if not isinstance(choice, str) or choice not in {"triage", "booking", "payment", "family_access", "general_support", "unclear"}:
            raise TypeSafeError("TypeSafe returned an unsupported route")
        return JevDecision(
            intent=choice,
            intent_confidence=float(confidence) if isinstance(confidence, (int, float)) else None,
            needs_clarification_probability=float(noul) if isinstance(noul, (int, float)) else None,
            model=str(data.get("model") or self.model),
        )
