from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.internal.auth import require_internal_key
from app.db import get_session
from app.models.physiotherapist import Physiotherapist

router = APIRouter(dependencies=[Depends(require_internal_key)])


class PhysioProfileUpdate(BaseModel):
    credential_urls: list[str] | None = None
    price_kobo: int | None = None
    specialty_tags: list[str] | None = None
    city: str | None = None
    mrtb_number: str | None = None


def _profile(physio: Physiotherapist) -> dict:
    return {
        "id": str(physio.id),
        "phone_e164": physio.phone_e164,
        "city": physio.city,
        "specialty_tags": physio.specialty_tags,
        "price_kobo": physio.price_kobo,
        "credential_urls": physio.credential_urls,
        "mrtb_number": physio.mrtb_number,
        "verified": physio.verified,
        "onboarding_status": physio.onboarding_status,
        "rating": physio.rating,
        "lat": physio.lat,
        "lng": physio.lng,
        "needs_web_review": physio.needs_web_review,
    }


def _get_physio(session: Session, physio_id: UUID) -> Physiotherapist:
    physio = session.get(Physiotherapist, physio_id)
    if physio is None:
        raise HTTPException(status_code=404, detail="physio not found")
    return physio


@router.get("/api/internal/physios/{physio_id}/profile")
def get_physio_profile(
    physio_id: UUID,
    session: Session = Depends(get_session),
) -> dict:
    return _profile(_get_physio(session, physio_id))


@router.put("/api/internal/physios/{physio_id}/profile")
def put_physio_profile(
    physio_id: UUID,
    body: PhysioProfileUpdate,
    session: Session = Depends(get_session),
) -> dict:
    physio = _get_physio(session, physio_id)
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(physio, field, value)
    session.flush()
    return _profile(physio)
