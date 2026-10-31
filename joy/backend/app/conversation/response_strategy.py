"""Build safe, state-grounded fallback wording for patient triage."""

from __future__ import annotations

from app.models.types import ExtractedTriage


_GENERIC_REPLIES = {
    "",
    "thanks — i received what you shared. i’m keeping the important details and will ask only for anything still needed to continue safely.",
}


_FIRST_CONTACT_WELCOME = (
    "Hello 👋 Welcome to Rehabify.\n\n"
    "Could you tell me what’s going on today?\n\n"
    "You can tell me:\n\n"
    "• what’s bothering you\n"
    "• which part of your body is affected\n"
    "• how long you’ve had it\n"
    "• whether you’ve seen anyone about it\n"
    "• anything you’ve already tried\n\n"
    "Just tell me in your own words. There’s no need to fill out a form."
)


def grounded_triage_ack(candidate_reply: str, extracted: ExtractedTriage) -> str:
    """Avoid claiming Joy lost context when provider output is generic.

    This is intentionally wording-only.  Safety and next-step selection stay
    in ``turn_handler`` and its deterministic protocol.
    """
    reply = (candidate_reply or "").strip()
    if reply.casefold() not in _GENERIC_REPLIES:
        return reply
    details: list[str] = []
    if extracted.body_location:
        details.append(f"your {extracted.body_location}")
    elif extracted.main_complaint:
        details.append(extracted.main_complaint)
    if extracted.onset:
        details.append(f"which started {extracted.onset}")
    if extracted.goals:
        details.append(f"your goal to {extracted.goals}")
    if not details:
        # No clinical facts have been supplied. Do not imply that the patient
        # has already explained a complaint or that triage has begun; this is
        # the normal path for messages such as "hey Joy".
        return _FIRST_CONTACT_WELCOME
    return "Thanks for explaining. I’ve noted " + ", ".join(details) + "."
