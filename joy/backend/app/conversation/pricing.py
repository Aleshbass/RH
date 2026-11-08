"""Price questions: "how much will my physiotherapy cost?", "how much is a home visit?", "I can't afford it".

The landing page's "Ask Joy about pricing" button opens WhatsApp with one, and patients ask them at
any point in a chat. They are answered in code from Rehabify's live price list
(app/integrations/rh_catalogue.py), never by the model, so Joy can't quote a wrong price.

The answers follow the owner's rules: the first step is always the online Initial Recovery
Consultation (7 Nov 2026), a general question gets every price (8 Nov 2026), anything after the
first step is recommended by the physiotherapist and priced before the patient pays, and support
from Joy between sessions is included for Rehabify Care patients in treatment
(convex/helpers/patientPlans.ts).
"""

from __future__ import annotations

import re

from app.integrations.rh_catalogue import Service, catalogue

PAY_LATER_URL = "https://physioaroundme.com/pay-later"
ACCESS_URL = "https://physioaroundme.com/rehabify-access"

_APOSTROPHES = str.maketrans({"’": "'", "‘": "'", "`": "'"})

# Words that only ever mean money here
_MONEY_RE = re.compile(
    r"\b(?:price|prices|pricing|priced|cost|costs|fee|fees|charge|charges|charging|tariffs?|rate\s*card|"
    r"naira|afford(?!\s+to\b)|affordable|expensive|cheap|cheaper|discount|discounts|hmo|insurance|insured|nhis)\b|₦",
    re.I,
)
# "How much …?" is a price question unless it's about the body or the exercises
_HOW_MUCH_RE = re.compile(r"\bhow\s+much\b", re.I)
_NOT_MONEY_RE = re.compile(
    r"\b(?:hurt|hurts|pain|painful|exercise|exercises|sets?|reps?|time|long|longer|weight|water|rest|sleep|"
    r"walk|walking|move|bend|stretch|swelling|medicine|medication|tablets?|dose)\b",
    re.I,
)
# "Is it free?", "do I have to pay?", and the same question in Pidgin, Yorùbá, Igbo and Hausa
_OTHER_RE = re.compile(
    r"\bis\s+(?:it|this|joy|chatting|the\s+chat)\s+free\b|\bfree\s+of\s+charge\b"
    r"|\bdo\s+i\s+(?:have\s+to\s+|need\s+to\s+)?pay\b|\bhow\s+do\s+(?:you|una)\s+charge\b"
    r"|\bwetin\s+be\s+(?:the\s+)?(?:price|cost|money)\b|\bhow\s+much\s+e\s+be\b|\bhow\s+much\s+una\b"
    r"|\belo\s+ni\b|\bole\s+ego\b|\bego\s+ole\b|\bnawa\s+ne\b|\bkudin\b",
    re.I,
)
# Payment mechanics and refunds have their own answers (booking step help, the refund flow)
_NOT_A_PRICE_QUESTION_RE = re.compile(
    r"\b(?:refund|refunded|money\s+back|i\s+(?:have\s+)?paid|payment\s+link|(?<!rate )card|transfer|receipt)\b"
    r"|\bcosting\s+me\b",
    re.I,
)

_TOPICS = (
    ("hmo", re.compile(r"\b(?:hmo|insurance|insured|nhis|health\s+plan)\b", re.I)),
    ("afford", re.compile(
        r"\b(?:afford(?!\s+to\b)|can'?t\s+pay|cannot\s+pay|no\s+money|too\s+expensive|expensive|cheaper|discount|loan|"
        r"instal+ments?|spread\s+the\s+cost|pay\s+later|small\s+small)\b", re.I)),
    ("list", re.compile(
        r"\b(?:price\s*list|all\s+(?:your\s+|the\s+)?prices|full\s+price|rate\s*card|tariffs?|list\s+of\s+prices|"
        r"every\s+price|all\s+(?:your\s+|the\s+)?services)\b", re.I)),
    ("support", re.compile(
        r"\b(?:reminders?|daily\s+support|recovery\s+support|flex|check-?ins?|programme|program|app)\b", re.I)),
    ("home", re.compile(r"\b(?:home|house|visit|visits|come\s+to\s+(?:me|my|you)|at\s+my\s+place)\b", re.I)),
    ("assessment", re.compile(r"\b(?:assessment|assessments|comprehensive|evaluation)\b", re.I)),
    ("treatment", re.compile(
        r"\b(?:treatment|treatments|session|sessions|follow-?up|review|reviews|weekly|therapy\s+sessions|"
        r"each\s+time|per\s+visit)\b", re.I)),
)


def _plain(text: str | None) -> str:
    return " ".join((text or "").translate(_APOSTROPHES).split())


def is_price_question(text: str | None) -> bool:
    """A question about what care costs (not a payment step, a refund or "how much does it hurt")."""
    plain = _plain(text)
    if not plain or len(plain) > 300 or _NOT_A_PRICE_QUESTION_RE.search(plain):
        return False
    if _MONEY_RE.search(plain) or _OTHER_RE.search(plain):
        return True
    return bool(_HOW_MUCH_RE.search(plain)) and not _NOT_MONEY_RE.search(plain)


def price_topic(text: str | None) -> str:
    plain = _plain(text)
    for topic, pattern in _TOPICS:
        if pattern.search(plain):
            return topic
    return "general"


def naira(kobo: int) -> str:
    return f"₦{kobo / 100:,.0f}"


def _price(service: Service) -> str:
    return f"{naira(service.price_kobo)} plus a travel charge for your area" if service.travel else naira(service.price_kobo)


def _line(service: Service) -> str:
    return f"• {service.name} ({service.duration}): {_price(service)}"


def _bookable(services: dict[str, Service], *ids: str) -> list[Service]:
    return [services[ident] for ident in ids if ident in services and services[ident].bookable]


def _first_step(services: dict[str, Service]) -> Service:
    return services["recovery_consultation"]


def help_paying_text() -> str:
    return (
        "Need help paying? MediLoan from MyItura lets you spread the cost "
        f"({PAY_LATER_URL}), and Rehabify Access offers reduced fees for eligible patients ({ACCESS_URL})."
    )


_LATER_CARE = ("virtual_assessment", "home_assessment", "virtual_treatment", "home_treatment", "virtual_review", "home_review")


def general_answer(services: dict[str, Service]) -> str:
    """Every price, first step first (the owner chose the full list for a general question, 8 Nov 2026)."""
    first = _first_step(services)
    lines = "\n".join(_line(service) for service in _bookable(services, *_LATER_CARE))
    return (
        "Chatting with me is free. Here's how the cost works:\n\n"
        f"*1. Your first step: {first.name}, {naira(first.price_kobo)}*\n"
        f"A short video call ({first.duration}) with a licensed physiotherapist, who goes through your problem and "
        "recommends the right next step.\n\n"
        "*2. If your physiotherapist recommends more care*\n"
        f"{lines}\n\n"
        "Every price is all-inclusive, and I show you the exact price before you pay, so you always decide.\n\n"
        "*3. Between sessions*\n"
        "My reminders and check-ins here on WhatsApp are included while you're in treatment with Rehabify Care.\n\n"
        f"{help_paying_text()}"
    )


def home_answer(services: dict[str, Service]) -> str:
    first = _first_step(services)
    lines = "\n".join(_line(service) for service in _bookable(services, "home_assessment", "home_treatment", "home_review"))
    return (
        "Home visits are arranged after your first consultation, if your physiotherapist recommends them:\n\n"
        f"{lines}\n\n"
        "I show you the full price, including travel, before you pay. Everyone starts with the "
        f"{naira(first.price_kobo)} online {first.name}, so you never pay for a home visit you may not need."
    )


def treatment_answer(services: dict[str, Service]) -> str:
    first = _first_step(services)
    lines = "\n".join(_line(service) for service in _bookable(
        services, "virtual_treatment", "virtual_review", "home_treatment", "home_review",
    ))
    return (
        "Treatment is recommended by your physiotherapist after your first consultation "
        f"(the {naira(first.price_kobo)} online {first.name}). Each session is priced on its own:\n\n"
        f"{lines}\n\n"
        "How many sessions you need depends on your physiotherapist's plan. I show you each price before you pay."
    )


def assessment_answer(services: dict[str, Service]) -> str:
    first = _first_step(services)
    lines = "\n".join(_line(service) for service in _bookable(services, "virtual_assessment", "home_assessment"))
    return (
        f"Your first step is the {first.name}: a short video call ({first.duration}), {naira(first.price_kobo)}. "
        "If your physiotherapist then recommends a full assessment, it's:\n\n"
        f"{lines}\n\n"
        "I show you the exact price before you pay."
    )


def list_answer(services: dict[str, Service]) -> str:
    first = _first_step(services)
    later = _bookable(services, *_LATER_CARE)
    lines = "\n".join(_line(service) for service in later)
    return (
        f"*Your first step*\n• {first.name} ({first.duration}, online): {naira(first.price_kobo)}\n\n"
        f"*If your physiotherapist recommends more care*\n{lines}\n\n"
        "Every price is all-inclusive, and I show it to you before you pay.\n\n"
        f"{help_paying_text()}"
    )


def support_answer(services: dict[str, Service]) -> str:
    return (
        "My reminders, check-ins and answers here on WhatsApp are included while you're in treatment with "
        "Rehabify Care, and your written exercise plan in the app is always free. You only pay for your sessions."
    )


def afford_answer(services: dict[str, Service]) -> str:
    first = _first_step(services)
    return (
        "There are options. MediLoan from MyItura lets you spread the cost, and Rehabify Access offers reduced "
        "fees for eligible patients.\n\n"
        f"• MediLoan: {PAY_LATER_URL}\n"
        f"• Rehabify Access: {ACCESS_URL}\n\n"
        f"Your first step is the {naira(first.price_kobo)} online {first.name}. If you'd like someone to talk "
        "you through the options, reply *call me*."
    )


HMO_ANSWER = (
    "I've asked our team to check your HMO or insurance cover. They'll get back to you on this number "
    "within 1 working day."
)

_ANSWERS = {
    "general": general_answer,
    "home": home_answer,
    "treatment": treatment_answer,
    "assessment": assessment_answer,
    "list": list_answer,
    "support": support_answer,
    "afford": afford_answer,
}


def price_answer(text: str | None, services: dict[str, Service] | None = None) -> tuple[str, str]:
    """(the answer, its topic). The "hmo" topic also needs an admin alert (the caller sends it)."""
    topic = price_topic(text)
    if topic == "hmo":
        return HMO_ANSWER, topic
    return _ANSWERS[topic](services or catalogue()), topic
