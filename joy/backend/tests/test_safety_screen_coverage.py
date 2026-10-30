"""Every approved protocol question must be answerable from the 8-item screen.

The patient-facing screen always shows the same eight themed items. A protocol
question that matches none of them can never be answered by number, so the
patient would be shown the same screen again and again.
"""

import json
from pathlib import Path

from app.conversation.turn_handler import _SAFETY_SCREEN_ITEMS

_PROTOCOL = Path(__file__).resolve().parents[1] / "app" / "safety" / "clinical_engine_v1.json"


def _question_texts(node, found):
    if isinstance(node, dict):
        text = node.get("text")
        if isinstance(text, str) and text.rstrip().endswith("?"):
            found.add(text)
        for value in node.values():
            _question_texts(value, found)
    elif isinstance(node, list):
        for value in node:
            _question_texts(value, found)
    return found


def test_every_protocol_question_maps_to_a_screen_item():
    questions = _question_texts(json.loads(_PROTOCOL.read_text()), set())
    assert questions
    unmapped = sorted(
        text for text in questions
        if not any(
            any(keyword in text.casefold() for keyword in keywords)
            for _, keywords in _SAFETY_SCREEN_ITEMS
        )
    )
    assert unmapped == []
