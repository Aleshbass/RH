import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.admin.stats_digest import digest
from app.config import Settings, get_settings
from app.db import get_session
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.rh_identity_mapping import RHIdentityMapping
from app.integrations.rh_client import RHIntegrationError, configured_rh_client
from app.queue.tasks import enqueue_booking_confirmed

router = APIRouter()


def require_job_token(
    x_internal_job_token: str | None = Header(default=None, alias="X-Internal-Job-Token"),
    settings: Settings = Depends(get_settings),
) -> None:
    expected = settings.internal_job_token
    provided = x_internal_job_token or ""
    if not expected or not provided or not secrets.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/api/internal/jobs/stats_digest", dependencies=[Depends(require_job_token)])
def stats_digest_job(session: Session = Depends(get_session)) -> dict[str, str]:
    return {"digest": digest(session)}


@router.post("/api/internal/jobs/rh_booking_reconciliation", dependencies=[Depends(require_job_token)])
def rh_booking_reconciliation_job(
    session: Session = Depends(get_session), settings: Settings = Depends(get_settings),
) -> dict[str, int]:
    """Repair missed patient notifications by reading RH only.

    RH remains authoritative: this job never confirms, changes, or recreates a
    booking in RH. It only records the last observed status in Joy's local
    conversation context and sends a notification on a status transition.
    """
    if not settings.rh_reconciliation_enabled:
        return {"checked": 0, "notified": 0, "unavailable": 0, "disabled": 1}
    checked = notified = unavailable = 0
    client = configured_rh_client()
    conversations = session.scalars(select(Conversation).where(Conversation.booking_context.is_not(None)).limit(200)).all()
    for conversation in conversations:
        context = dict(conversation.booking_context or {})
        booking_id = context.get("rh_booking_id")
        patient_id = context.get("rh_patient_id")
        if not isinstance(booking_id, str) or not isinstance(patient_id, str):
            continue
        checked += 1
        try:
            status = client.booking_status(booking_id, patient_id=patient_id)
        except RHIntegrationError:
            unavailable += 1
            continue
        observed = str(status.get("booking_status") or "unknown")
        prior = str(context.get("rh_reconciled_status") or "")
        context["rh_reconciled_status"] = observed
        conversation.booking_context = context
        if observed != prior and observed == "confirmed":
            mapping = session.scalar(select(RHIdentityMapping).where(
                RHIdentityMapping.persona == "patient", RHIdentityMapping.rh_record_id == patient_id,
            ))
            patient = session.get(Patient, mapping.joy_person_id) if mapping else None
            if patient:
                enqueue_booking_confirmed(patient.phone_e164, booking_id, "Your appointment is confirmed. I’ll send the details here.")
                notified += 1
    return {"checked": checked, "notified": notified, "unavailable": unavailable, "disabled": 0}
