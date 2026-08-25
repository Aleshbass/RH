from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.family_member import FamilyMember
from app.models.types import PermissionTier

_PHONE_RE = re.compile(r"(\+?234[\d\s-]{10,}|\b0\d{10}\b)")
_ADD_RE = re.compile(r"(?i)\b(?:add|register)\b")
_REVOKE_RE = re.compile(r"(?i)\b(?:revoke|remove)\b")
_SET_RE = re.compile(r"(?i)\b(?:give|grant|change|set|make)\b")
_VIEW_ONLY_RE = re.compile(r"(?i)\bview[\s_-]?only\b")
_FULL_RE = re.compile(r"(?i)\bfull(?:\s+access)?\b")


def to_e164(phone: str) -> str:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("234") and len(digits) >= 13:
        return f"+{digits[:13]}"
    if digits.startswith("0") and len(digits) >= 11:
        return f"+234{digits[1:11]}"
    if len(digits) == 10 and digits[0] in "789":
        return f"+234{digits}"
    if digits:
        return f"+{digits}"
    raise ValueError("invalid phone")


def _find_by_phone(session: Session, phone_e164: str) -> FamilyMember | None:
    return session.scalar(select(FamilyMember).where(FamilyMember.phone_e164 == phone_e164))


def add_family(
    session: Session,
    patient_id: UUID,
    phone_e164: str,
    tier: PermissionTier,
) -> FamilyMember:
    phone = to_e164(phone_e164)
    existing = _find_by_phone(session, phone)
    if existing is not None:
        if existing.patient_id != patient_id and existing.revoked_at is None:
            raise ValueError("phone already linked to another patient")
        existing.patient_id = patient_id
        existing.permission_tier = tier
        existing.revoked_at = None
        session.flush()
        return existing
    member = FamilyMember(
        phone_e164=phone,
        patient_id=patient_id,
        permission_tier=tier,
    )
    session.add(member)
    session.flush()
    return member


def set_tier(
    session: Session,
    patient_id: UUID,
    phone_e164: str,
    tier: PermissionTier,
) -> FamilyMember:
    phone = to_e164(phone_e164)
    member = session.scalar(
        select(FamilyMember).where(
            FamilyMember.phone_e164 == phone,
            FamilyMember.patient_id == patient_id,
            FamilyMember.revoked_at.is_(None),
        )
    )
    if member is None:
        raise ValueError("family member not found")
    member.permission_tier = tier
    session.flush()
    return member


def revoke(session: Session, patient_id: UUID, phone_e164: str) -> None:
    phone = to_e164(phone_e164)
    member = session.scalar(
        select(FamilyMember).where(
            FamilyMember.phone_e164 == phone,
            FamilyMember.patient_id == patient_id,
        )
    )
    if member is None or member.revoked_at is not None:
        return
    member.revoked_at = datetime.now(timezone.utc)
    session.flush()


def _parse_tier(text: str) -> PermissionTier | None:
    if _VIEW_ONLY_RE.search(text or ""):
        return PermissionTier.VIEW_ONLY
    if _FULL_RE.search(text or ""):
        return PermissionTier.FULL_ACCESS
    return None


def parse_family_intent(text: str) -> tuple[str, str, PermissionTier | None] | None:
    match = _PHONE_RE.search(text or "")
    if match is None:
        return None
    phone = match.group(1)
    if _REVOKE_RE.search(text):
        return ("revoke", phone, None)
    if _ADD_RE.search(text):
        return ("add", phone, _parse_tier(text))
    if _SET_RE.search(text) and _parse_tier(text) is not None:
        return ("set_tier", phone, _parse_tier(text))
    return None


def _tier_label(tier: PermissionTier) -> str:
    if tier == PermissionTier.FULL_ACCESS:
        return "full"
    return "view-only"


def apply_family_turn(session: Session, patient_id: UUID, text: str) -> str | None:
    parsed = parse_family_intent(text)
    if parsed is None:
        return None
    action, phone, tier = parsed
    if action == "revoke":
        revoke(session, patient_id, phone)
        return (
            f"I've revoked access for {to_e164(phone)}. "
            "They can no longer see your progress."
        )
    if action == "set_tier":
        chosen = tier or PermissionTier.VIEW_ONLY
        try:
            member = set_tier(session, patient_id, phone, chosen)
        except ValueError:
            member = add_family(session, patient_id, phone, chosen)
        return f"I've updated {member.phone_e164} to {_tier_label(member.permission_tier)} access."
    chosen = tier or PermissionTier.VIEW_ONLY
    try:
        member = add_family(session, patient_id, phone, chosen)
    except ValueError:
        return "That number is already linked to another patient."
    label = _tier_label(member.permission_tier)
    if member.permission_tier == PermissionTier.FULL_ACCESS:
        return (
            f"I've added {member.phone_e164} with {label} access. "
            "They can view progress, book, and pay for you."
        )
    return (
        f"I've added {member.phone_e164} with {label} access. "
        "They can see progress. Say full access if you want them to book or pay."
    )
