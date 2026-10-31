from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.physiotherapist import Physiotherapist
from app.models.types import ConditionArea


class NotReadyError(Exception):
    """Matching is reserved for Plan 2. Call sites stay stable."""


def match_physios(*args, **kwargs):
    raise NotReadyError("matching is not ready")


_AREA_TAGS: dict[ConditionArea, str] = {
    ConditionArea.MSK: "msk",
    ConditionArea.NEURO: "neuro",
    ConditionArea.PAEDIATRIC: "paediatric",
    ConditionArea.CARDIORESPIRATORY: "cardiorespiratory",
    ConditionArea.WOMENS_HEALTH: "womens_health",
    ConditionArea.POST_SURGICAL: "post_surgical",
}


def eligible_physios(session: Session, area: ConditionArea) -> list[Physiotherapist]:
    tag = _AREA_TAGS[area]
    return list(
        session.scalars(
            select(Physiotherapist).where(
                Physiotherapist.verified.is_(True),
                Physiotherapist.specialty_tags.contains([tag]),
            )
        ).all()
    )
