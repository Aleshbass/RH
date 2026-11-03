"""Where a shared WhatsApp location pin is, and which travel zone it falls in.

Rehabify looks the pin up (gateway route place_for_pin, LocationIQ with the website's key, which
never leaves Convex). Only the coordinates are sent. If the lookup isn't available, this returns
None and Joy asks the patient to type the area instead.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from app.integrations.rh_client import RHIntegrationError, configured_rh_client

logger = logging.getLogger(__name__)

# Names the geocoder uses that differ from Rehabify's zone states
_STATE_NAMES = {
    "federal capital territory": "FCT", "abuja federal capital territory": "FCT", "fct": "FCT",
    "abuja": "FCT", "nassarawa": "Nasarawa", "akwa-ibom": "Akwa Ibom", "cross-river": "Cross River",
}


@dataclass(frozen=True)
class Place:
    state: str | None
    town: str | None  # city or town
    area: str | None  # neighbourhood or suburb, the most specific name found

    def names(self) -> list[str]:
        """Most to least specific, for matching against travel-zone areas."""
        return [name for name in (self.area, self.town) if name]


def _state(name: str | None) -> str | None:
    if not name:
        return None
    clean = " ".join(str(name).split())
    key = clean.casefold().removesuffix(" state").strip()
    if key in _STATE_NAMES:
        return _STATE_NAMES[key]
    return clean[:-6].strip() if clean.casefold().endswith(" state") else clean


def in_nigeria(lat: float, lng: float) -> bool:
    return 4.0 <= lat <= 14.5 and 2.5 <= lng <= 15.0


def place_for_pin(lat: float, lng: float) -> Place | None:
    if not in_nigeria(lat, lng):
        return None
    try:
        data = configured_rh_client().place_for_pin(lat, lng)
    except RHIntegrationError as error:
        logger.warning("joy_place_for_pin_failed code=%s", error.code)
        return None
    if not isinstance(data, dict) or not data.get("found"):
        return None

    def text(key: str) -> str | None:
        value = data.get(key)
        return " ".join(value.split()) if isinstance(value, str) and value.strip() else None

    town, area = text("town"), text("area")
    return Place(state=_state(text("state")), town=town, area=area if area != town else None)
