from enum import StrEnum
from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, Field


class Persona(StrEnum):
    PATIENT = "patient"
    PHYSIO = "physiotherapist"
    FAMILY = "family"
    ADMIN = "admin"
    PARTNER = "partner"


class ConditionArea(StrEnum):
    MSK = "msk"
    NEURO = "neuro"
    PAEDIATRIC = "paediatric"
    CARDIORESPIRATORY = "cardiorespiratory"
    WOMENS_HEALTH = "womens_health"
    POST_SURGICAL = "post_surgical"


class PatientPhase(StrEnum):
    FIRST_CONTACT = "first_contact"
    MID_TRIAGE = "mid_triage"
    POST_TRIAGE = "post_triage"


class PermissionTier(StrEnum):
    VIEW_ONLY = "view_only"
    FULL_ACCESS = "full_access"


class BookingStatus(StrEnum):
    DRAFT = "draft"
    AWAITING_PAYMENT = "awaiting_payment"
    PROCESSING = "processing"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class AuditKind(StrEnum):
    IDENTITY = "identity"
    TRIAGE = "triage"
    SAFETY = "safety"
    MATCH = "match"
    PAYOUT = "payout"
    REFERRAL_FEE = "referral_fee"
    RELAY = "relay"
    ADMIN = "admin"


class Identity(BaseModel):
    persona: Persona
    person_id: UUID
    phone_e164: str
    linked_patient_id: UUID | None = None
    permission_tier: PermissionTier | None = None


class ExtractedTriage(BaseModel):
    condition_area: ConditionArea | None = None
    onset: str | None = None
    severity: int | None = Field(default=None, ge=1, le=10)
    body_location: str | None = None
    aggravating: list[str] = []
    relieving: list[str] = []
    comorbidities: list[str] = []
    goals: str | None = None
    already_asked_keys: list[str] = []
    flags: dict[str, bool | None] = {}
    # flags keys used by safety: saddle_anesthesia, bladder_bowel_change,
    # bilateral_leg_weakness, unexplained_weight_loss, night_pain, fever,
    # night_sweats, history_of_cancer, recent_trauma, chest_pain,
    # sudden_neuro_deficit, unexplained_numbness


class SafetyResult(BaseModel):
    fired: bool
    rule_ids: list[str]
    reason_plain_language: str
    action: str  # "escalate_doctor" | "continue"


class TurnResult(BaseModel):
    reply_text: str
    language: str
    phase: str
    extracted: ExtractedTriage | None = None
    safety: SafetyResult | None = None
    blocked_by_safety: bool = False
