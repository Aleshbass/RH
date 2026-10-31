from pathlib import Path

from app.models.types import ConditionArea

_KB = Path(__file__).resolve().parent / "knowledge_base"

_HEADINGS: dict[ConditionArea, tuple[str, ...]] = {
    ConditionArea.MSK: ("msk", "musculoskeletal"),
    ConditionArea.NEURO: ("neuro", "neurological"),
    ConditionArea.PAEDIATRIC: ("paediatric", "pediatric", "paeds"),
    ConditionArea.CARDIORESPIRATORY: ("cardiorespiratory", "cardio"),
    ConditionArea.WOMENS_HEALTH: ("womens_health", "women's health", "womens health"),
    ConditionArea.POST_SURGICAL: ("post_surgical", "post-surgical", "postsurgical"),
}


def _sections(markdown: str) -> dict[str, str]:
    parts: dict[str, str] = {}
    current: str | None = None
    lines: list[str] = []
    for line in markdown.splitlines():
        if line.startswith("## "):
            if current is not None:
                parts[current] = "\n".join(lines).strip()
            current = line[3:].strip().lower()
            lines = [line]
        elif current is not None:
            lines.append(line)
    if current is not None:
        parts[current] = "\n".join(lines).strip()
    return parts


def _match(sections: dict[str, str], area: ConditionArea) -> str:
    keys = _HEADINGS.get(area, (area.value,))
    for heading, body in sections.items():
        if heading in keys or any(key == heading or key in heading for key in keys):
            return body
    return ""


def retrieve(condition_area: ConditionArea) -> str:
    snippets: list[str] = []
    for name in ("glossary.md", "specialties.md"):
        text = (_KB / name).read_text(encoding="utf-8")
        matched = _match(_sections(text), condition_area)
        if matched:
            snippets.append(matched)
    return "\n\n".join(snippets)
