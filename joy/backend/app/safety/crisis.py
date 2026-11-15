"""Suicide, self-harm and abuse: checked first on every message, from anyone (Nov 2026 audit).

Before this, "I want to kill myself" or "my husband beats me" went through the ordinary physio
triage. The check is deterministic (no model), runs before identity, booking or triage logic, and
covers English and Nigerian Pidgin. "This pain is killing me" is not a crisis; "I'm not suicidal"
is not one either (a negation in the same clause clears the match).

The vocabulary is a starting set for clinical-lead review: adding a phrase only makes Joy more
careful. Helpline numbers other than 112 are added only once clinically vetted (JOY_CRISIS_HELPLINES).
"""

from __future__ import annotations

import re

from app.safety.volunteered_red_flags import is_negated

_PATTERNS: dict[str, tuple[str, ...]] = {
    "self_harm": (
        r"(?:kill|killing|hurt|hurting|harm|harming|cut|cutting)\s+my\s*self",
        r"suicid\w*",
        r"(?:end|ending|take|taking)\s+my\s+(?:own\s+)?life",
        r"end\s+it\s+all",
        r"(?:want|wanna|going|ready)\s+to\s+die",
        r"(?:want|wish)\s+(?:i\s+(?:was|were)\s+|to\s+be\s+)dead",
        r"better\s+off\s+dead",
        r"no\s+(?:reason|point)\s+(?:to|in)\s+(?:live|living|go(?:ing)?\s+on)",
        r"(?:don['’]?t|do\s+not)\s+want\s+to\s+(?:live|be\s+alive|wake\s+up)",
        r"i\s+no\s+wan\s+(?:live|dey\s+alive|wake\s+up)",
        r"make\s+i\s+(?:just\s+)?die",
        r"i\s+wan\s+(?:kill\s+myself|die)",
    ),
    "abuse": (
        r"(?:husband|wife|partner|boyfriend|girlfriend|fianc[eé]e?|father|mother|dad|mum|uncle|aunt|brother|sister|"
        r"in-?law|boss|madam|oga|he|she|they)\s+(?:always\s+|keeps?\s+|dey\s+)?"
        r"(?:beats?|beating|hits?|hitting|slapped|slaps|punched|punches|kicked|kicks|attacked|abused|abuses|raped|"
        r"chokes?|choked|burnt|burned)\s+me",
        r"(?:beating|hitting|abusing|raping)\s+me",
        r"i(?:['’]m|\s+am)\s+(?:being\s+)?(?:abused|beaten|raped|assaulted)",
        r"domestic\s+(?:violence|abuse)",
        r"sexual(?:ly)?\s+(?:assault\w*|abus\w*)",
        r"(?:e|im|my\s+husband|my\s+wife|my\s+oga)\s+(?:dey\s+)?(?:beat|flog)\s+me",
    ),
}
_COMPILED = {kind: tuple(re.compile(rf"\b(?:{p})", re.IGNORECASE) for p in patterns) for kind, patterns in _PATTERNS.items()}


def detect_crisis(text: str | None) -> str | None:
    """"self_harm", "abuse", or None. Self-harm wins when both are present."""
    source = " ".join((text or "").split())
    for kind in ("self_harm", "abuse"):
        for pattern in _COMPILED[kind]:
            if any(not is_negated(source, match.start()) for match in pattern.finditer(source)):
                return kind
    return None


def crisis_reply(kind: str, helplines: str = "") -> str:
    if kind == "abuse":
        text = (
            "Thank you for telling me. What is happening to you is not okay, and it is not your fault.\n\n"
            "If you are in danger right now, please call 112, or go somewhere safe: a trusted neighbour or "
            "relative, or the nearest police station or hospital.\n\n"
            "I've asked someone from our care team to contact you privately. If you are hurt, please see a "
            "doctor first."
        )
    else:
        text = (
            "I'm really glad you told me, and I'm sorry you're going through this. You matter, and you "
            "don't have to face this alone.\n\n"
            "If you might act on these thoughts, or you are in danger right now, please call 112 or go to "
            "the nearest hospital emergency department now. If you can, ask someone you trust to stay with you.\n\n"
            "I've asked someone from our care team to contact you. You can keep talking to me here."
        )
    extra = (helplines or "").strip()
    return f"{text}\n\n{extra}" if extra else text


FLAGGED_BY_OTHERS_REPLY = (
    "What you're describing can be a medical emergency. Please call 112 now, or go to the nearest "
    "hospital emergency department. If the person has chest pain, weakness or feels faint, don't let "
    "them drive themselves.\n\nI've let our care team know."
)
