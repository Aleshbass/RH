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


class ConversationStage(StrEnum):
    """Backend-owned patient journey states.

    These values are deliberately separate from the legacy three-phase column so
    that a model response can never promote a patient to a booking state.
    """

    STORY_CAPTURE = "STORY_CAPTURE"
    SAFETY_INTRODUCTION = "SAFETY_INTRODUCTION"
    SAFETY_SCREEN = "SAFETY_SCREEN"
    TRIAGE_SUMMARY = "TRIAGE_SUMMARY"
    POLICY_REVIEW = "POLICY_REVIEW"
    POLICY_ACCEPTANCE = "POLICY_ACCEPTANCE"
    SPECIALIST_MATCHING = "SPECIALIST_MATCHING"
    SLOT_SELECTION = "SLOT_SELECTION"
    AWAITING_PAYMENT = "AWAITING_PAYMENT"
    BOOKING_CONFIRMED = "BOOKING_CONFIRMED"
    SPECIALIST_REVIEW = "SPECIALIST_REVIEW"
    AWAITING_SPECIALIST_REVIEW = "AWAITING_SPECIALIST_REVIEW"
    REVIEW_OUTCOME_PENDING = "REVIEW_OUTCOME_PENDING"
    MEDICAL_ESCALATION = "MEDICAL_ESCALATION"
    EMERGENCY_ESCALATION = "EMERGENCY_ESCALATION"


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
    BOOKING = "booking"
    FAMILY = "family"
    POLICY = "policy"


class Identity(BaseModel):
    persona: Persona
    person_id: UUID
    phone_e164: str
    linked_patient_id: UUID | None = None
    permission_tier: PermissionTier | None = None


class ExtractedTriage(BaseModel):
    main_complaint: str | None = None
    condition_area: ConditionArea | None = None
    body_region: str | None = None
    onset: str | None = None
    duration: str | None = None
    mechanism: str | None = None
    severity: int | None = Field(default=None, ge=1, le=10)
    body_location: str | None = None
    symptoms: list[str] = []
    radiation: str | None = None
    aggravating: list[str] = []
    relieving: list[str] = []
    functional_limitations: list[str] = []
    main_concern: str | None = None
    comorbidities: list[str] = []
    relevant_medical_history: list[str] = []
    goals: str | None = None
    extraction_confidence: dict[str, float] = {}
    ambiguous_fields: list[str] = []
    fact_sources: dict[str, str] = {}
    safety_answers: dict[str, str] = {}
    safety_question_order: list[str] = []
    safety_protocol_version: str | None = None
    safety_region: str | None = None
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
    action: str  # continue | specialist_review | medical_review | escalate_doctor
    risk_level: str = "GREEN"  # GREEN | AMBER | ORANGE | RED
    protocol_version: str | None = None
    question_ids: list[str] = []
    answers: dict[str, str] = {}


class TurnResult(BaseModel):
    reply_text: str
    language: str
    phase: str
    extracted: ExtractedTriage | None = None
    safety: SafetyResult | None = None
    blocked_by_safety: bool = False
