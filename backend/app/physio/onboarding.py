import re
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.physiotherapist import Physiotherapist

SLA_HOURS = 48

_MRTB_RE = re.compile(r"(?i)\bmrtb\b[:\s#\-]*([A-Za-z0-9]+)")

_TAG_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"(?i)\bwomen'?s\s+health\b|\bwomens_health\b"), "womens_health"),
    (re.compile(r"(?i)\bpost[\s\-]?surgical\b|\bpost_surgical\b"), "post_surgical"),
    (re.compile(r"(?i)\bcardiorespiratory\b"), "cardiorespiratory"),
    (re.compile(r"(?i)\bpaediatric\b|\bpediatric\b|\bpaeds\b"), "paediatric"),
    (re.compile(r"(?i)\bneuro(?:log(?:y|ical))?\b"), "neuro"),
    (re.compile(r"(?i)\bmusculoskeletal\b|\bmsk\b"), "msk"),
)

_SUBMITTED_SLA = "Your details are submitted, verification within 48 hours."
_STANDING_SUBMITTED = (
    "Your credentials are submitted, verification within 48 hours. "
    "You're not verified yet — I can't approve you from this chat."
)
_STANDING_VERIFIED = (
    "You're already verified. Credential changes live on the web dashboard, not here."
)
_STANDING_REJECTED = (
    "Your credentials were rejected. Next steps live on the web dashboard, not here."
)


def _parse_mrtb(text: str) -> str | None:
    match = _MRTB_RE.search(text or "")
    if match is None:
        return None
    return match.group(1)


def _parse_tags(text: str) -> list[str]:
    found: list[str] = []
    haystack = text or ""
    for pattern, tag in _TAG_PATTERNS:
        if pattern.search(haystack) and tag not in found:
            found.append(tag)
    return found


def _merge_unique(existing: list[str] | None, incoming: list[str]) -> list[str]:
    merged = list(existing or [])
    for item in incoming:
        if item and item not in merged:
            merged.append(item)
    return merged


def _join_en(parts: list[str]) -> str:
    if len(parts) == 1:
        return parts[0]
    if len(parts) == 2:
        return f"{parts[0]} and {parts[1]}"
    return f"{', '.join(parts[:-1])}, and {parts[-1]}"


def _collecting_reply(*, have_mrtb: bool, have_tags: bool, have_creds: bool) -> str:
    already: list[str] = []
    missing: list[str] = []
    if have_mrtb:
        already.append("your MRTB number")
    else:
        missing.append("your MRTB number")
    if have_tags:
        already.append("your specialty tags")
    else:
        missing.append("your specialty tags")
    if have_creds:
        already.append("your credential photo")
    else:
        missing.append("a photo of your credentials")

    ack = f"I've got {_join_en(already)}. " if already else ""
    if len(missing) == 1:
        return f"{ack}Please send {missing[0]}?"
    return (
        f"{ack}Please send {_join_en(missing)} — you can include them all in one message?"
    )


def _standing_reply(physio: Physiotherapist) -> str:
    if physio.onboarding_status == "verified":
        return _STANDING_VERIFIED
    if physio.onboarding_status == "rejected":
        return _STANDING_REJECTED
    return _STANDING_SUBMITTED


def apply_onboarding_turn(
    session: Session,
    physio: Physiotherapist,
    text: str,
    media: list[str] | None,
) -> str:
    if physio.onboarding_status in {"submitted", "verified", "rejected"}:
        session.flush()
        return _standing_reply(physio)

    if physio.mrtb_number is None:
        parsed = _parse_mrtb(text)
        if parsed:
            physio.mrtb_number = parsed
    incoming_tags = _parse_tags(text)
    if incoming_tags:
        physio.specialty_tags = _merge_unique(physio.specialty_tags, incoming_tags)
    incoming_media = [item for item in (media or []) if item]
    if incoming_media:
        physio.credential_urls = _merge_unique(physio.credential_urls, incoming_media)

    have_mrtb = bool(physio.mrtb_number)
    have_tags = bool(physio.specialty_tags)
    have_creds = bool(physio.credential_urls)
    if have_mrtb and have_tags and have_creds:
        submitted_at = datetime.now(timezone.utc)
        physio.onboarding_status = "submitted"
        physio.credentials_submitted_at = submitted_at
        physio.verification_due_at = submitted_at + timedelta(hours=SLA_HOURS)
        session.flush()
        return _SUBMITTED_SLA

    physio.onboarding_status = "collecting"
    session.flush()
    return _collecting_reply(
        have_mrtb=have_mrtb, have_tags=have_tags, have_creds=have_creds
    )
