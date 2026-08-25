from datetime import datetime
from math import atan2, cos, inf, radians, sin, sqrt
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.orm import object_session

from app.audit.logger import append
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, ConditionArea

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


def rank(
    patient: Patient,
    physios: list[Physiotherapist],
    area: ConditionArea,
) -> list[RankedPhysio]:
    ranked = [
        RankedPhysio(
            physio_id=physio.id,
            display_name=physio.phone_e164,
            price_kobo=physio.price_kobo,
            rating=physio.rating,
            distance_km=_distance_km(patient, physio),
            next_slot=None,
        )
        for physio in physios
    ]
    ranked.sort(key=lambda row: (row.distance_km, -row.rating, row.price_kobo))
    top = ranked[:3]

    session = object_session(patient)
    if session is not None:
        append(
            session,
            kind=AuditKind.MATCH,
            actor_phone=patient.phone_e164,
            person_id=patient.id,
            payload={
                "area": area.value,
                "candidates": [
                    {
                        "physio_id": str(row.physio_id),
                        "distance_km": _json_distance(row.distance_km),
                        "rating": row.rating,
                        "price_kobo": row.price_kobo,
                    }
                    for row in top
                ],
            },
        )
    return top
