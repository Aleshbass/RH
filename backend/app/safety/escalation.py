from app.models.types import SafetyResult

_OPENERS: dict[str, str] = {
    "cauda_equina": (
        "I'm concerned about the numbness around your saddle area and what it "
        "could mean for the nerves in your lower spine."
    ),
    "infection": (
        "I'm concerned these fevers or night sweats could mean an infection."
    ),
    "malignancy_screen": (
        "I'm concerned about these warning signs in your history and symptoms."
    ),
    "major_trauma": (
        "I'm concerned about this recent injury and whether something is "
        "seriously damaged."
    ),
    "cardiac": "I'm concerned about the chest pain you described.",
    "acute_neuro": (
        "I'm concerned about this sudden change in your nerves or strength."
    ),
}

_DEFAULT_OPENER = (
    "I'm concerned about what you're describing, and I want to be careful with you."
)

_INSTRUCTION = (
    "Please see a doctor or go to an emergency hospital now. "
    "This needs medical care today, not a later appointment."
)


def patient_message(result: SafetyResult) -> str:
    if not result.fired:
        return ""
    if len(result.rule_ids) == 1:
        opener = _OPENERS.get(result.rule_ids[0], _DEFAULT_OPENER)
    else:
        opener = (
            "I'm concerned about several warning signs in what you described."
        )
    reason = result.reason_plain_language.strip()
    parts = [opener]
    if reason:
        parts.append(reason)
    parts.append(_INSTRUCTION)
    return "\n\n".join(parts)
