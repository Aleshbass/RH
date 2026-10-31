import re
import unicodedata

SUPPORTED_LANGUAGES = frozenset({"en", "pcm", "yo", "ig", "ha"})

_MARKERS: dict[str, tuple[str, ...]] = {
    "pcm": ("dey", "wetin", "abeg", "no be", "una", "wahala"),
    "yo": ("bawo", "epele", "ẹpele", "jowo", "jọ̀wọ́", "eese", "ẹsẹ"),
    "ig": ("kedu", "ndewo", "biko", "mgbu", "ikpere"),
    "ha": ("ina", "ciwo", "gwiwa", "don allah", "na gode"),
}

# Whole message only: "how far" or "how far" + na/now and/or ?/! then end/emoji.
# A comma prefix to an English sentence ("How far, can I...") is not pidgin.
_HOW_FAR_GREETING = re.compile(
    r"^how far(?:\s+(?:na|now))?\s*[?!]*"
    r"(?:\s*[\U0001F300-\U0001FAFF\u2600-\u27BF\ufe0f]+)*"
    r"\s*$",
    re.IGNORECASE,
)


def _normalize(text: str) -> str:
    return unicodedata.normalize("NFKC", text)


def _is_wordish(ch: str) -> bool:
    category = unicodedata.category(ch)
    return category[0] in {"L", "M", "N"} or ch == "_"


def _has_marker(text: str, marker: str) -> bool:
    haystack = _normalize(text).casefold()
    needle = _normalize(marker).casefold()
    if not needle:
        return False
    start = 0
    while True:
        idx = haystack.find(needle, start)
        if idx < 0:
            return False
        end = idx + len(needle)
        left_ok = idx == 0 or not _is_wordish(haystack[idx - 1])
        right_ok = end >= len(haystack) or not _is_wordish(haystack[end])
        if left_ok and right_ok:
            return True
        start = idx + 1


def mirror_language(user_text: str, last_known: str | None) -> str:
    text = _normalize(user_text).strip()
    if _HOW_FAR_GREETING.search(text):
        return "pcm"
    for code, markers in _MARKERS.items():
        if any(_has_marker(text, marker) for marker in markers):
            return code
    if last_known in SUPPORTED_LANGUAGES:
        return last_known
    return "en"
