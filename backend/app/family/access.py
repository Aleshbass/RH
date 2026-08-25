from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.admin import Admin
from app.models.family_member import FamilyMember
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import PermissionTier

_PHONE_TOKEN = r"(?:\+?234[\d\s-]{10,}|\b0\d{10}\b)"
_PHONE_RE = re.compile(_PHONE_TOKEN)
_CUE = (
    r"(?:family|mum|mom|mummy|mama|mother|dad|daddy|papa|father|"
    r"sister|brother|sis|bro|wife|husband|spouse|son|daughter|child|kids?|"
    r"auntie|aunt|uncle|cousin|nana|grand(?:ma|pa|mother|father)|in-laws?|access)"
)
_VERB_THEN_CUE_RE = re.compile(
    rf"(?i)\b(?:add|revoke|register|remove|give|grant|change|set|make)\s+"
    rf"(?:(?:my|our|the)\s+)?{_CUE}\b"
)
_CUE_ADJ_PHONE_RE = re.compile(
    rf"(?i)(?:\b{_CUE}\s+{_PHONE_TOKEN}|{_PHONE_TOKEN}\s+(?:(?:my|our|the)\s+)?{_CUE}\b)"
)
_START_ADD_RE = re.compile(r"(?i)^\s*add\b")
_START_REVOKE_RE = re.compile(r"(?i)^\s*revoke\b")
_START_REGISTER_RE = re.compile(r"(?i)^\s*register\b")
_START_REMOVE_RE = re.compile(r"(?i)^\s*remove\b")
_START_SET_RE = re.compile(r"(?i)^\s*(?:give|grant|change|set|make)\b")
_ADJ_ADD_RE = re.compile(rf"(?i)\badd\s+{_PHONE_TOKEN}")
_ADJ_REVOKE_RE = re.compile(rf"(?i)\brevoke\s+{_PHONE_TOKEN}")
_ADJ_REGISTER_RE = re.compile(rf"(?i)\bregister\s+{_PHONE_TOKEN}")
_ADJ_REMOVE_RE = re.compile(rf"(?i)\bremove\s+{_PHONE_TOKEN}")
_ADJ_SET_RE = re.compile(rf"(?i)\b(?:give|grant|change|set|make)\s+{_PHONE_TOKEN}")
_VIEW_ONLY_RE = re.compile(r"(?i)\bview[\s_-]?only\b")
_FULL_ACCESS_RE = re.compile(r"(?i)\bfull\s+access\b")
_FULL_AFTER_PHONE_RE = re.compile(rf"(?i){_PHONE_TOKEN}\s*full\b")

_LINKED_ELSEWHERE = "That number is already linked to another patient."
_PERSONA_IN_USE = (
    "That number already belongs to a patient, physiotherapist, admin, or partner, "
    "so I can't add it as family."
)


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


def _persona_owns_phone(session: Session, phone: str) -> bool:
    for model in (Patient, Physiotherapist, Admin, Partner):
        if session.scalar(select(model.id).where(model.phone_e164 == phone)) is not None:
            return True
    return False


def add_family(
    session: Session,
    patient_id: UUID,
    phone_e164: str,
    tier: PermissionTier,
) -> FamilyMember:
    phone = to_e164(phone_e164)
    if _persona_owns_phone(session, phone):
        raise ValueError(_PERSONA_IN_USE)
    existing = _find_by_phone(session, phone)
    if existing is not None:
        if existing.patient_id != patient_id and existing.revoked_at is None:
            raise ValueError(_LINKED_ELSEWHERE)
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
    raw = text or ""
    if _VIEW_ONLY_RE.search(raw):
        return PermissionTier.VIEW_ONLY
    if _FULL_ACCESS_RE.search(raw) or _FULL_AFTER_PHONE_RE.search(raw):
        return PermissionTier.FULL_ACCESS
    return None


def _bound_cue(text: str) -> bool:
    return _VERB_THEN_CUE_RE.search(text) is not None or _CUE_ADJ_PHONE_RE.search(text) is not None


def parse_family_intent(text: str) -> tuple[str, str, PermissionTier | None] | None:
    raw = text or ""
    match = _PHONE_RE.search(raw)
    if match is None:
        return None
    phone = match.group(0)
    tier = _parse_tier(raw)
    cue = _bound_cue(raw)
    if _ADJ_REVOKE_RE.search(raw) or (cue and _START_REVOKE_RE.search(raw)):
        return ("revoke", phone, None)
    if _ADJ_ADD_RE.search(raw) or (cue and _START_ADD_RE.search(raw)):
        return ("add", phone, tier)
    if cue and (_ADJ_REMOVE_RE.search(raw) or _START_REMOVE_RE.search(raw)):
        return ("revoke", phone, None)
    if cue and (_ADJ_REGISTER_RE.search(raw) or _START_REGISTER_RE.search(raw)):
        return ("add", phone, tier)
    if (_ADJ_SET_RE.search(raw) or (cue and _START_SET_RE.search(raw))) and tier is not None:
        return ("set_tier", phone, tier)
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
            try:
                member = add_family(session, patient_id, phone, chosen)
            except ValueError as exc:
                return str(exc)
        return f"I've updated {member.phone_e164} to {_tier_label(member.permission_tier)} access."
    chosen = tier or PermissionTier.VIEW_ONLY
    try:
        member = add_family(session, patient_id, phone, chosen)
    except ValueError as exc:
        return str(exc)
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
