from fastapi.testclient import TestClient

from app.main import app
from app.queue.tasks import send_whatsapp_text


def test_local_console_is_available_only_in_development(monkeypatch):
    monkeypatch.setenv("JOY_ENVIRONMENT", "development")
    monkeypatch.setenv("DEV_CONSOLE_TOKEN", "test-local-token")

    client = TestClient(app)

    assert client.get("/internal/dev/console").status_code == 200
    assert (
        client.post(
            "/internal/dev/chat",
            json={"phone": "+2348000000001", "text": "hello"},
        ).status_code
        == 401
    )


def test_local_console_is_hidden_outside_development(monkeypatch):
    monkeypatch.setenv("JOY_ENVIRONMENT", "production")
    monkeypatch.setenv("DEV_CONSOLE_TOKEN", "test-local-token")

    assert TestClient(app).get("/internal/dev/console").status_code == 404


def test_delivery_suppression_is_limited_to_development(monkeypatch):
    monkeypatch.setenv("JOY_ENVIRONMENT", "development")
    monkeypatch.setenv("DISABLE_WHATSAPP_DELIVERY", "true")
    assert send_whatsapp_text("+2348000000001", "local test") is None

    monkeypatch.setenv("JOY_ENVIRONMENT", "production")
    try:
        send_whatsapp_text("+2348000000001", "must not suppress production")
    except RuntimeError as exc:
        assert "permitted only in development" in str(exc)
    else:
        raise AssertionError("production delivery suppression must be rejected")


def test_local_reset_requires_explicit_confirmation(monkeypatch):
    monkeypatch.setenv("JOY_ENVIRONMENT", "development")
    monkeypatch.setenv("DEV_CONSOLE_TOKEN", "test-local-token")

    response = TestClient(app).post(
        "/internal/dev/reset-local-context",
        headers={"X-Joy-Dev-Token": "test-local-token"},
        json={"confirmation": "wrong words"},
    )

    assert response.status_code == 400
