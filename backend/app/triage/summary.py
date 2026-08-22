from app.models.types import ExtractedTriage


def plain_summary(extracted: ExtractedTriage) -> str:
    bits: list[str] = []
    if extracted.body_location:
        bits.append(extracted.body_location)
    if extracted.onset:
        bits.append(f"for {extracted.onset}")
    if extracted.severity is not None:
        bits.append(f"severity {extracted.severity} out of 10")
    if extracted.goals:
        bits.append(f"hoping to {extracted.goals}")
    if extracted.condition_area is not None:
        bits.append(f"({extracted.condition_area.value} physio)")
    understood = ", ".join(bits) if bits else "what you described"
    return (
        f"Here's what I understood: {understood}. "
        "Please confirm this is right, or tell me what to correct?"
    )
