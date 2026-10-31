from __future__ import annotations

import json
import re
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.llm.gemini_client import LLMClient
from app.models.booking import Booking
from app.models.session_note import SessionNote
from app.models.types import BookingStatus

_SOAP_PROMPT = (
    "Extract a physiotherapy session note as JSON with keys "
    "subjective, objective, and plan. Put those fields in extraction. "
    "reply_text may recap the note."
)
_NOTE_RE = re.compile(r"(?i)\bsession note\b|\bsoap note\b|\bfile (?:a )?note\b")


def note_from_voice(
    session: Session,
    booking_id: UUID | str,
    transcript: str,
    llm: LLMClient,
) -> SessionNote:
    booking = session.get(Booking, booking_id)
    if booking is None:
        raise ValueError(f"booking not found: {booking_id}")
    subjective, objective, plan = _soap_fields(llm, transcript or "")
    note = SessionNote(
        booking_id=booking.id,
        subjective=subjective,
        objective=objective,
        plan=plan,
        transcript=transcript or "",
    )
    session.add(note)
    session.flush()
    return note


def apply_note_turn(
    session: Session,
    physio_id: UUID,
    text: str,
    llm: LLMClient,
) -> str | None:
    if not _NOTE_RE.search(text or ""):
        return None
    booking = _latest_confirmed_booking(session, physio_id)
    if booking is None:
        return None
    transcript = _NOTE_RE.sub("", text or "", count=1).lstrip(" :-")
    note = note_from_voice(session, booking.id, transcript or text, llm)
    return (
        "Session note saved.\n"
        f"Subjective: {note.subjective}\n"
        f"Objective: {note.objective}\n"
        f"Plan: {note.plan}"
    )


def _soap_fields(llm: LLMClient, transcript: str) -> tuple[str, str, str]:
    response = llm.complete(_SOAP_PROMPT, transcript)
    data = dict(response.extraction_json or {})
    if not _has_soap(data):
        parsed = _parse_json(response.reply_text) or _parse_json(transcript)
        if parsed:
            nested = parsed.get("extraction")
            data = nested if isinstance(nested, dict) else parsed
    return (
        str(data.get("subjective") or ""),
        str(data.get("objective") or ""),
        str(data.get("plan") or ""),
    )


def _has_soap(data: dict) -> bool:
    return any(data.get(key) for key in ("subjective", "objective", "plan"))


def _parse_json(raw: str) -> dict | None:
    text = (raw or "").strip()
    if not text:
        return None
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        return None
    return payload if isinstance(payload, dict) else None


def _latest_confirmed_booking(session: Session, physio_id: UUID) -> Booking | None:
    return session.scalar(
        select(Booking)
        .where(
            Booking.physio_id == physio_id,
            Booking.status == BookingStatus.CONFIRMED,
        )
        .order_by(Booking.created_at.desc())
    )
