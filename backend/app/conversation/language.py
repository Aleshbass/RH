import re

SUPPORTED_LANGUAGES = frozenset({"en", "pcm", "yo", "ig", "ha"})

_MARKERS: dict[str, tuple[str, ...]] = {
    "pcm": ("dey", "wetin", "abeg", "no be", "una", "wahala"),
    "yo": ("bawo", "epele", "ẹpele", "jowo", "jọ̀wọ́", "eese", "ẹsẹ"),
    "ig": ("kedu", "ndewo", "biko", "mgbu", "ikpere"),
    "ha": ("ina", "ciwo", "gwiwa", "don allah", "na gode"),
}

_HOW_FAR_GREETING = re.compile(
    r"^how far(?:\s*[?!.,]+|\s+(?:now|na|abeg|o|well)\b|\s*$)",
    re.IGNORECASE,
)


def _has_marker(text: str, marker: str) -> bool:
    return re.search(rf"\b{re.escape(marker)}\b", text, flags=re.IGNORECASE) is not None


def mirror_language(user_text: str, last_known: str | None) -> str:
    if _HOW_FAR_GREETING.search(user_text.strip()):
        return "pcm"
    lowered = user_text.lower()
    for code, markers in _MARKERS.items():
        if any(_has_marker(lowered, marker) for marker in markers):
            return code
    if last_known in SUPPORTED_LANGUAGES:
        return last_known
    return "en"
