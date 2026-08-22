from app.models.types import ConditionArea, ExtractedTriage

from app.triage.non_msk import narrative_text

_MSK_MARKERS = (
    "joint",
    "muscle",
    "sprain",
    "strain",
    "shoulder",
    "knee",
    "hip",
    "ankle",
    "wrist",
    "elbow",
    "neck",
    "back",
    "msk",
)

_BACK_LEG_MARKERS = ("back", "leg", "lumbar", "spine", "sciatic")

CAUDA_FLAG_KEYS = (
    "saddle_anesthesia",
    "bladder_bowel_change",
    "bilateral_leg_weakness",
)


def is_msk_narrative(extracted: ExtractedTriage) -> bool:
    text = narrative_text(extracted).lower()
    return any(marker in text for marker in _MSK_MARKERS)


def needs_cauda_screen(extracted: ExtractedTriage) -> bool:
    if extracted.condition_area is not None and extracted.condition_area != ConditionArea.MSK:
        return False
    if extracted.condition_area != ConditionArea.MSK and not is_msk_narrative(extracted):
        return False
    text = narrative_text(extracted).lower()
    return any(marker in text for marker in _BACK_LEG_MARKERS)


def unanswered_cauda_flag_keys(extracted: ExtractedTriage) -> list[str]:
    return [key for key in CAUDA_FLAG_KEYS if extracted.flags.get(key) is None]


def unanswered_cauda_flags(extracted: ExtractedTriage) -> bool:
    return bool(unanswered_cauda_flag_keys(extracted))
