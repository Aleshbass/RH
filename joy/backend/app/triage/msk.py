import re

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

# Word-boundary markers. Do not scan goals — "get back to running" must not
# look like spinal back pain.
_BACK_LEG_RE = re.compile(
    r"\b(back|backs|legs?|lumbar|spine|spinal|sciatic(?:a)?)\b",
    re.IGNORECASE,
)
_GOALISH_BACK_RE = re.compile(
    r"\b(?:get|got|getting|come|coming|put|putting|pay|paying)\s+back\b"
    r"|\bback\s+to\b",
    re.IGNORECASE,
)

CAUDA_FLAG_KEYS = (
    "saddle_anesthesia",
    "bladder_bowel_change",
    "bilateral_leg_weakness",
)


def is_msk_narrative(extracted: ExtractedTriage) -> bool:
    text = narrative_text(extracted).lower()
    return any(marker in text for marker in _MSK_MARKERS)


def _cauda_screen_text(extracted: ExtractedTriage) -> str:
    """Symptom narrative only — exclude goals so recovery phrasing cannot trip cauda."""
    bits = [
        extracted.onset or "",
        extracted.body_location or "",
        " ".join(extracted.aggravating),
        " ".join(extracted.relieving),
        " ".join(extracted.comorbidities),
    ]
    text = " ".join(bits)
    return _GOALISH_BACK_RE.sub(" ", text)


def needs_cauda_screen(extracted: ExtractedTriage) -> bool:
    if extracted.condition_area is not None and extracted.condition_area != ConditionArea.MSK:
        return False
    if extracted.condition_area != ConditionArea.MSK and not is_msk_narrative(extracted):
        return False
    return bool(_BACK_LEG_RE.search(_cauda_screen_text(extracted)))


def unanswered_cauda_flag_keys(extracted: ExtractedTriage) -> list[str]:
    return [key for key in CAUDA_FLAG_KEYS if extracted.flags.get(key) is None]


def unanswered_cauda_flags(extracted: ExtractedTriage) -> bool:
    return bool(unanswered_cauda_flag_keys(extracted))
