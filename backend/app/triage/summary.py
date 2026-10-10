import re

from app.models.types import ExtractedTriage


def _natural_list(items: list[str]) -> str:
    """Render patient-provided list items without adding clinical interpretation."""
    values = [item.strip() for item in items if item and item.strip()]
    if len(values) <= 1:
        return values[0] if values else ""
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def _patient_to_you(phrase: str) -> str:
    """Turn a short extracted first-person phrase into patient-facing copy."""
    phrase = phrase.strip()
    phrase = re.sub(r"\bmy\b", "your", phrase, flags=re.IGNORECASE)
    return re.sub(r"\bi\b", "you", phrase, flags=re.IGNORECASE)


def _onset_sentence(body_location: str | None, onset: str) -> str:
    """Keep common duration extractions grammatical in a patient recap."""
    if onset.casefold().startswith("for "):
        timing = f"has been present {onset}"
    elif onset.casefold().endswith("ago"):
        timing = f"started {onset}"
    else:
        timing = f"started about {onset} ago"
    if body_location:
        return f"You are experiencing a problem affecting your {body_location} that {timing}."
    return f"Your symptoms {timing}."


def plain_summary(extracted: ExtractedTriage) -> str:
    """Give the patient a useful, factual recap before they proceed.

    This is intentionally composed only from the persisted extraction.  It
    should show that Joy understood the important details, but must not invent
    a diagnosis or repeat a safety conclusion.
    """
    sentences: list[str] = []

    if extracted.body_location and extracted.onset:
        sentences.append(_onset_sentence(extracted.body_location, extracted.onset))
    elif extracted.body_location:
        sentences.append(f"You are experiencing a problem affecting your {extracted.body_location}.")
    elif extracted.onset:
        sentences.append(_onset_sentence(None, extracted.onset))

    if extracted.mechanism:
        mechanism = _patient_to_you(extracted.mechanism)
        if mechanism.casefold().startswith(("twisted ", "sprained ", "injured ", "hurt ")):
            sentences.append(f"This began when you {mechanism}.")
        else:
            sentences.append(f"It began after {mechanism}.")
    if extracted.main_complaint:
        sentences.append(f"Your main concern is {extracted.main_complaint}.")

    symptoms = _patient_to_you(_natural_list(extracted.symptoms))
    if symptoms:
        sentences.append(f"You described {symptoms}.")
    if extracted.severity is not None:
        sentences.append(f"You rated the severity as {extracted.severity} out of 10.")

    aggravating = _patient_to_you(_natural_list(extracted.aggravating))
    # "pain when walking" already explains that walking aggravates it. Do not
    # make the recap sound mechanical by repeating the same fact twice.
    symptoms_lower = symptoms.casefold()
    if aggravating and aggravating.casefold() not in symptoms_lower:
        sentences.append(f"It is worse with {aggravating}.")
    relieving = _patient_to_you(_natural_list(extracted.relieving))
    if relieving:
        sentences.append(f"It feels better with {relieving}.")
    limitations = _patient_to_you(_natural_list(extracted.functional_limitations))
    if limitations:
        sentences.append(f"This is affecting {limitations}.")
    if extracted.goals:
        sentences.append(f"Your goal is to {_patient_to_you(extracted.goals)}.")

    detail = " ".join(sentences) or "I have noted what you described."
    return f"Here's what I understood: {detail}"


def confirmation_summary(extracted: ExtractedTriage) -> str:
    """Render the factual, scan-friendly recap used before safety screening."""
    lines: list[str] = []

    problem = extracted.main_complaint
    if not problem and extracted.body_location:
        symptom = _natural_list(extracted.symptoms)
        problem = f"{extracted.body_location} {symptom}" if symptom else f"{extracted.body_location} pain"
    if problem:
        lines.append(f"You have: {_patient_to_you(problem)}")

    timing_parts: list[str] = []
    if extracted.onset:
        onset = extracted.onset.strip()
        timing_parts.append(onset if onset.casefold().startswith(("for ", "about ", "over ")) else f"about {onset}")
    if extracted.mechanism:
        mechanism = _patient_to_you(extracted.mechanism)
        timing_parts.append(
            f"after {mechanism}" if not mechanism.casefold().startswith(("after ", "when ")) else mechanism
        )
    if timing_parts:
        lines.append(f"Started: {' '.join(timing_parts)}")

    treatments = _natural_list(extracted.previous_treatment)
    if treatments:
        lines.append(f"You’ve tried: {treatments}")
    if extracted.seen_clinician is not None:
        lines.append(f"You’ve seen a clinician: {'Yes' if extracted.seen_clinician else 'No'}")

    if not lines:
        return plain_summary(extracted)
    return "\n".join(lines)
