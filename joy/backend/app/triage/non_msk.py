from app.models.types import ConditionArea, ExtractedTriage

_KEYWORD_AREAS: tuple[tuple[tuple[str, ...], ConditionArea], ...] = (
    (("stroke", "parkinson"), ConditionArea.NEURO),
    (("child", "paediatric", "pediatric", "infant", "baby"), ConditionArea.PAEDIATRIC),
    (("breathing", "breath", "pneumonia", "lung"), ConditionArea.CARDIORESPIRATORY),
    (("pelvic", "pregnancy", "postnatal", "postpartum"), ConditionArea.WOMENS_HEALTH),
    (("surgery", "surgical", "post-op", "operation"), ConditionArea.POST_SURGICAL),
)


def narrative_text(extracted: ExtractedTriage) -> str:
    bits = [
        extracted.onset or "",
        extracted.body_location or "",
        extracted.goals or "",
        " ".join(extracted.aggravating),
        " ".join(extracted.relieving),
        " ".join(extracted.comorbidities),
    ]
    return " ".join(bits)


def infer_non_msk_area(extracted: ExtractedTriage) -> ConditionArea | None:
    text = narrative_text(extracted).lower()
    for keywords, area in _KEYWORD_AREAS:
        if any(keyword in text for keyword in keywords):
            return area
    return None
