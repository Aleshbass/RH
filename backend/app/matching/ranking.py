from datetime import date, datetime, timezone
from math import atan2, cos, inf, radians, sin, sqrt
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy.orm import object_session

from app.audit.logger import append
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, ConditionArea
from app.physio.availability import next_open_slot

_LAGOS = ZoneInfo("Africa/Lagos")

_EARTH_RADIUS_KM = 6371.0


class RankedPhysio(BaseModel):
    physio_id: UUID
    display_name: str
    price_kobo: int
    rating: float
    distance_km: float
    next_slot: datetime | None


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    phi1, phi2 = radians(lat1), radians(lat2)
    d_phi = radians(lat2 - lat1)
    d_lambda = radians(lng2 - lng1)
    a = sin(d_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(d_lambda / 2) ** 2
    return 2 * _EARTH_RADIUS_KM * atan2(sqrt(a), sqrt(1 - a))


def _distance_km(patient: Patient, physio: Physiotherapist) -> float:
    plat = getattr(patient, "lat", None)
    plng = getattr(patient, "lng", None)
    if plat is None or plng is None or physio.lat is None or physio.lng is None:
        return inf
    return _haversine_km(plat, plng, physio.lat, physio.lng)


def _json_distance(distance_km: float) -> float | None:
    return None if distance_km == inf else distance_km


def patient_sort_key(patient: Patient) -> tuple[int, ...]:
    """Order multiple patients of the same specialty (portal / Plan 6).

    Production ``rank()`` is per-patient and uses a sooner Lagos calendar-day
    boost for urgent cases (then distance / rating / price). This helper is
    for ordering several patients, not for ranking physios of one patient.
    """
    return (0 if getattr(patient, "urgent", False) else 1,)


def _slot_day_key(slot: datetime | None) -> tuple[int, date]:
    if slot is None:
        return (1, date.max)
    aware = slot if slot.tzinfo is not None else slot.replace(tzinfo=timezone.utc)
    return (0, aware.astimezone(_LAGOS).date())


def rank(
    patient: Patient,
    physios: list[Physiotherapist],
    area: ConditionArea,
) -> list[RankedPhysio]:
    session = object_session(patient)
    if session is None:
        raise RuntimeError(
            "rank requires patient to be attached to a SQLAlchemy session for MATCH audit"
        )

    ranked = [
        RankedPhysio(
            physio_id=physio.id,
            display_name="",
            price_kobo=physio.price_kobo,
            rating=physio.rating,
            distance_km=_distance_km(patient, physio),
            next_slot=next_open_slot(session, physio.id),
        )
        for physio in physios
    ]

    def quality(row: RankedPhysio) -> tuple[float, float, int]:
        return (row.distance_km, -row.rating, row.price_kobo)

    if getattr(patient, "urgent", False):
        ranked.sort(key=lambda row: (*_slot_day_key(row.next_slot), *quality(row)))
    else:
        ranked.sort(key=quality)
    top = [
        row.model_copy(update={"display_name": f"Physio {chr(ord('A') + i)}"})
        for i, row in enumerate(ranked[:3])
    ]
    append(
        session,
        kind=AuditKind.MATCH,
        actor_phone=patient.phone_e164,
        person_id=patient.id,
        payload={
            "area": area.value,
            "urgent": bool(getattr(patient, "urgent", False)),
            "candidates": [
                {
                    "physio_id": str(row.physio_id),
                    "distance_km": _json_distance(row.distance_km),
                    "rating": row.rating,
                    "price_kobo": row.price_kobo,
                    "next_slot": row.next_slot.isoformat() if row.next_slot is not None else None,
                }
                for row in top
            ],
        },
    )
    return top
