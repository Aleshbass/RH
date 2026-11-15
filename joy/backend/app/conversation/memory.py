"""Joy's long-term memory of each patient (owner, 14 Nov 2026: "an insane memory of previous chats").

Joy reads only the latest messages of a chat on each turn. Everything older lives here: a short,
factual note per patient (their problem and history, care with Rehabify, preferences, family,
promises Joy made), rewritten by the model from the old note plus the new messages once a chat
has gone quiet for a few minutes (the reconciliation job, every 10 minutes). The note reaches
the model on every turn as part of KNOWN_FACTS (app/conversation/state_manager.py).

It holds health information, so it lives with the messages in Joy's database and is deleted
with them.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, Message
from app.models.patient import Patient
from app.models.types import Persona

logger = logging.getLogger(__name__)

MEMORY_MAX_CHARS = 2000
IDLE_BEFORE_REFRESH = timedelta(minutes=10)  # a chat that has gone quiet
MESSAGES_PER_REFRESH = 80
_LAGOS_OFFSET = timedelta(hours=1)

MEMORY_PROMPT = """You keep the long-term memory of Joy, the WhatsApp assistant of Rehabify (physiotherapy in Nigeria), about ONE patient.
Rewrite the memory from the CURRENT MEMORY and the NEW MESSAGES. Use short factual bullet points under these headings, leaving out empty ones:
About them; Their problem and history (with dates); Care with Rehabify (physiotherapists, bookings, programmes, how it went); Preferences (language, physiotherapist, times, receipts, how they like to be addressed); Family and carers; Promises Joy made (what, and by when); Take care with.
Rules:
- Only facts the patient said, or that Joy's own messages state as done (a booking, a payment, a programme). Never add a diagnosis, a guess or advice.
- Newer messages win: drop anything corrected or out of date (a cancelled booking is history, not upcoming).
- Keep dates and times as written (Lagos time). Write in English whatever language the chat used.
- At most 2,000 characters. Put the whole updated memory, and nothing else, in reply_text."""


def memory_fact(patient: Patient | None) -> str | None:
    """The note for KNOWN_FACTS, or None when there isn't one yet."""
    text = (getattr(patient, "memory_summary", None) or "").strip()
    return text[:MEMORY_MAX_CHARS] if text else None


def _stamp(when: datetime | None) -> str:
    if when is None:
        return "?"
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return (when.astimezone(timezone.utc) + _LAGOS_OFFSET).strftime("%d %b %Y %H:%M")


def _transcript(messages: list[Message]) -> str:
    lines = []
    for message in messages:
        who = "patient" if message.role == "user" else "joy"
        text = " ".join((message.text or "").split())[:600]
        if text:
            lines.append(f"[{_stamp(message.created_at)}] {who}: {text}")
    return "\n".join(lines)


def refresh_patient_memory(session: Session, llm, patient: Patient) -> bool:
    """Fold the patient's messages since the last refresh into their note. True when it changed."""
    since = patient.memory_updated_at
    query = (
        select(Message)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.person_id == patient.id, Conversation.persona == Persona.PATIENT)
    )
    if since is not None:
        query = query.where(Message.created_at > since)
    newest_first = session.scalars(query.order_by(Message.created_at.desc()).limit(MESSAGES_PER_REFRESH)).all()
    if not newest_first:
        return False
    messages = list(reversed(newest_first))
    transcript = _transcript(messages)
    last_at = messages[-1].created_at
    if not transcript:
        patient.memory_updated_at = last_at
        return False
    current = (patient.memory_summary or "").strip() or "(nothing yet)"
    try:
        response = llm.complete(MEMORY_PROMPT, f"CURRENT MEMORY:\n{current}\n\nNEW MESSAGES (oldest first):\n{transcript}")
    except Exception:
        logger.warning("joy_memory_refresh_failed", exc_info=True)
        return False  # tried again next run: nothing is marked done
    note = (response.reply_text or "").strip()
    if len(note) < 20 or note.startswith("Thanks — I received what you shared"):
        logger.warning("joy_memory_refresh_unusable")
        return False
    patient.memory_summary = note[:MEMORY_MAX_CHARS]
    patient.memory_updated_at = last_at
    return True


def refresh_due_memories(session: Session, llm, *, limit: int = 10, now: datetime | None = None) -> int:
    """Patients whose chat has new messages and has been quiet for a while: refresh their notes."""
    now = now or datetime.now(timezone.utc)
    last = (
        select(Conversation.person_id.label("pid"), func.max(Message.created_at).label("last_at"))
        .join(Message, Message.conversation_id == Conversation.id)
        .where(Conversation.persona == Persona.PATIENT)
        .group_by(Conversation.person_id)
        .subquery()
    )
    due = session.scalars(
        select(Patient)
        .join(last, last.c.pid == Patient.id)
        .where(
            last.c.last_at < now - IDLE_BEFORE_REFRESH,
            or_(Patient.memory_updated_at.is_(None), Patient.memory_updated_at < last.c.last_at),
        )
        .order_by(last.c.last_at.desc())
        .limit(limit)
    ).all()
    refreshed = 0
    for patient in due:
        if refresh_patient_memory(session, llm, patient):
            refreshed += 1
        session.flush()
    return refreshed
