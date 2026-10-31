from collections.abc import Generator
import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.llm.gemini_client import get_llm_client
from app.main import app
from app.models.patient import Patient
from app.models.types import Identity, Persona
from tests.fakes import FakeLLM


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    """Use only an explicitly configured, isolated test database.

    Tests must never silently fall back to the application's localhost default
    or reuse the live Railway production database. The selected test database
    must already contain the current schema.
    """
    supplied_url = os.getenv("TEST_DATABASE_URL", "").strip()
    production_url = os.getenv("DATABASE_URL", "").strip()
    if not supplied_url:
        pytest.fail(
            "Database-backed tests require TEST_DATABASE_URL for an isolated test database. "
            "Refusing to fall back to localhost or DATABASE_URL.",
            pytrace=False,
        )
    if supplied_url == production_url:
        pytest.fail(
            "TEST_DATABASE_URL must not be the same as DATABASE_URL. "
            "Use a separate Railway test database, not production.",
            pytrace=False,
        )

    test_engine = create_engine(Settings(database_url=supplied_url).database_url)
    connection = test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        test_engine.dispose()


@pytest.fixture
def patient_identity(db_session: Session) -> Identity:
    patient = Patient(
        phone_e164="+2348000004001",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
    db_session.add(patient)
    db_session.flush()
    return Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=patient.phone_e164,
    )


@pytest.fixture
def patient_phone(patient_identity: Identity) -> str:
    return patient_identity.phone_e164


@pytest.fixture
def fake_llm() -> FakeLLM:
    return FakeLLM()


@pytest.fixture
def client(
    db_session: Session, monkeypatch: pytest.MonkeyPatch, fake_llm: FakeLLM
) -> Generator[TestClient, None, None]:
    monkeypatch.setenv("WHATSAPP_VERIFY_TOKEN", "test-token")
    monkeypatch.setenv("WHATSAPP_APP_SECRET", "test-secret")
    settings = get_settings()
    settings.whatsapp_verify_token = "test-token"
    settings.whatsapp_app_secret = "test-secret"
    settings.joy_environment = "development"
    settings.internal_api_secret = ""
    settings.internal_job_token = ""
    monkeypatch.setattr("app.config.get_settings", lambda: settings)

    def _session() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_session] = _session
    app.dependency_overrides[get_settings] = lambda: settings
    app.dependency_overrides[get_llm_client] = lambda: fake_llm
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
