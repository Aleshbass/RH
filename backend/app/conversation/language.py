SUPPORTED_LANGUAGES = frozenset({"en", "pcm", "yo", "ig", "ha"})

_MARKERS: dict[str, tuple[str, ...]] = {
    "pcm": (" dey ", " wetin ", " abeg ", " no be ", "how far", " una ", " wahala"),
    "yo": ("bawo", "epele", "ẹpele", "jowo", "jọ̀wọ́", "eese", "ẹsẹ"),
    "ig": ("kedu", "ndewo", "biko", "mgbu", "ikpere"),
    "ha": ("ina ", "ciwo", "gwiwa", "don allah", "na gode"),
}


def mirror_language(user_text: str, last_known: str | None) -> str:
    haystack = f" {user_text.lower()} "
    for code, markers in _MARKERS.items():
        if any(marker in haystack for marker in markers):
            return code
    if last_known in SUPPORTED_LANGUAGES:
        return last_known
    return "en"
