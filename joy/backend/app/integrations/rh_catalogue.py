"""Rehabify's live patient price list (Admin › Pricing), read from RH's public catalogue.

``serviceTariffs:getCatalogue`` is a public Convex query that returns patient prices only (never
payouts), so no credential is involved. Results are cached for 10 minutes. If RH can't be reached,
the defaults below (the same as lib/rehabify-services.ts) answer instead, so a price question never
fails and never waits long.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Service:
    id: str
    name: str
    duration: str
    price_kobo: int
    travel: bool
    bookable: bool = True


DEFAULTS: dict[str, Service] = {
    service.id: service
    for service in (
        Service("recovery_consultation", "Initial Recovery Consultation", "15–20 minutes", 600_000, False),
        Service("virtual_assessment", "Comprehensive Virtual Physiotherapy Assessment", "60 minutes", 2_000_000, False),
        Service("home_assessment", "Initial Home Physiotherapy Assessment", "90 minutes", 3_000_000, True),
        Service("virtual_treatment", "Virtual Physiotherapy Treatment", "30 minutes", 1_200_000, False),
        Service("home_treatment", "Home Physiotherapy Treatment", "60 minutes", 3_000_000, True),
        Service("virtual_review", "Virtual Physiotherapy Review", "45 minutes", 1_500_000, False),
        Service("home_review", "Home Physiotherapy Review", "60 minutes", 3_000_000, True),
    )
}

_TTL_SECONDS = 600.0
_RETRY_SECONDS = 60.0
_cache: tuple[float, dict[str, Service]] | None = None


def _convex_url() -> str:
    """The Convex deployment URL (https://<name>.convex.cloud), from the HTTP-actions URL Joy has."""
    settings = get_settings()
    explicit = (settings.rh_convex_url or "").strip().rstrip("/")
    if explicit:
        return explicit
    for base in (settings.rh_convex_read_base_url, settings.rh_convex_gateway_base_url):
        base = (base or "").strip().rstrip("/")
        if base.endswith(".convex.site"):
            return base[: -len(".convex.site")] + ".convex.cloud"
    return ""


def _fetch(url: str) -> dict[str, Service] | None:
    response = httpx.post(
        f"{url}/api/query",
        json={"path": "serviceTariffs:getCatalogue", "args": {}, "format": "json"},
        timeout=5.0,
    )
    response.raise_for_status()
    body = response.json()
    if not isinstance(body, dict) or body.get("status") != "success":
        return None
    services: dict[str, Service] = {}
    for row in (body.get("value") or {}).get("services") or []:
        ident = str(row.get("id") or "")
        default = DEFAULTS.get(ident)
        price = row.get("priceKobo")
        if default is None or not isinstance(price, (int, float)) or price < 0:
            continue
        services[ident] = Service(
            ident,
            str(row.get("name") or default.name),
            str(row.get("durationLabel") or default.duration),
            int(round(price)),
            bool(row.get("travelApplies")),
            bool(row.get("bookable", True)),
        )
    return services or None


def catalogue() -> dict[str, Service]:
    """Every service Joy may quote, with RH's live price where RH answered."""
    global _cache
    now = time.monotonic()
    if _cache is not None and now < _cache[0]:
        return _cache[1]
    live = None
    url = _convex_url()
    if url:
        try:
            live = _fetch(url)
        except Exception:
            logger.warning("joy_price_catalogue_unavailable", exc_info=True)
    merged = {**DEFAULTS, **(live or {})}
    _cache = (now + (_TTL_SECONDS if live else _RETRY_SECONDS), merged)
    return merged


def clear_cache() -> None:
    global _cache
    _cache = None
