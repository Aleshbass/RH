import pytest

from app.matching.specialty_match import eligible_physios
from app.models.physiotherapist import Physiotherapist
from app.models.types import ConditionArea


def _physio(session, phone, tags, *, verified=True):
    row = Physiotherapist(
        phone_e164=phone,
        specialty_tags=tags,
        lat=6.5244,
        lng=3.3792,
        price_kobo=15_000_00,
        rating=4.5,
        verified=verified,
        service_radius_km=10.0,
    )
    session.add(row)
    session.flush()
    return row


@pytest.fixture
def msk_only_physio(db_session):
    return _physio(db_session, "+2348000002001", ["msk"])


@pytest.fixture
def neuro_physio(db_session):
    return _physio(db_session, "+2348000002002", ["neuro"])


def test_neuro_case_excludes_msk_only(db_session, msk_only_physio, neuro_physio):
    found = eligible_physios(db_session, ConditionArea.NEURO)
    ids = {p.id for p in found}
    assert neuro_physio.id in ids
    assert msk_only_physio.id not in ids


def test_unverified_physio_excluded_even_if_tagged(db_session, neuro_physio):
    unverified = _physio(
        db_session, "+2348000002003", ["neuro"], verified=False
    )
    found = eligible_physios(db_session, ConditionArea.NEURO)
    ids = {p.id for p in found}
    assert neuro_physio.id in ids
    assert unverified.id not in ids
