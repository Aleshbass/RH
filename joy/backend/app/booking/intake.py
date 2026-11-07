"""What Joy shares with Rehabify about a booking: the intake for the physio, and journey stages.

Both are best-effort: a failure is logged and never blocks or changes the patient's booking.
- send_intake: the WhatsApp assessment (complaint, onset, pain, the safety answers, a
  clinician summary) attached to the booking, so the physio sees it before the session
  (RH joyHandoff.upsertJoyIntake). Shared for the patient's own care under the booking
  policy they accepted.
- journey: a stage on the patient's tracking timeline (matches shown, payment link sent).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.integrations.rh_client import configured_rh_client
from app.models.conversation import Conversation
from app.models.patient import Patient
from app.models.triage_session import TriageSession
from app.models.types import ExtractedTriage

logger = logging.getLogger(__name__)

_YES = {"yes", "y", "true", "1"}


def _text_list(*parts: Any) -> list[str]:
    items: list[str] = []
    for part in parts:
        if isinstance(part, str) and part.strip():
            items.append(part.strip())
        elif isinstance(part, (list, tuple)):
            items += [str(p).strip() for p in part if str(p).strip()]
    return list(dict.fromkeys(items))


def intake_payload(
    patient: Patient, conversation: Conversation, triage: TriageSession, *, rh_patient_id: str,
    booking_id: str, policy: dict,
) -> dict[str, Any]:
    from app.safety.evaluator import evaluate
    from app.triage.summary import confirmation_summary, plain_summary

    extracted = ExtractedTriage.model_validate(triage.extracted or {})
    safety = evaluate(extracted)
    level = {"GREEN": "green", "AMBER": "amber", "ORANGE": "amber", "RED": "red"}.get((safety.risk_level or "").upper())
    red_flags = [
        {"question": question.replace("_", " "), "answer": str(answer), "flagged": str(answer).strip().casefold() in _YES}
        for question, answer in (extracted.safety_answers or {}).items()
    ]
    history = _text_list(extracted.comorbidities, extracted.relevant_medical_history, extracted.previous_treatment)
    # The self-referral summary in the owner's layout (app/triage/self_referral.py), if Joy wrote one
    self_referral = (conversation.booking_context or {}).get("self_referral") or {}
    sr_summary = self_referral.get("physio_summary") if isinstance(self_referral, dict) else None
    if isinstance(self_referral, dict) and self_referral.get("outcome") == "urgent" and level == "green":
        level = "amber"  # urgent clinician review: the physio sees it flagged
    return {
        "patient_id": rh_patient_id,
        "booking_id": booking_id,
        "conversation_id": str(conversation.id),
        "assessment_id": str(triage.id),
        "assessment_revision": 1,
        "protocol_version": extracted.safety_protocol_version or "1.0.0",
        "triage_level": level,
        "chief_complaint": extracted.main_complaint,
        "body_areas": _text_list(extracted.body_region, extracted.body_location),
        "pain_score": extracted.severity,
        "onset": extracted.onset or extracted.mechanism,
        "duration": extracted.duration,
        "red_flags": red_flags,
        "aggravating_factors": list(extracted.aggravating or []),
        "easing_factors": list(extracted.relieving or []),
        "goals": extracted.goals or extracted.main_concern,
        "medical_history": "; ".join(history) or None,
        "clinician_summary": (f"{sr_summary}\n\n{confirmation_summary(extracted)}" if isinstance(sr_summary, str) and sr_summary else confirmation_summary(extracted)),
        "patient_summary": plain_summary(extracted),
        "language": getattr(patient, "preferred_language", None) or conversation.last_known_language,
        "consent": {
            "share_with_clinician": True,
            "policy_version": str(policy.get("version") or ""),
            "acceptance_reference": str(policy.get("acceptance_message_id") or policy.get("accepted_at") or policy.get("version") or ""),
            "given_at": int(datetime.now(timezone.utc).timestamp() * 1000),
        },
    }


def send_intake(session: Session, conversation: Conversation, patient: Patient, *, rh_patient_id: str, booking_id: str, policy: dict) -> bool:
    """Attach the WhatsApp assessment to the booking for the physio. Never raises."""
    try:
        triage = session.scalar(
            select(TriageSession).where(TriageSession.patient_id == patient.id).order_by(TriageSession.created_at.desc())
        )
        if triage is None:
            return False
        payload = {k: v for k, v in intake_payload(
            patient, conversation, triage, rh_patient_id=rh_patient_id, booking_id=booking_id, policy=policy,
        ).items() if v not in (None, "", [])}
        configured_rh_client().upsert_intake(payload)
        return True
    except Exception:
        logger.warning("joy_intake_not_sent", exc_info=True)
        return False


def journey(rh_patient_id: str | None, stage: str, event_id: str, *, booking_id: str | None = None) -> None:
    """One stage on the patient's tracking timeline. Never raises."""
    if not rh_patient_id:
        return
    try:
        configured_rh_client().record_journey_event(
            patient_id=rh_patient_id, stage=stage, event_id=event_id, booking_id=booking_id,
        )
    except Exception:
        logger.warning("joy_journey_event_not_sent stage=%s", stage, exc_info=True)
