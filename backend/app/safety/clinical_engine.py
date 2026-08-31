"""Load Rehabify Clinical Safety Engine v1 (client JSON) for deterministic use."""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_ENGINE_PATH = Path(__file__).with_name("clinical_engine_v1.json")

_REGION_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("low_back", ("low back", "lower back", "lumbar", "lumbago")),
    ("mid_back", ("mid back", "middle back", "thoracic")),
    ("neck", ("neck", "cervical")),
    ("shoulder", ("shoulder",)),
    ("elbow", ("elbow",)),
    ("wrist_hand", ("wrist", "hand", "finger", "thumb")),
    ("hip", ("hip", "groin")),
    ("knee", ("knee",)),
    ("ankle_foot", ("ankle", "foot", "heel", "toe")),
    ("jaw", ("jaw", "tmj", "temporomandibular")),
)

# Map existing ExtractedTriage.flags → clinical engine outcomes.
_FLAG_OUTCOMES: tuple[tuple[str, str, str, str], ...] = (
    # flag_key, risk_level, rule_id, plain reason
    (
        "saddle_anesthesia",
        "RED",
        "LB-002",
        "Numbness around the saddle area can mean the nerves at the base of the spine are under dangerous pressure.",
    ),
    (
        "bladder_bowel_change",
        "RED",
        "LB-001",
        "A new change in bladder or bowel control with back problems can be a nerve emergency.",
    ),
    (
        "bilateral_leg_weakness",
        "RED",
        "LB-003",
        "Weakness in both legs with this kind of problem can mean serious nerve pressure.",
    ),
    (
        "chest_pain",
        "RED",
        "GEN-CARDIAC",
        "Chest pain can be a sign of a heart problem that needs urgent medical care.",
    ),
    (
        "sudden_neuro_deficit",
        "RED",
        "GEN-NEURO",
        "A sudden change in strength, speech, or feeling can need emergency care.",
    ),
    (
        "unexplained_numbness",
        "AMBER",
        "GEN-NEURO-UNCERTAIN",
        "Unexplained numbness needs a careful clinical look before routine rehab.",
    ),
    (
        "recent_trauma",
        "ORANGE",
        "GEN-001",
        "A serious injury or major fall can mean damage that needs medical assessment before routine physio.",
    ),
    (
        "fever",
        "AMBER",
        "GEN-003",
        "Fever with this problem can mean infection or another issue that needs specialist review.",
    ),
    (
        "night_sweats",
        "AMBER",
        "GEN-003",
        "Night sweats with this problem can mean infection or another issue that needs specialist review.",
    ),
    (
        "unexplained_weight_loss",
        "AMBER",
        "GEN-004",
        "Unexplained weight loss with musculoskeletal symptoms needs specialist review before routine rehab.",
    ),
)

_LEVEL_RANK = {"GREEN": 0, "AMBER": 1, "ORANGE": 2, "RED": 3}


@lru_cache(maxsize=1)
def load_engine() -> dict[str, Any]:
    """File is the runtime source of truth (no network; tests need no DB).

    Alembic also seeds the same JSON into ``safety_engine_configs`` so ops and
    internal APIs can query the active engine without opening the repo.
    """
    return json.loads(_ENGINE_PATH.read_text(encoding="utf-8"))


def engine_version() -> str:
    return str(load_engine().get("engine", {}).get("version") or "unknown")


def load_engine_from_db(session: Any) -> dict[str, Any] | None:
    """Return the latest row from ``safety_engine_configs``, if present."""
    try:
        from sqlalchemy import select

        from app.models.safety_engine_config import SafetyEngineConfig
    except Exception:
        return None
    row = session.scalar(
        select(SafetyEngineConfig).order_by(SafetyEngineConfig.created_at.desc()).limit(1)
    )
    if row is None:
        return None
    return dict(row.config)


def infer_body_region(text: str) -> str:
    lowered = (text or "").lower()
    for region, markers in _REGION_MARKERS:
        if any(marker in lowered for marker in markers):
            return region
    return "general_other_msk"


def prompt_digest() -> str:
    """Compact engine text for the LLM context — decisions stay in code."""
    engine = load_engine()
    meta = engine.get("engine") or {}
    outcomes = meta.get("outcomes") or {}
    lines = [
        "CLINICAL SAFETY ENGINE (deterministic — you do not choose the level):",
        f"name={meta.get('name')} version={meta.get('version')} scope={meta.get('scope')}",
        "Outcomes:",
    ]
    for level in ("GREEN", "AMBER", "ORANGE", "RED"):
        info = outcomes.get(level) or {}
        lines.append(f"- {level}: {info.get('meaning', '')}")
    lines.append(
        "If the system hands you a safety level, follow it. "
        "Do not override RED/ORANGE/AMBER to keep booking flowing."
    )
    lines.append(f"Regions covered: {', '.join((engine.get('regions') or {}).keys())}")
    return "\n".join(lines)


def region_screen_questions(region: str) -> list[str]:
    engine = load_engine()
    block = (engine.get("regions") or {}).get(region) or {}
    questions: list[str] = []
    for rule in block.get("rules") or []:
        for q in rule.get("questions") or []:
            text = str(q.get("text") or "").strip()
            if text and text not in questions:
                questions.append(text)
    return questions


def evaluate_flags(flags: dict[str, bool | None]) -> dict[str, Any]:
    """Map structured flags to the highest clinical risk level."""
    level = "GREEN"
    rule_ids: list[str] = []
    reasons: list[str] = []
    for key, risk, rule_id, reason in _FLAG_OUTCOMES:
        if flags.get(key) is True:
            if _LEVEL_RANK[risk] >= _LEVEL_RANK[level]:
                level = risk
            rule_ids.append(rule_id)
            reasons.append(reason)
    # Combined malignancy pattern from legacy rules.
    if flags.get("history_of_cancer") is True and flags.get("night_pain") is True:
        if _LEVEL_RANK["AMBER"] >= _LEVEL_RANK[level]:
            level = "AMBER"
        rule_ids.append("GEN-005")
        reasons.append(
            "A cancer history with night pain needs specialist review before routine rehab."
        )
    action = {
        "GREEN": "continue",
        "AMBER": "specialist_review",
        "ORANGE": "medical_review",
        "RED": "escalate_doctor",
    }[level]
    return {
        "risk_level": level,
        "rule_ids": rule_ids,
        "reasons": reasons,
        "action": action,
        "fired": level in {"ORANGE", "RED"},
    }
