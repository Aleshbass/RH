"""Safe structured events for Joy turn diagnostics.

Never pass raw patient messages, access tokens, provider keys, or full prompts
to this module.
"""

from __future__ import annotations

import json
import logging
from time import perf_counter
from typing import Any


_SENSITIVE = ("token", "secret", "key", "authorization", "password", "message", "prompt")


def timer_start() -> float:
    return perf_counter()


def elapsed_ms(started: float) -> int:
    return int((perf_counter() - started) * 1000)


def log_event(event: str, **metadata: Any) -> None:
    safe = {
        str(key): value
        for key, value in metadata.items()
        if not any(part in str(key).casefold() for part in _SENSITIVE)
    }
    logging.getLogger("joy.observability").info(
        "joy_event=%s", json.dumps({"event": event, **safe}, sort_keys=True, default=str)
    )
