"""Command adapter for Phase 4 RH-authoritative physio operations.

The command grammar is intentionally explicit on WhatsApp: it prevents a
message from being applied to the wrong appointment and lets RH verify the
same provider/booking relationship again.
"""
from __future__ import annotations

import re
from uuid import uuid4

from app.integrations.rh_client import RHActor, RHClient, RHIntegrationError

_BOOKING = r"(?P<booking>[A-Za-z0-9_-]+)"


def help_text() -> str:
    return (
        "Physio commands:\n"
        "WORK — view assigned bookings\n"
        "ACCEPT <booking ID> or REJECT <booking ID>\n"
        "NOTE <booking ID>: <session note>\n"
        "VISIT <booking ID> IN_TRANSIT|ARRIVED|DEPARTED <lat>,<lng> accuracy <metres>\n"
        "MESSAGE <booking ID>: <message for patient>\n"
        "FEEDBACK <booking ID>"
    )


def apply(
    client: RHClient,
    *,
    profile_id: str,
    actor: RHActor,
    text: str,
) -> str | None:
    raw = (text or "").strip()
    try:
        if raw.upper() in {"PT", "WORK", "HELP"}:
            result = client.operational_query("physio_work_summary", actor=actor, data={"physiotherapist_id": profile_id})
            bookings = result.get("assigned_bookings") or []
            if not bookings:
                return "You have no active Joy bookings right now.\n\n" + help_text()
            lines = ["Your active Joy bookings:"]
            for item in bookings:
                lines.append(f"• {item.get('booking_id')} — response: {item.get('provider_response', 'pending')}")
            return "\n".join(lines) + "\n\n" + help_text()

        response = re.fullmatch(rf"(?i)(ACCEPT|REJECT)\s+{_BOOKING}", raw)
        if response:
            # This endpoint is existing Phase 3 RH authority; operational
            # commands use the same verified RH user actor.
            result = client._request("POST", f"/api/v1/joy/bookings/{response.group('booking')}/respond", payload={
                "response": response.group(1).lower(), "physiotherapist_user_id": actor.rh_user_id, "actor": actor.as_payload(),
            }, idempotency_key=f"joy-physio-response-{response.group('booking')}-{response.group(1).lower()}")
            return "Booking response recorded by Rehabify." if result else "Booking response is being processed."

        note = re.fullmatch(rf"(?is)NOTE\s+{_BOOKING}\s*:\s*(?P<body>.+)", raw)
        if note:
            client.operational_mutation("physio_session_note", actor=actor, data={"physiotherapist_id": profile_id, "booking_id": note.group("booking"), "note": note.group("body")}, idempotency_key=f"joy-note-{note.group('booking')}-{uuid4()}")
            return "Your session note was saved to the confirmed appointment."

        visit = re.fullmatch(rf"(?i)VISIT\s+{_BOOKING}\s+(IN_TRANSIT|ARRIVED|DEPARTED)\s+(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s+ACCURACY\s+(\d+(?:\.\d+)?)", raw)
        if visit:
            client.operational_mutation("physio_visit_event", actor=actor, data={"physiotherapist_id": profile_id, "booking_id": visit.group("booking"), "event": visit.group(2).upper(), "latitude": float(visit.group(3)), "longitude": float(visit.group(4)), "accuracy": float(visit.group(5)), "event_time": __import__("time").time_ns() // 1_000_000, "patient_tracking_consent": True}, idempotency_key=f"joy-visit-{visit.group('booking')}-{visit.group(2).lower()}-{uuid4()}")
            return "Your visit event was recorded."

        message = re.fullmatch(rf"(?is)MESSAGE\s+{_BOOKING}\s*:\s*(?P<body>.+)", raw)
        if message:
            client.operational_mutation("physio_message_patient", actor=actor, data={"physiotherapist_id": profile_id, "booking_id": message.group("booking"), "message": message.group("body")}, idempotency_key=f"joy-message-{message.group('booking')}-{uuid4()}")
            return "Your message was recorded for delivery to the patient."

        feedback = re.fullmatch(rf"(?i)FEEDBACK\s+{_BOOKING}", raw)
        if feedback:
            result = client.operational_mutation("physio_feedback_request", actor=actor, data={"physiotherapist_id": profile_id, "booking_id": feedback.group("booking")}, idempotency_key=f"joy-feedback-{feedback.group('booking')}")
            return "A feedback request has been queued." if result.get("requested") else "A feedback request has already been sent for that appointment."
    except RHIntegrationError as error:
        return "I can’t reach Rehabify’s live operations service right now. Please try again shortly." if error.retryable else "That operation could not be completed. Please check the booking ID and try again."
    return None
