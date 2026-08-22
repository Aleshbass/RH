from collections.abc import Generator

import pytest
from sqlalchemy.orm import Session

from app.db import engine
from app.models.patient import Patient
from app.models.types import Identity, Persona


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


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
