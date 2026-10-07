from app.models.types import ExtractedTriage


def _natural_list(items: list[str]) -> str:
    """Render patient-provided list items without adding clinical interpretation."""
    values = [item.strip() for item in items if item and item.strip()]
    if len(values) <= 1:
        return values[0] if values else ""
    if len(values) == 2:
        return f"{values[0]} and {values[1]}"
    return f"{', '.join(values[:-1])}, and {values[-1]}"


def plain_summary(extracted: ExtractedTriage) -> str:
    """Give the patient a useful, factual recap before they proceed.

    This is intentionally composed only from the persisted extraction.  It
    should show that Joy understood the important details, but must not invent
    a diagnosis or repeat a safety conclusion.
    """
    sentences: list[str] = []

    if extracted.body_location and extracted.onset:
        sentences.append(
            f"You are experiencing a problem affecting your {extracted.body_location} "
            f"that started {extracted.onset}."
        )
    elif extracted.body_location:
        sentences.append(f"You are experiencing a problem affecting your {extracted.body_location}.")
    elif extracted.onset:
        sentences.append(f"Your symptoms started {extracted.onset}.")

    if extracted.mechanism:
        sentences.append(f"It began after {extracted.mechanism}.")
    if extracted.main_complaint:
        sentences.append(f"Your main concern is {extracted.main_complaint}.")

    symptoms = _natural_list(extracted.symptoms)
    if symptoms:
        sentences.append(f"You described {symptoms}.")
    if extracted.severity is not None:
        sentences.append(f"You rated the severity as {extracted.severity} out of 10.")

    aggravating = _natural_list(extracted.aggravating)
    if aggravating:
        sentences.append(f"It is worse with {aggravating}.")
    relieving = _natural_list(extracted.relieving)
    if relieving:
        sentences.append(f"It feels better with {relieving}.")
    limitations = _natural_list(extracted.functional_limitations)
    if limitations:
        sentences.append(f"This is affecting {limitations}.")
    if extracted.goals:
        sentences.append(f"Your goal is to {extracted.goals}.")

    detail = " ".join(sentences) or "I have noted what you described."
    return f"Here's what I understood: {detail}"
