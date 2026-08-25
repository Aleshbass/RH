import math

import pytest

from app.models.audit_log import AuditEvent
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, ConditionArea

LAGOS_LAT = 6.5244
LAGOS_LNG = 3.3792


def _physio(
    session,
    phone,
    *,
    lat,
    lng,
    price_kobo,
    rating,
    tags=None,
    verified=True,
):
    row = Physiotherapist(
        phone_e164=phone,
        specialty_tags=tags or ["neuro"],
        lat=lat,
        lng=lng,
        price_kobo=price_kobo,
        rating=rating,
        verified=verified,
        service_radius_km=10.0,
    )
    session.add(row)
    session.flush()
    return row


@pytest.fixture
def patient(db_session):
    row = Patient(
        phone_e164="+2348000003001",
        name="Ada Okonkwo",
        age=32,
        location="Lagos",
    )
    db_session.add(row)
    db_session.flush()
    return row


@pytest.fixture
def four_neuro_physios(db_session):
    return [
        _physio(
            db_session,
            "+2348000003101",
            lat=LAGOS_LAT,
            lng=LAGOS_LNG,
            price_kobo=20_000_00,
            rating=4.0,
        ),
        _physio(
            db_session,
            "+2348000003102",
            lat=LAGOS_LAT + 0.01,
            lng=LAGOS_LNG,
            price_kobo=15_000_00,
            rating=4.8,
        ),
        _physio(
            db_session,
            "+2348000003103",
            lat=LAGOS_LAT + 0.04,
            lng=LAGOS_LNG,
            price_kobo=10_000_00,
            rating=5.0,
        ),
        _physio(
            db_session,
            "+2348000003104",
            lat=LAGOS_LAT + 0.20,
            lng=LAGOS_LNG,
            price_kobo=8_000_00,
            rating=3.0,
        ),
    ]


def test_rank_returns_at_most_three(db_session, patient, four_neuro_physios):
    from app.matching.ranking import rank
    from app.models.types import ConditionArea
    out = rank(patient, four_neuro_physios, ConditionArea.NEURO)
    assert len(out) == 3
    distances = [x.distance_km for x in out]
    assert distances == sorted(distances) or out[0].rating >= out[-1].rating


def test_rank_sort_key_is_distance_then_rating_then_price(db_session, patient):
    from app.matching.ranking import rank

    patient.lat = LAGOS_LAT
    patient.lng = LAGOS_LNG
    db_session.flush()

    far_cheap = _physio(
        db_session,
        "+2348000003201",
        lat=LAGOS_LAT + 0.20,
        lng=LAGOS_LNG,
        price_kobo=1_000_00,
        rating=5.0,
    )
    near_low_rating_cheap = _physio(
        db_session,
        "+2348000003202",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
        price_kobo=10_000_00,
        rating=3.0,
    )
    near_high_rating_expensive = _physio(
        db_session,
        "+2348000003203",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
        price_kobo=30_000_00,
        rating=5.0,
    )
    near_high_rating_cheap = _physio(
        db_session,
        "+2348000003204",
        lat=LAGOS_LAT,
        lng=LAGOS_LNG,
        price_kobo=12_000_00,
        rating=5.0,
    )

    out = rank(
        patient,
        [
            far_cheap,
            near_low_rating_cheap,
            near_high_rating_expensive,
            near_high_rating_cheap,
        ],
        ConditionArea.NEURO,
    )

    assert [x.physio_id for x in out] == [
        near_high_rating_cheap.id,
        near_high_rating_expensive.id,
        near_low_rating_cheap.id,
    ]
    keys = [(x.distance_km, -x.rating, x.price_kobo) for x in out]
    assert keys == sorted(keys)


def test_missing_patient_coords_distance_is_inf_and_sorts_last(
    db_session, patient, four_neuro_physios
):
    from app.matching.ranking import rank

    out = rank(patient, four_neuro_physios, ConditionArea.NEURO)
    assert len(out) == 3
    assert all(math.isinf(x.distance_km) for x in out)
    keys = [(x.distance_km, -x.rating, x.price_kobo) for x in out]
    assert keys == sorted(keys)
    assert [x.physio_id for x in out] == [
        four_neuro_physios[2].id,
        four_neuro_physios[1].id,
        four_neuro_physios[0].id,
    ]
    phones = {row.phone_e164 for row in four_neuro_physios}
    assert all(x.display_name not in phones for x in out)
    assert [x.display_name for x in out] == ["Physio A", "Physio B", "Physio C"]


def test_rank_appends_match_audit_with_candidate_ids_and_scores(
    db_session, patient, four_neuro_physios
):
    from app.matching.ranking import rank

    out = rank(patient, four_neuro_physios, ConditionArea.NEURO)

    events = (
        db_session.query(AuditEvent)
        .filter(AuditEvent.kind == AuditKind.MATCH, AuditEvent.person_id == patient.id)
        .all()
    )
    assert len(events) == 1
    payload = events[0].payload
    assert events[0].actor_phone == patient.phone_e164
    assert payload["area"] == ConditionArea.NEURO.value
    ids = [row["physio_id"] for row in payload["candidates"]]
    assert ids == [str(x.physio_id) for x in out]
    for row, ranked in zip(payload["candidates"], out, strict=True):
        expected_distance = None if math.isinf(ranked.distance_km) else ranked.distance_km
        assert row["distance_km"] == expected_distance
        assert row["rating"] == ranked.rating
        assert row["price_kobo"] == ranked.price_kobo


def test_rank_display_name_is_anonymous_not_phone(db_session, patient, four_neuro_physios):
    from app.matching.ranking import rank

    out = rank(patient, four_neuro_physios, ConditionArea.NEURO)
    phones = {row.phone_e164 for row in four_neuro_physios}
    assert [x.display_name for x in out] == ["Physio A", "Physio B", "Physio C"]
    assert all(x.display_name not in phones for x in out)


def test_rank_next_slot_is_none(db_session, patient, four_neuro_physios):
    from app.matching.ranking import rank

    out = rank(patient, four_neuro_physios, ConditionArea.NEURO)
    assert all(x.next_slot is None for x in out)


def test_rank_next_slot_from_written_windows(db_session, patient, four_neuro_physios):
    from app.matching.ranking import rank
    from app.physio.availability import parse_availability, write_slots

    write_slots(
        db_session, four_neuro_physios[0].id, parse_availability("free Mon-Fri 9-5")
    )
    out = rank(patient, four_neuro_physios, ConditionArea.NEURO)
    by_id = {row.physio_id: row for row in out}
    slotted = by_id.get(four_neuro_physios[0].id)
    if slotted is None:
        slotted = next(row for row in out if row.next_slot is not None)
    assert slotted.next_slot is not None
    from zoneinfo import ZoneInfo
    lagos_hour = slotted.next_slot.astimezone(ZoneInfo("Africa/Lagos")).hour
    assert slotted.next_slot.weekday() <= 4
    assert 9 <= lagos_hour < 17
    assert all(
        by_id[pid].next_slot is None
        for pid in (p.id for p in four_neuro_physios[1:3] if p.id in by_id)
    )


def test_rank_raises_without_db_session(four_neuro_physios):
    from app.matching.ranking import rank

    detached_patient = Patient(
        phone_e164="+2348000003999",
        name="Detached Ada",
        age=32,
        location="Lagos",
    )
    with pytest.raises(RuntimeError, match="MATCH audit"):
        rank(detached_patient, four_neuro_physios, ConditionArea.NEURO)


def test_urgent_patients_sort_before_non_urgent_same_specialty(db_session):
    from app.matching.ranking import patient_sort_key
    from app.models.partner import Partner
    from app.partner.urgent_flag import flag_urgent

    partner = Partner(phone_e164="+2348000003980")
    db_session.add(partner)
    db_session.flush()
    urgent = Patient(
        phone_e164="+2348000003981",
        name="Urgent Ada",
        location="Lagos",
        referred_by_partner_id=partner.id,
    )
    non_urgent = Patient(
        phone_e164="+2348000003982",
        name="Steady Chidi",
        location="Lagos",
        referred_by_partner_id=partner.id,
    )
    db_session.add_all([urgent, non_urgent])
    db_session.flush()
    flag_urgent(db_session, urgent.id, partner.id)
    db_session.refresh(urgent)
    ordered = sorted([non_urgent, urgent], key=patient_sort_key)
    assert [row.id for row in ordered] == [urgent.id, non_urgent.id]
    assert patient_sort_key(urgent) < patient_sort_key(non_urgent)
