from __future__ import annotations

import logging
import re
import secrets
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, object_session

from app.audit.logger import append
from app.conversation.state_manager import load
from app.models.admin import Admin
from app.models.booking import Booking
from app.models.conversation import Conversation, Message
from app.models.family_member import FamilyMember
from app.models.partner import Partner
from app.models.patient import Patient
from app.models.physiotherapist import Physiotherapist
from app.models.types import AuditKind, BookingStatus, Identity, PatientPhase, Persona

logger = logging.getLogger(__name__)

_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_CODE_LEN = 8
_TOKEN_RE = re.compile(r"[A-Za-z0-9]{6,16}")
_PHONE_RE = re.compile(r"(?:\+?234[\d\s-]{10,}|\b0\d{10}\b)")

_PARTNER_NO_PHONE = (
    "Send a patient's WhatsApp number to start their triage. "
    "Your referral code is {code}."
)
_PARTNER_REFERRED = (
    "I've started triage for {phone}. I'll confirm here when they book."
)
_PARTNER_OCCUPIED = (
    "That number already belongs to someone on Joy, so I can't refer it as a patient."
)
_CONFIRMED_NOTICE = (
    "A patient you referred ({name}) has confirmed their booking. "
    "I'll update you when their first session is complete."
)


def ensure_code(partner: Partner) -> str:
    if partner.referral_code:
        return partner.referral_code
    session = object_session(partner)
    for _ in range(24):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(_CODE_LEN))
        if session is None:
            partner.referral_code = code
            return code
        taken = session.scalar(select(Partner.id).where(Partner.referral_code == code))
        if taken is None:
            partner.referral_code = code
            session.flush()
            return code
    raise RuntimeError("could not allocate a unique referral_code")


def attribute(session: Session, patient_id: UUID, code: str) -> None:
    token = (code or "").strip().upper()
    if not token:
        return
    partner = session.scalar(
        select(Partner).where(func.upper(Partner.referral_code) == token)
    )
    if partner is None:
        return
    patient = session.get(Patient, patient_id)
    if patient is None:
        return
    if patient.referred_by_partner_id is not None:
        return
    patient.referred_by_partner_id = partner.id
    append(
        session,
        kind=AuditKind.IDENTITY,
        actor_phone=patient.phone_e164,
        person_id=patient.id,
        payload={
            "decision": "referred",
            "partner_id": str(partner.id),
            "referral_code": partner.referral_code,
        },
    )
    session.flush()


def direct_refer(session: Session, partner_id: UUID, patient_phone: str) -> Patient:
    partner = session.get(Partner, partner_id)
    if partner is None:
        raise ValueError("partner not found")
    phone = to_e164(patient_phone)
    patient = _ensure_patient_and_open_triage(session, phone)
    assigned = False
    if patient.referred_by_partner_id is None:
        patient.referred_by_partner_id = partner.id
        assigned = True
    if assigned:
        append(
            session,
            kind=AuditKind.IDENTITY,
            actor_phone=partner.phone_e164,
            person_id=patient.id,
            payload={
                "decision": "direct_refer",
                "partner_id": str(partner.id),
                "patient_phone": phone,
            },
        )
        session.flush()
    return patient


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


def find_referral_code(session: Session, text: str) -> str | None:
    tokens = {token.upper() for token in _TOKEN_RE.findall(text or "")}
    if not tokens:
        return None
    partner = session.scalar(
        select(Partner).where(func.upper(Partner.referral_code).in_(tokens))
    )
    if partner is None or not partner.referral_code:
        return None
    return partner.referral_code


def apply_inbound_code(session: Session, patient_id: UUID, text: str) -> None:
    code = find_referral_code(session, text)
    if code is None:
        return
    attribute(session, patient_id, code)


def maybe_provision_from_referral(
    session: Session, phone_e164: str, user_text: str
) -> Identity | None:
    code = find_referral_code(session, user_text)
    if code is None:
        return None
    patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone_e164))
    if patient is None:
        patient = Patient(phone_e164=phone_e164)
        session.add(patient)
        session.flush()
    attribute(session, patient.id, code)
    return Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=phone_e164,
    )


def apply_partner_turn(session: Session, partner_id: UUID, text: str) -> str:
    partner = session.get(Partner, partner_id)
    if partner is None:
        raise ValueError("partner not found")
    code = ensure_code(partner)
    inbound_code = find_referral_code(session, text)
    phone_match = _PHONE_RE.search(text or "")
    if phone_match is None:
        return _PARTNER_NO_PHONE.format(code=code)
    try:
        phone = to_e164(phone_match.group(0))
    except ValueError:
        return _PARTNER_NO_PHONE.format(code=code)
    try:
        if inbound_code:
            patient = _ensure_patient_and_open_triage(session, phone)
            attribute(session, patient.id, inbound_code)
        else:
            patient = direct_refer(session, partner_id, phone)
    except ValueError:
        return _PARTNER_OCCUPIED
    return _PARTNER_REFERRED.format(phone=patient.phone_e164)


def notify_referring_partner(session: Session, booking_id: UUID | str) -> str | None:
    booking = session.get(Booking, booking_id)
    if booking is None or booking.status != BookingStatus.CONFIRMED:
        return None
    patient = session.get(Patient, booking.patient_id)
    if patient is None or patient.referred_by_partner_id is None:
        return None
    partner = session.get(Partner, patient.referred_by_partner_id)
    if partner is None:
        return None
    name = (patient.name or "").strip() or patient.phone_e164
    text = _CONFIRMED_NOTICE.format(name=name)
    conversation = session.scalar(
        select(Conversation).where(
            Conversation.person_id == partner.id,
            Conversation.persona == Persona.PARTNER,
        )
    )
    if conversation is None:
        conversation = Conversation(
            person_id=partner.id,
            persona=Persona.PARTNER,
            phase=PatientPhase.FIRST_CONTACT,
        )
        session.add(conversation)
        session.flush()
    session.add(Message(conversation_id=conversation.id, role="joy", text=text))
    session.flush()
    _enqueue_partner_notice(partner.phone_e164, text)
    return text


def _enqueue_partner_notice(phone: str, text: str) -> None:
    try:
        from app.queue.tasks import enqueue_notify_partner_referral

        enqueue_notify_partner_referral(phone, text)
    except Exception:
        logger.exception("failed to enqueue partner referral confirmation")


def _ensure_patient_and_open_triage(session: Session, phone: str) -> Patient:
    if _persona_owns_phone(session, phone):
        raise ValueError("phone occupied")
    patient = session.scalar(select(Patient).where(Patient.phone_e164 == phone))
    if patient is None:
        patient = Patient(phone_e164=phone)
        session.add(patient)
        session.flush()
    identity = Identity(
        persona=Persona.PATIENT,
        person_id=patient.id,
        phone_e164=patient.phone_e164,
    )
    load(session, identity)
    session.flush()
    return patient


def _persona_owns_phone(session: Session, phone: str) -> bool:
    for model in (Physiotherapist, Admin, Partner, FamilyMember):
        if session.scalar(select(model.id).where(model.phone_e164 == phone)) is not None:
            return True
    return False
