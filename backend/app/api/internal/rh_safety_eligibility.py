"""Narrow service-to-service safety gate used by RH before a Joy booking hold.

This endpoint never accepts a caller supplied safety outcome. It re-evaluates the
stored triage data deterministically and returns only an opaque, short-lived
reference when the requested service is permitted.
"""
import hashlib
import hmac
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.models.conversation import Conversation
from app.models.rh_identity_mapping import RHIdentityMapping
from app.models.triage_session import TriageSession
from app.models.types import ExtractedTriage, Persona
from app.safety.evaluator import evaluate

router = APIRouter(prefix="/api/integrations/rh", tags=["rh-integration"])
_MAX_AGE_SECONDS = 300
_CLEARANCE_VALIDITY = timedelta(hours=48)


class EligibilityRequest(BaseModel):
    rh_patient_id: str = Field(min_length=1, max_length=128)
    assessment_id: str = Field(min_length=1, max_length=128)
    assessment_revision: int = Field(ge=1)
    service_type: str
    policy_version: str = Field(min_length=1, max_length=80)


def _verify(raw_body: bytes, request: Request, secret: str) -> None:
    timestamp = request.headers.get("X-RH-Timestamp", "")
    request_id = request.headers.get("X-RH-Request-Id", "")
    signature = request.headers.get("X-RH-Signature", "")
    try:
        is_fresh = abs(datetime.now(timezone.utc).timestamp() - int(timestamp)) <= _MAX_AGE_SECONDS
    except ValueError:
        is_fresh = False
    expected = hmac.new(secret.encode(), b"\n".join([timestamp.encode(), request_id.encode(), raw_body]), hashlib.sha256).hexdigest()
    if not secret or not request_id or not is_fresh or not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=401, detail="invalid RH service authentication")


def issue_eligibility_reference(
    *, session: Session, settings: Settings, payload: EligibilityRequest
) -> dict:
    """Evaluate the same scoped booking gate for RH or the direct gateway.

    The reference is generated only after re-reading Joy's persisted triage
    and policy state.  A direct Convex gateway caller therefore cannot invent
    a GREEN result or bypass the deterministic evaluator.
    """
    if not settings.rh_safety_hmac_secret:
        # Direct mode must not silently manufacture a reference with an empty
        # key just because it is not making the RH -> Joy HTTP round trip.
        return {"allowed": False, "reason": "SAFETY_GATE_NOT_CONFIGURED"}
    if payload.service_type not in {"standard_consultation", "specialist_review"}:
        return {"allowed": False, "reason": "SERVICE_NOT_AVAILABLE"}
    if payload.assessment_revision != 1:
        return {"allowed": False, "reason": "ASSESSMENT_REVISION_UNAVAILABLE"}
    mapping = session.scalar(select(RHIdentityMapping).where(
        RHIdentityMapping.persona == Persona.PATIENT.value,
        RHIdentityMapping.rh_record_id == payload.rh_patient_id,
    ))
    if mapping is None:
        return {"allowed": False, "reason": "PATIENT_MAPPING_NOT_FOUND"}
    triage = session.get(TriageSession, payload.assessment_id)
    if triage is None or triage.patient_id != mapping.joy_person_id or triage.status != "summarised":
        return {"allowed": False, "reason": "ASSESSMENT_NOT_CURRENT"}
    created_at = triage.created_at if triage.created_at.tzinfo else triage.created_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > created_at + _CLEARANCE_VALIDITY:
        return {"allowed": False, "reason": "ASSESSMENT_EXPIRED"}
    result = evaluate(ExtractedTriage.model_validate(triage.extracted))
    permitted = (
        (payload.service_type == "standard_consultation" and result.risk_level == "GREEN")
        or (payload.service_type == "specialist_review" and result.risk_level == "AMBER")
    )
    if not permitted:
        return {"allowed": False, "reason": "SERVICE_NOT_PERMITTED"}
    conversation = session.scalar(select(Conversation).where(
        Conversation.person_id == mapping.joy_person_id,
        Conversation.persona == Persona.PATIENT,
    ))
    policy = (conversation.booking_context or {}).get("policy_accepted") if conversation else None
    if not isinstance(policy, dict) or policy.get("version") != payload.policy_version:
        return {"allowed": False, "reason": "POLICY_NOT_ACCEPTED"}
    expires_at = created_at + _CLEARANCE_VALIDITY
    material = f"{mapping.joy_person_id}|{triage.id}|1|{payload.service_type}|{payload.policy_version}|{int(expires_at.timestamp())}"
    reference = hmac.new(settings.rh_safety_hmac_secret.encode(), material.encode(), hashlib.sha256).hexdigest()
    return {"allowed": True, "eligibility_reference": reference, "expires_at": expires_at.isoformat()}


@router.post("/safety/eligibility")
async def safety_eligibility(
    request: Request,
    settings: Settings = Depends(get_settings),
    session: Session = Depends(get_session),
) -> dict:
    raw_body = await request.body()
    _verify(raw_body, request, settings.rh_safety_hmac_secret)
    try:
        payload = EligibilityRequest.model_validate_json(raw_body)
    except ValueError as error:
        raise HTTPException(status_code=400, detail="invalid eligibility request") from error

    return issue_eligibility_reference(session=session, settings=settings, payload=payload)
