# Joy AI Phase 1 — Design Spec

Approved 22 August 2026: full-contract product (A), intelligence-core-first build order (B). Rules in `.cursor/rules/` are in force.

Sources of truth: `docs/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/joy-system-prompt.md`, `docs/Rehabify_Joy_Development_Contract.docx`, `docs/Joy-PRD-and-Capability-Matrix.pdf`. Architecture and contract win conflicts.

This spec is the umbrella. Implementation is six plans under `docs/superpowers/plans/`. Do not start Plan N+1 until Plan N’s tests pass. Do not write application code until Vance says to execute a plan.

---

## 1. What we are building

Joy is Rehabify’s WhatsApp-first assistant. Care is the product: she must sound like she is with the person, not processing a form. This repo (`joy-ai`) is backend + conversational engineering + infrastructure only. A separate frontend team consumes APIs. No product web UI ships here.

Phase 1 (contract) takes a person from first WhatsApp message through specialty-correct matching and Paystack-confirmed booking, and gives physios, families, partners, and admin a WhatsApp backend with an append-only audit trail.

## 2. Locked decisions

| Topic | Decision |
|---|---|
| Language | Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2 |
| Data | Postgres (not Convex). Redis for webhook job queue (not RabbitMQ) |
| LLM | Gemini text for extraction; Gemini Live for voice / multilingual. No fine-tuning. RAG glossary only |
| Channel | WhatsApp Cloud API. No patient web chat product. `POST /api/internal/simulate_turn` exists for tests and local ops only |
| Empathy | Prompt fragment `empathy.md` on every turn. Safety escalations are **code-composed** (care + reason + instruction). No second LLM “empathy judge.” Warmth never un-fires a red flag or keeps booking after a fire |
| Family access | Direct phone registration. Default permission `view_only` |
| Availability | Free-text parse in `physio/availability.py`; calendar write is a separate function so a slot picker can replace the parser later |
| Admin takeover | Visible to the patient when a human steps in |
| Secrets | Copy values from `rehabify-joy/backend` env only. Never commit `.env` |
| Deploy | GitHub `Joy-AI` → Railway. Health on `GET /api/health` |

Out of this repo: physio dashboard UI, Retool UI, partner portal UI, receipt pages, takeover UI, HMO pre-auth export, Layer 3 exercise tracking, extra CV/ASR beyond Live voice notes.

## 3. Decomposition (six plans)

| Plan | Working software when done |
|---|---|
| 1 Intelligence core | Unknown or known patient can complete batched MSK/non-MSK triage in five languages; red flags fire in code with reasoning; context persists; WhatsApp in/out; triage/safety audit rows. Matching/payment return an explicit not-ready path, not fake confirmation |
| 2 Matching + booking | After confirmed summary, rank 3 specialty-correct physios; teleconsult vs home visit; Paystack init; status `confirmed` only from Paystack webhook |
| 3 Physio WhatsApp | Onboarding, availability, alerts, notes, home-visit check-in, payouts |
| 4 Family | Add/revoke by phone, view_only vs full_access, relay, emergency notify |
| 5 Partner | Referral attribution, direct referral, ₦2,000 first-session fee, urgent flag |
| 6 Admin + internal APIs | Escalations, verification quick-reply, broadcasts, stats digest, queryable audit, `api/internal/*` for the frontend team |

One FastAPI app, one module tree (`docs/ARCHITECTURE.md`). Later plans fill packages reserved in Plan 1. They do not start a second service.

## 4. Architecture

Inbound WhatsApp hits a thin webhook, is acked, and is enqueued. A worker runs one turn:

1. `identity.resolver.resolve(phone)` → exactly one persona or unknown-sender flow. **Before** any LLM or domain logic.
2. `identity.permissions.authorize(identity, action)` in code.
3. `conversation.state_manager.load` — durable facts + last turns + summary + `last_known_language`. Never re-ask stored facts.
4. `conversation.orchestrator.phase` — code chooses phase (`first_contact` / `mid_triage` / `post_triage` for patients; persona-specific phases otherwise).
5. `llm.prompt_builder.build` — fragments from `prompts/`, not a single always-on blob.
6. `llm.gemini_client` — text or Live. Output is a candidate reply plus structured extraction JSON.
7. `triage.extraction` — typed `ExtractedTriage` (may merge model JSON with regex/glossary assist).
8. `safety.evaluator.evaluate` — **no LLM**. If `fired`, `safety.escalation.patient_message` **replaces** the candidate reply (do not re-prompt Gemini to soften it). Order: care, then reasoning, then see-a-doctor. Family with access is notified once Plan 4 exists; Plan 1 records the intent on the safety event.
9. `triage.question_batching` — missing fields → at most one grouped follow-up for the **next** user-visible ask. Not a checklist across turns.
10. `audit.logger.append` — triage and safety every turn; match and payout in later plans.

Booking confirmation is not in this loop. Only `api/webhooks/paystack.py` may set `Booking.status = confirmed`.

## 5. Components (boundaries)

Each unit has one job. Later plans depend on the **Produces** interfaces, not internals.

| Unit | Does | Depends on |
|---|---|---|
| `identity/` | Phone → persona, permissions, unknown first-contact | models |
| `conversation/` | State, language, orchestrator, one-turn handler, voice ingest | identity, llm, triage, safety, audit |
| `safety/` | Rule catalog, evaluate, escalate. Zero Gemini imports | extracted triage fields only |
| `triage/` | Extract, batch questions, MSK vs non-MSK specialty area, confirm summary | llm extraction schema, safety |
| `llm/` | Gemini wrapper, prompt assembly, RAG retrieve | prompts/, knowledge_base |
| `audit/` | Insert-only events | Postgres |
| `matching/` | Specialty filter then rank (Plan 2) | triage summary, physio records |
| `booking/` | Slots, Paystack client, status machine (Plan 2) | matching, webhooks |
| `physio/` | WhatsApp physio workflows (Plan 3) | identity, booking, llm voice |
| `family/` | Access + relay (Plan 4) | identity, permissions, conversation |
| `partner/` | Referrals + fee (Plan 5) | identity, booking completed events |
| `admin/` | Phone-urgent admin + queues (Plan 6) | audit, physio verification |
| `api/webhooks/` | Verify, enqueue, no business logic | queue |
| `api/internal/` | Frontend-team HTTP (stubs in Plan 1, real in Plan 6) | domain services |
| `queue/` | Redis jobs, retries | webhooks |

Plan 1 creates `matching/` and `booking/` as explicit stubs: `NotReadyError` with a stable message. Plan 2 replaces the stub bodies without changing call sites.

## 6. Canonical types

All plans use these names. Put them in `backend/app/models/types.py` in Plan 1.

```python
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
```

Red-flag catalog (deterministic, Plan 1, extendable without prompt changes):

- `cauda_equina` — any of saddle anesthesia, bladder/bowel change, bilateral leg weakness
- `infection` — fever or night sweats with unexplained systemic picture
- `malignancy_screen` — unexplained weight loss or history of cancer plus night pain
- `major_trauma` — recent trauma with inability to bear weight (from flags)
- `cardiac` — chest pain
- `acute_neuro` — sudden neuro deficit

A flag that is `None` (unknown) does not fire a rule. A flag that is `True` can. Ambiguous safety-critical fields may be asked as the single structured exception in triage batching.

## 6b. Empathy (all personas)

Joy acknowledges the person before the task. Patients in pain, family who are worried, physios under time pressure, partners handing off a case, admin on an escalation — each gets warmth without therapy-speak or false reassurance.

**Safety boundary:** `evaluate()` is binary and deterministic. Empathy is only allowed in the **message**. `patient_message(result)` in `safety/escalation.py` (no Gemini import) must:

1. Open with concern that names the situation when the rule id implies it (e.g. chest pain, saddle numbness).
2. Include `reason_plain_language`.
3. End with a clear see-a-doctor / emergency instruction.
4. Contain no booking, matching, “wait and see,” or “still see a physio first.”

Non-escalation turns: `prompts/empathy.md` is always assembled. Tests assert the fragment is present. First-contact handler tests use a warm scripted FakeLLM reply and assert it is not rewritten into a checklist. A cold model candidate on a **fired** safety turn is discarded, not edited by another model.

## 7. Data flow, errors, testing

**Errors:** Webhook signature failure → 401/403, no enqueue. Worker crash → Redis retry with backoff, then dead-letter + admin audit event. Gemini timeout → one retry, then a short WhatsApp apology without advancing phase. Paystack signature failure → 400, no status change. Safety fire → skip matching/booking for that turn.

**Idempotency:** WhatsApp `wamid` and Paystack `event.id` stored uniquely so retries do not double-send or double-confirm.

**Tests (no live Gemini or Paystack in CI):** fake `GeminiClient` and `PaystackClient`. Safety tests import `safety/` only and prove `patient_message` has care **before** the doctor instruction and never offers a booking. Booking tests prove conversation handlers cannot set `confirmed`. Identity tests cover five personas and unknown. Triage tests prove two-turn batching, not a checklist. Prompt-builder tests prove `empathy.md` is always included. Language tests use fixtures in EN/Pidgin/Yoruba/Igbo/Hausa with the fake model echoing the fixture language.

**Simulate:** `POST /api/internal/simulate_turn` `{phone, text, audio_url?}` runs the same worker path as WhatsApp. Not a product UI.

Patient and physio reschedule/cancel live in Plans 2–3 as WhatsApp replies against existing bookings. They never write `BookingStatus.confirmed`.

## 8. Context persistence

Durable tables hold people, facts, triage sessions, bookings, family links, referrals. `conversations` hold `summary_text`, `last_known_language`, `phase`. `messages` hold recent turns (worker loads last 12). Returning users skip collected fields. Relays (Plans 3–4) copy triage summary into the outbound physio/family message; they do not ask the other party to restate it.

## 9. Scope check

This spec is the whole Phase 1 product. It is **not** one implementation plan. Six plans below are the implementation units. Exercise coaching, form-correction CV, HMO export, and subscription-after-discharge productisation are PRD Phase 2 or out of contract — do not sneak them into Plans 1–6. Session reminders that are “reply to Joy” stay in Plan 2 as booking notifications, not Layer 3 exercise plans.
