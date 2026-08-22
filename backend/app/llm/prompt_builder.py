from pathlib import Path
from typing import Any

from app.models.types import ExtractedTriage, Identity, PatientPhase, Persona

_PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"

_ALWAYS = (
    "base_identity.md",
    "tone_and_format.md",
    "empathy.md",
    "safety_interface.md",
    "triage_discipline.md",
)

_PERSONA_FILES = {
    Persona.PATIENT: "patient.md",
    Persona.PHYSIO: "physiotherapist.md",
    Persona.FAMILY: "family.md",
    Persona.ADMIN: "admin.md",
    Persona.PARTNER: "partner.md",
}


def _load(name: str) -> str:
    return (_PROMPTS_DIR / name).read_text(encoding="utf-8").strip()


def _phase_value(phase: PatientPhase | str) -> str:
    return phase.value if isinstance(phase, PatientPhase) else str(phase)


def _format_history(history: list[Any]) -> str:
    if not history:
        return "(none)"
    lines: list[str] = []
    for item in history:
        if isinstance(item, str):
            lines.append(item)
        elif isinstance(item, dict):
            role = item.get("role", "unknown")
            content = item.get("content") or item.get("text") or str(item)
            lines.append(f"{role}: {content}")
        else:
            lines.append(str(item))
    return "\n".join(lines)


def build(
    identity: Identity,
    phase: PatientPhase | str,
    extracted: ExtractedTriage,
    language: str,
    history: list[Any],
    rag_snippet: str,
    extra_context: str = "",
) -> str:
    phase_value = _phase_value(phase)
    parts = [_load(name) for name in _ALWAYS]
    parts.append(_load(_PERSONA_FILES[identity.persona]))
    parts.append(f"PHASE: {phase_value}")
    parts.append(f"EXTRACTED:\n{extracted.model_dump_json(indent=2)}")
    parts.append(f"LANGUAGE: {language}")
    parts.append(f"HISTORY:\n{_format_history(history)}")
    parts.append(f"RAG:\n{rag_snippet or '(none)'}")
    if extra_context:
        parts.append(extra_context)
    assembled = "\n\n".join(parts)
    replacements = {
        "{{resolved_persona}}": identity.persona.value,
        "{{last_known_language}}": language,
        "{{phase}}": phase_value,
        "{{permission_tier}}": (
            identity.permission_tier.value if identity.permission_tier else ""
        ),
        "{{patient_name}}": "the patient",
    }
    for key, value in replacements.items():
        assembled = assembled.replace(key, value)
    return assembled
