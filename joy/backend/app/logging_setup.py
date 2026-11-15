"""Log lines to stdout, errors to stderr.

Railway tags every line a service writes to stderr as level "error". Python's logging (and
uvicorn's own startup lines) default to stderr, so every INFO and WARNING line showed up as an
error and the real errors were buried. INFO and WARNING now go to stdout; ERROR and CRITICAL
to stderr. Used by the worker (python -m app.queue.worker) and the API (app/main.py).
"""

from __future__ import annotations

import logging
import sys

LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
_JOY_HANDLER = "_joy_split_stream"


class _BelowError(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        return record.levelno < logging.ERROR


class _StdStreamHandler(logging.StreamHandler):
    """Writes to sys.stdout or sys.stderr as they are at the time of the line (not at setup)."""

    def __init__(self, stream_name: str) -> None:
        self._stream_name = stream_name
        super().__init__()

    @property
    def stream(self):  # type: ignore[override]
        return getattr(sys, self._stream_name)

    @stream.setter
    def stream(self, _value) -> None:
        pass


def split_handlers(formatter: logging.Formatter | None) -> list[logging.Handler]:
    """A stdout handler for everything below ERROR and a stderr handler for ERROR and above."""
    out = _StdStreamHandler("stdout")
    out.addFilter(_BelowError())
    err = _StdStreamHandler("stderr")
    err.setLevel(logging.ERROR)
    for handler in (out, err):
        if formatter is not None:
            handler.setFormatter(formatter)
        setattr(handler, _JOY_HANDLER, True)
    return [out, err]


def _configured(logger: logging.Logger) -> bool:
    return any(getattr(handler, _JOY_HANDLER, False) for handler in logger.handlers)


def configure_logging(level: int = logging.INFO) -> None:
    """Idempotent: safe to call from both the API and the worker, and more than once."""
    root = logging.getLogger()
    if not _configured(root):
        for handler in split_handlers(logging.Formatter(LOG_FORMAT)):
            root.addHandler(handler)
    root.setLevel(level)
    _split_uvicorn_streams()


def _split_uvicorn_streams() -> None:
    """uvicorn's own logger writes every line to stderr: keep its format, send only errors there.

    uvicorn configures logging before it imports the app, so this runs after it and replaces
    its stderr handler. Its access log already goes to stdout and is left alone.
    """
    logger = logging.getLogger("uvicorn")
    if _configured(logger):
        return
    for handler in list(logger.handlers):
        if isinstance(handler, logging.StreamHandler) and getattr(handler, "stream", None) is sys.stderr:
            logger.removeHandler(handler)
            for replacement in split_handlers(handler.formatter):
                logger.addHandler(replacement)
