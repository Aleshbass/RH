"""Tap-to-answer WhatsApp buttons and lists for the steps where Joy expects a fixed reply.

Each button or list row id is exactly the text Joy already accepts when typed ("yes", "I agree",
"2", "home visit"...). A tap therefore reaches the same deterministic parser as typing, so no
conversation logic depends on buttons, and typing always keeps working.

Limits (WhatsApp Cloud API): up to 3 reply buttons, 20-character button titles; lists up to 10
rows, 24-character row titles, 72-character descriptions, 20-character menu button.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.booking.appointment_reminders import LAGOS
from app.booking.booking_flow import (
    AWAITING_INITIAL_CONSULTATION_CONFIRMATION,
    AWAITING_POLICY_ACCEPTANCE,
    AWAITING_RH_LOCATION,
    AWAITING_RH_PAYMENT_EMAIL,
    AWAITING_RH_PROVIDER,
    AWAITING_RH_SERVICE_MODE,
    AWAITING_RH_SLOT,
    AWAITING_TREATMENT_OPTION,
    pin_lookup_enabled,
)
from app.models.conversation import Conversation
from app.models.types import Persona

_TRIAGE_FLOW_KEY = "triage_flow_state"


def reply_buttons(*options: tuple[str, str]) -> dict[str, Any]:
    """Up to three buttons; each option is (id the tap sends back, visible title)."""
    return {
        "type": "button",
        "action": {"buttons": [
            {"type": "reply", "reply": {"id": reply_id[:256], "title": title[:20]}}
            for reply_id, title in options[:3]
        ]},
    }


def location_request() -> dict[str, Any]:
    """WhatsApp's "Send location" button: the reply is a location pin."""
    return {"type": "location_request_message", "action": {"name": "send_location"}}


def list_menu(button: str, rows: list[tuple[str, str, str | None]], *, section: str = "Choose one") -> dict[str, Any]:
    """A tap-to-open list; each row is (id the tap sends back, title, optional description)."""
    return {
        "type": "list",
        "action": {
            "button": button[:20],
            "sections": [{
                "title": section[:24],
                "rows": [
                    {"id": row_id[:200], "title": title[:24], **({"description": text[:72]} if text else {})}
                    for row_id, title, text in rows[:10]
                ],
            }],
        },
    }


def _provider_detail(provider: dict) -> str | None:
    parts = []
    if isinstance(provider.get("amount_kobo"), int):
        parts.append(f"₦{int(provider['amount_kobo']) // 100:,}")
    if isinstance(provider.get("distance_km"), (int, float)):
        km = float(provider["distance_km"])
        parts.append("about 1 km away" if km < 1.5 else f"about {round(km):,} km away")
    return " · ".join(parts) or None


def slot_label(start_ms: int | float) -> str:
    """'Mon 03 Nov, 10:00 AM' in Lagos time (24 characters at most)."""
    return datetime.fromtimestamp(start_ms / 1000, timezone.utc).astimezone(LAGOS).strftime("%a %d %b, %I:%M %p")


def interactive_for(conversation: Conversation | None) -> dict[str, Any] | None:
    """The buttons or list for the step this conversation is waiting on, if it has fixed answers."""
    if conversation is None:
        return None
    context = conversation.booking_context or {}
    step = conversation.booking_substate
    if step == AWAITING_POLICY_ACCEPTANCE:
        return reply_buttons(("I agree", "I agree"), ("no", "I don't agree"))
    if step == AWAITING_INITIAL_CONSULTATION_CONFIRMATION:
        return reply_buttons(("yes", "Yes, book online"), ("no", "Not now"))
    if step == AWAITING_TREATMENT_OPTION:
        return list_menu("See options", [
            ("1", "Quick consult (online)", "₦6,000 · video call from your phone, not a home visit"),
            ("2", "Full consult (online)", "₦20,000 · detailed video assessment from your phone"),
            ("3", "Home session", "In person · a physio comes to your home"),
            ("help me choose", "Help me choose", None),
        ])
    if step == AWAITING_RH_SERVICE_MODE:
        return reply_buttons(("online", "Online"), ("home visit", "Home visit"), ("clinic", "Clinic"))
    if step == AWAITING_RH_LOCATION:
        zones = [z for z in context.get("location_zones") or [] if isinstance(z, dict) and z.get("id")]
        if zones:
            return list_menu("Choose your area", [
                (str(z["id"]), str(z.get("title") or z["id"]), z.get("description")) for z in zones
            ], section=str(context.get("location_city") or "Areas"))
        if pin_lookup_enabled() and not context.get("location_asked_state"):
            return location_request()  # one tap shares the pin; typing still works
        if context.get("location_city") or context.get("location_asked_state"):
            return None  # waiting for a typed town or state
        return reply_buttons(("Lagos", "Lagos"), ("Abuja", "Abuja"), ("other state", "Other state"))
    if step == AWAITING_RH_PAYMENT_EMAIL and context.get("suggested_email"):
        return reply_buttons(("yes", "Yes, use that email"))
    if step == AWAITING_RH_PROVIDER:
        providers = [p for p in context.get("providers") or [] if isinstance(p, dict)]
        if providers:
            return list_menu("Choose a physio", [
                (str(index), str(p.get("display_name") or "Physiotherapist"), _provider_detail(p))
                for index, p in enumerate(providers, 1)
            ], section="Verified specialists")
    if step == AWAITING_RH_SLOT:
        slots = [s for s in context.get("slots") or [] if isinstance(s, dict) and isinstance(s.get("start"), (int, float))]
        if slots:
            return list_menu("Choose a time", [
                (str(index), slot_label(s["start"]), "Lagos time") for index, s in enumerate(slots, 1)
            ], section="Available times")
    if step:
        return None
    flow = context.get(_TRIAGE_FLOW_KEY)
    if flow == "awaiting_summary_confirmation":
        return reply_buttons(("yes", "Yes, that's right"), ("no", "Change something"))
    if flow == "awaiting_additional_details":
        return reply_buttons(("no", "No, that's all"), ("yes", "Yes, add more"))
    return None


def interactive_for_phone(session: Session, phone: str) -> dict[str, Any] | None:
    """Buttons for this patient's latest conversation; None for other personas or on any doubt."""
    from app.identity.resolver import resolve

    identity = resolve(session, phone)
    if identity is None or identity.persona != Persona.PATIENT:
        return None
    # A plain read (no row lock): the turn is already committed when the worker sends the reply
    conversation = session.scalar(
        select(Conversation).where(
            Conversation.person_id == identity.person_id, Conversation.persona == identity.persona,
        )
    )
    return interactive_for(conversation)
