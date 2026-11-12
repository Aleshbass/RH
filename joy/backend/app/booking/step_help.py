"""Questions a patient asks in the middle of a booking step.

The booking steps are code-owned: each waits for one kind of answer (a number, YES, an email,
a payment). A question that wasn't that answer used to fall through to the paid
specialist-review offer, even for patients with no warning signs ("What if I need a home
visit?" while a payment link was open). Now Joy answers the question from fixed booking facts,
then says what the step is still waiting for.

Common questions are answered in code. Anything else goes to the model with only these facts
and strict rules; its answer is dropped if it adds a link or a price that isn't in the facts.
"""

from __future__ import annotations

import logging
import re

logger = logging.getLogger(__name__)

# Only clear questions get a fixed answer; anything vaguer goes to the model with the facts.
# ("How long will my knee take to heal?" must not get "about 20 minutes".)
_SUBJECT = r"(?:the |my |this |your )?(?:call|consultation|session|appointment|booking)"
_HOME_RE = re.compile(r"home (visit|session|treatment)|visit (me|my home|my house)|come to (my|me|the) (house|home|place)|in[- ]person|face[- ]to[- ]face|at (my )?home", re.I)
_LOCATION_RE = re.compile(r"\b(my )?(location|address)\b|where (do|should) i (go|come)", re.I)
_PRICE_RE = re.compile(r"how much|\b(price|cost|fee|expensive|cheaper|discount)\b", re.I)
_DURATION_RE = re.compile(rf"how long (is|will|does) {_SUBJECT}|how many minutes|duration of", re.I)
_WHEN_RE = re.compile(rf"when (is|will|does) {_SUBJECT}|what time (is|will)|which day", re.I)
_WHO_RE = re.compile(r"who (is|will be) (my|the) (physio|clinician|doctor|therapist)|which (physio|clinician|doctor|therapist)|who will (see|call|treat) me", re.I)
_PAY_RE = re.compile(r"(do|must|should) i (need to |have to )?pay|pay (first|before|now)|why (do|should) i pay", re.I)
_REFUND_RE = re.compile(r"\b(refund|money back)\b", re.I)
# About the payment only: "Is it safe to walk on it?" is a clinical question, not this one
_SAFE_RE = re.compile(r"is (this|the) (link|payment|website|site|paystack)( link)? (safe|legit|legitimate|secure|real)|is (this|it) (legit|legitimate|a scam)\b|\b(scam|scammed|fraud)\b", re.I)
_JOIN_RE = re.compile(rf"how (do|will|can) i join|what app|do i (need to )?(download|install)|\bzoom\b", re.I)
_NAIRA_RE = re.compile(r"₦\s?[\d,]+")

# Same values as booking_flow's (imported there would be circular when this loads first)
AWAITING_RH_PAYMENT = "rh_awaiting_payment"
AWAITING_RH_PAYMENT_EMAIL = "rh_awaiting_payment_email"
AWAITING_RH_NAMED_PROVIDER = "rh_awaiting_named_provider"
AWAITING_RH_CONFIRM = "rh_awaiting_confirm"
AWAITING_RH_OTHER_TIME = "rh_awaiting_other_time"
NAMED_ROUTE = "named_online"


def _named(context: dict) -> bool:
    return context.get("booking_route") == NAMED_ROUTE


def _physio_name(context: dict) -> str | None:
    provider = context.get("selected_provider") or {}
    name = provider.get("display_name") if isinstance(provider, dict) else None
    return str(name) if name else None


def _amount(context: dict) -> str:
    amount = context.get("rh_amount_kobo")
    if isinstance(amount, int) and amount > 0:
        return f"₦{amount // 100:,}"
    return "₦6,000" if _is_online_consult(context) else ""


def _is_online_consult(context: dict) -> bool:
    return context.get("booking_route") in {"admin_scheduled_virtual", NAMED_ROUTE} or context.get("treatment_option") == "quick_initial"


def _paid(context: dict) -> bool:
    return context.get("rh_payment_status") == "succeeded" or context.get("rh_booking_status") == "confirmed"


def _facts(context: dict) -> list[str]:
    amount = _amount(context)
    facts: list[str] = []
    if _is_online_consult(context):
        facts += [
            f"The booking is the Initial Consultation with a clinician: a short online video call (about 20 minutes){', ' + amount if amount else ''}.",
            "Nobody comes to the patient's home for it. If hands-on care is needed, the clinician recommends it and home visits are arranged after the call.",
            "No address or location is needed for this online call. The patient joins from their phone with a secure link sent on WhatsApp.",
        ]
    elif amount:
        facts.append(f"The booking costs {amount}.")
    if _named(context):
        name = _physio_name(context)
        facts += [
            f"The patient is choosing a named physiotherapist{f' ({name})' if name else ''} and time themselves. "
            "After payment the physiotherapist has up to 2 hours to confirm; if they can't, Joy offers another physiotherapist or a full refund.",
            "Tapping Confirm and pay accepts the Consultation & Booking Policy and holds the time for 30 minutes.",
        ]
    else:
        facts.append("After payment, the care team assigns the clinician, date and time, and Joy sends the details here on WhatsApp.")
    facts += [
        "Payment is made on Paystack's secure checkout page. Rehabify never sees card details.",
        "Paid bookings are cancelled or moved from the Rehabify dashboard: 24 hours or more before the session gives a full refund.",
    ]
    facts.append("The payment has been received." if _paid(context) else "Joy has not received the payment yet. Before paying, the patient can reply CANCEL to stop.")
    return facts


def _known_answer(context: dict, text: str) -> str | None:
    """Code-owned answers to the questions patients ask most at this point."""
    online = _is_online_consult(context)
    amount = _amount(context)
    paid = _paid(context)
    if online and _HOME_RE.search(text):
        return (
            "This first step is an online video consultation, so nobody comes to your home for it. "
            "If you need hands-on care, the clinician will recommend it and home visits can be arranged after the call."
        )
    if online and _LOCATION_RE.search(text):
        prefix = "No, you don't need to share your location. " if re.search(r"\b(do i|need|have to|must)\b", text, re.I) else ""
        return (
            f"{prefix}This consultation is an online video call you join from your phone, so we don't need your address for it. "
            "If home visits are arranged later, we'll ask for your address then."
        )
    if _REFUND_RE.search(text):
        if paid:
            return "Paid bookings are cancelled from your Rehabify dashboard. 24 hours or more before the session, you get a full refund."
        return "You haven't paid yet, so there's nothing to refund. If you'd rather not go ahead, reply CANCEL."
    if _PRICE_RE.search(text) and amount:
        return f"It's {amount}{' for the online Initial Consultation' if online else ''}."
    if _DURATION_RE.search(text) and online:
        return "It's a short video call, about 20 minutes."
    if _WHO_RE.search(text):
        if _named(context):
            name = _physio_name(context)
            return f"You're booking with {name}, the physiotherapist you chose." if name else "You choose your physiotherapist from the list: reply with their number."
        return "Your clinician is assigned after payment. I'll send their name with your appointment details."
    if _WHEN_RE.search(text):
        if _named(context):
            return "It's the time shown with your physiotherapist. Tap *Choose another time* if you'd like a different one."
        return "Once your payment comes through, our care team sets your clinician, date and time and I'll send them here."
    if _SAFE_RE.search(text):
        return "Yes. You pay on Paystack's secure checkout page, and Rehabify never sees your card details."
    if online and _JOIN_RE.search(text):
        return "You join from your phone. I'll send a secure video link here before the call; there's nothing to install."
    if _PAY_RE.search(text) and not paid:
        if _named(context):
            return "Yes, payment comes first: it secures your time, then your physiotherapist confirms it (within 2 hours)."
        return "Yes, payment comes first: it confirms your place, then our care team books your clinician and time."
    return None


def _model_answer(llm, context: dict, text: str) -> str | None:
    if llm is None:
        return None
    facts = _facts(context)
    prompt = (
        "You are Joy, Rehabify's WhatsApp care assistant. The patient is part-way through booking. "
        "Reply to their message in one or two short, warm sentences, using ONLY the facts below. "
        "Never give medical advice, a diagnosis or exercises. Never invent prices, dates, times, names, links or policies. "
        "If the facts don't answer it, say the care team will help with that once the booking is set up. "
        "Don't include the payment link; Joy adds it after your answer. "
        "Put your answer in reply_text; leave extraction and triage_decision empty.\n\nFacts:\n- "
        + "\n- ".join(facts)
    )
    try:
        reply = (llm.complete(prompt, text).reply_text or "").strip()
    except Exception:  # the model is optional here; the fixed reply still goes out
        logger.warning("joy_step_help_model_failed", exc_info=True)
        return None
    if not reply or len(reply) > 450 or re.search(r"https?://|www\.", reply, re.I):
        return None
    allowed = set(_NAIRA_RE.findall(" ".join(facts)))
    if any(price not in allowed for price in _NAIRA_RE.findall(reply)):
        return None
    return reply


def step_reminder(substate: str | None, context: dict) -> str:
    """What the current step is still waiting for."""
    if _paid(context):
        if _named(context):
            name = _physio_name(context) or "Your physiotherapist"
            return f"Your payment has been received. {name} will confirm your consultation within 2 hours, and I'll message you here."
        return "Your payment has been received. Our care team will send your clinician, date and time here shortly."
    if substate == AWAITING_RH_NAMED_PROVIDER:
        return "To book, reply with the number of the physiotherapist you'd like."
    if substate == AWAITING_RH_CONFIRM:
        return "When you're ready, tap *Confirm and pay*, *Choose another time* or *Cancel*."
    if substate == AWAITING_RH_OTHER_TIME:
        return "Reply with the number of the time you'd like, or *Back* to keep the first one."
    if substate == AWAITING_RH_PAYMENT:
        url = str(context.get("authorization_url") or "")
        if url.startswith("https://"):
            return (
                f"To go ahead, pay securely here: {url}\n\n"
                "If you've already paid, it can take a minute to show. I'll message you here as soon as it does."
            )
        return "I'll message you here as soon as your payment comes through."
    if substate == AWAITING_RH_PAYMENT_EMAIL:
        return "To go ahead, tap WhatsApp is fine to get your receipt here, or reply with your email address."
    return "Tell me if anything about your problem has changed, or ask me anything else."


def booking_step_help(substate: str | None, context: dict, user_text: str, *, llm=None) -> str:
    text = (user_text or "").strip()
    answer = _known_answer(context, text) or _model_answer(llm, context, text)
    reminder = step_reminder(substate, context)
    return f"{answer}\n\n{reminder}" if answer else reminder
