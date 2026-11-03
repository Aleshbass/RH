"""The worker waits for the API's migrations before it starts processing messages."""

from app.queue import worker


def test_head_revision_is_read_from_the_migrations():
    assert worker._code_schema_head().startswith("00")


def test_gives_up_quickly_when_the_database_is_behind(monkeypatch):
    monkeypatch.setattr(worker, "_code_schema_head", lambda: "9999_not_a_revision")
    assert worker.wait_for_schema(max_wait_seconds=0, retry_seconds=0) is False


def test_an_unreadable_head_never_blocks_the_worker(monkeypatch):
    def broken():
        raise RuntimeError("no alembic.ini")

    monkeypatch.setattr(worker, "_code_schema_head", broken)
    assert worker.wait_for_schema(max_wait_seconds=60) is False
