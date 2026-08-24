from app.models.types import ConditionArea, ExtractedTriage

from app.triage.msk import is_msk_narrative
from app.triage.non_msk import infer_non_msk_area


def merge_extraction(existing: ExtractedTriage, incoming: dict) -> ExtractedTriage:
    payload = {key: value for key, value in incoming.items() if key in ExtractedTriage.model_fields}
    parsed = ExtractedTriage.model_validate(payload)
    merged = existing.model_dump()
    for key in parsed.model_fields_set:
        value = getattr(parsed, key)
        if value is None:
            continue
        if isinstance(value, dict):
            if not value:
                continue
            current = dict(merged.get(key) or {})
            for inner_key, inner_value in value.items():
                if inner_value is True or inner_value is False:
                    current[inner_key] = inner_value
            merged[key] = current
            continue
        merged[key] = value
    return ExtractedTriage.model_validate(merged)


def infer_condition_area(extracted: ExtractedTriage) -> ConditionArea | None:
    if extracted.condition_area is not None:
        return extracted.condition_area
    non_msk = infer_non_msk_area(extracted)
    if non_msk is not None:
        return non_msk
    if is_msk_narrative(extracted):
        return ConditionArea.MSK
    return None
