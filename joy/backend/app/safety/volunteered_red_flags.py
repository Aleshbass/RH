"""Deterministic detection of emergency symptoms a patient volunteers.

Joy's grouped safety screen asks approved questions *after* the opening story
is confirmed. A patient who opens with "chest pain" must not wait for that
screen: these RED-level phrases are matched on every patient message, before
any booking or summary logic, and never depend on the language model.

Scope is deliberately narrow. Only phrases that map to existing RED flags in
``clinical_engine`` are matched here; AMBER/ORANGE signs (fever, a fall, an
accident) stay with the protocol screen, where context such as "minor" or
"no fracture" can be weighed. A phrase preceded in the same clause by a
negation ("no chest pain", "I don't have chest pain") is ignored.

The vocabulary below is a starting set for clinical-lead review. Adding a
phrase can only make Joy more cautious; it can never clear a patient.
"""

from __future__ import annotations

import re

_RED_PHRASES: dict[str, tuple[str, ...]] = {
    "chest_pain": (
        r"chest\s+pains?",
        r"pains?\s+in\s+(?:my|the|his|her)\s+chest",
        r"chest\s+(?:tightness|pressure)",
        r"tight(?:ness)?\s+(?:in\s+)?(?:my\s+)?chest",
        r"chest\s+(?:de|dey)\s+pain",
    ),
    "sudden_neuro_deficit": (
        r"sudden\s+(?:weakness|numbness|loss\s+of\s+(?:strength|feeling|speech|vision))",
        r"(?:can['’]?t|cannot|can\s+not)\s+(?:speak|talk|move\s+(?:my\s+)?(?:arm|leg|face))",
        r"slurred\s+speech|speech\s+(?:is\s+)?slurred",
        r"face\s+(?:is\s+)?droop(?:ing|y)?|droop(?:ing|y)\s+(?:face|mouth)|mouth\s+(?:is\s+)?droop(?:ing)?",
    ),
    "saddle_anesthesia": (
        r"saddle\s+(?:numbness|anaesthesia|anesthesia)",
        r"numb(?:ness)?\s+(?:around|in|between)\s+(?:my\s+)?(?:groin|bottom|buttocks|private\s+parts?|inner\s+thighs?|saddle)",
        r"(?:groin|bottom|buttocks)\s+(?:is|feels|are)\s+numb",
    ),
    "bladder_bowel_change": (
        r"(?:can['’]?t|cannot|can\s+not|unable\s+to)\s+(?:pee|urinate|pass\s+urine|control\s+my\s+(?:bladder|bowels?|urine|stool))",
        r"lost\s+control\s+of\s+(?:my\s+)?(?:bladder|bowels?|urine|stool)",
        r"(?:bladder|bowel|urinary|faecal|fecal)\s+incontinence",
        r"wetting\s+myself|soiling\s+myself",
    ),
    "bilateral_leg_weakness": (
        r"weak(?:ness)?\s+in\s+both\s+(?:my\s+)?legs",
        r"both\s+(?:my\s+)?legs\s+(?:are\s+|feel\s+|keep\s+)?(?:weak|giving\s+way|numb)",
        r"bilateral\s+leg\s+weakness",
    ),
}

_COMPILED = {
    flag: tuple(re.compile(rf"\b(?:{pattern})", re.IGNORECASE) for pattern in patterns)
    for flag, patterns in _RED_PHRASES.items()
}

# A negation that governs the phrase: same clause, within a few words before it.
_NEGATION = re.compile(
    r"\b(?:no|not|never|without|nor|denies|deny|denied|"
    r"(?:do|does|did|have|has|had)\s*n['’]?o?t|don['’]?t|doesn['’]?t|didn['’]?t|"
    r"haven['’]?t|hasn['’]?t|hadn['’]?t|isn['’]?t|wasn['’]?t|"
    r"free\s+of|no\s+sign\s+of|any)\b[^.!?,;:\n]{0,40}$",
    re.IGNORECASE,
)


def is_negated(text: str, start: int) -> bool:
    """True when a negation in the same clause governs the phrase at ``start``."""
    window = text[max(0, start - 60):start]
    clause = re.split(r"[.!?;:\n]|\bbut\b|\bhowever\b|\balthough\b", window, flags=re.IGNORECASE)[-1]
    match = _NEGATION.search(clause)
    if match is None:
        return False
    # "any" only negates in a question/negative frame ("don't have any"),
    # which the other alternatives already capture; on its own it is not a
    # denial, e.g. "is there any chest pain? yes".
    return match.group(0).strip().lower().split()[0] != "any"


def detect_volunteered_red_flags(text: str | None) -> dict[str, bool]:
    """Return RED safety flags clearly reported (not denied) in ``text``."""
    source = text or ""
    flags: dict[str, bool] = {}
    for flag, patterns in _COMPILED.items():
        for pattern in patterns:
            if any(not is_negated(source, match.start()) for match in pattern.finditer(source)):
                flags[flag] = True
                break
    return flags
