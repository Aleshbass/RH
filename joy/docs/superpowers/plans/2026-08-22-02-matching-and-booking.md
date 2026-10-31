# Matching and Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a confirmed triage summary, match three specialty-correct physios and take payment to a confirmed booking only when Paystack’s webhook says so.

**Architecture:** Replace Plan 1 `NotReadyError` stubs. `specialty_match` filters by `ConditionArea` before distance. `ranking` orders by specialty fit, location, price, availability, rating. `booking_flow` offers teleconsult vs home visit. `paystack_client` initializes transactions. `booking.state` may move to `confirmed` only from `api/webhooks/paystack.py`. Conversation code may set `awaiting_payment` / talk about `processing`.

**Tech Stack:** Plan 1 stack plus Paystack REST (`httpx`). Redis jobs for payment confirmation side effects (patient + physio WhatsApp).

## Global Constraints

- Same sources and invariants as Plan 1. Execute only after Plan 1 suite is green.
- Types from `backend/app/models/types.py` — do not rename `BookingStatus` values.
- `advance_to_confirmed` is allowed **only** inside the Paystack webhook handler after signature verify. Conversation/turn_handler must not import a “force confirm”.
- Non-MSK cases must never rank an MSK-only physio as the match. Empty specialty-correct set → honest “no specialist yet”, not nearest MSK generalist.
- Never commit Paystack secrets.

---

### Task 1: Physio directory fields and specialty filter

**Files:**
- Modify: `backend/app/models/physiotherapist.py`
- Create: `backend/alembic/versions/0002_physio_matching_fields.py`
- Modify: `backend/app/matching/specialty_match.py`
- Create: `backend/tests/test_specialty_match.py`

**Interfaces:**
- Consumes: `ConditionArea`, physio row
- Produces:
  - Physio columns: `specialty_tags: list[str]`, `lat`, `lng`, `price_kobo: int`, `rating: float`, `verified: bool`, `service_radius_km: float | None`
  - `eligible_physios(session, area: ConditionArea) -> list[Physio]` — `verified` and tag intersection with area; MSK tag is **not** enough for `neuro`/`paediatric`/`cardiorespiratory`/`womens_health`/`post_surgical`

- [ ] **Step 1: Write the failing test**

```python
from app.matching.specialty_match import eligible_physios
from app.models.types import ConditionArea

def test_neuro_case_excludes_msk_only(db_session, msk_only_physio, neuro_physio):
    found = eligible_physios(db_session, ConditionArea.NEURO)
    ids = {p.id for p in found}
    assert neuro_physio.id in ids
    assert msk_only_physio.id not in ids
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_specialty_match.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Map `ConditionArea` to required tag strings (`msk`, `neuro`, `paediatric`, `cardiorespiratory`, `womens_health`, `post_surgical`). Intersection must include the case’s area tag. Unverified physios excluded.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_specialty_match.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/physiotherapist.py backend/alembic/versions/0002_physio_matching_fields.py backend/app/matching/specialty_match.py backend/tests/test_specialty_match.py
git commit -m "feat: match patients to specialty-tagged physios not nearest MSK default"
```

---

### Task 2: Ranking of three candidates

**Files:**
- Create: `backend/app/matching/ranking.py`
- Create: `backend/tests/test_ranking.py`

**Interfaces:**
- Consumes: `eligible_physios`, patient lat/lng
- Produces: `rank(patient, physios, area) -> list[RankedPhysio]` length ≤ 3 with `physio_id`, `price_kobo`, `rating`, `distance_km`, `next_slot` (None until Plan 3 availability; use `None` and still rank)

```python
class RankedPhysio(BaseModel):
    physio_id: UUID
    display_name: str
    price_kobo: int
    rating: float
    distance_km: float
    next_slot: datetime | None
```

- [ ] **Step 1: Write the failing test**

```python
def test_rank_returns_at_most_three(db_session, patient, four_neuro_physios):
    from app.matching.ranking import rank
    from app.models.types import ConditionArea
    out = rank(patient, four_neuro_physios, ConditionArea.NEURO)
    assert len(out) == 3
    distances = [x.distance_km for x in out]
    assert distances == sorted(distances) or out[0].rating >= out[-1].rating
```

Score = specialty already filtered; then sort by `(distance_km, -rating, price_kobo)`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_ranking.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Haversine for `distance_km`. Missing patient coords → distance `inf` last. Audit `AuditKind.MATCH` with candidate ids and scores via `audit.logger.append`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_ranking.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/matching/ranking.py backend/tests/test_ranking.py
git commit -m "feat: rank up to three verified physios by distance rating and price"
```

---

### Task 3: Booking model and state machine

**Files:**
- Create: `backend/app/models/booking.py`
- Create: `backend/alembic/versions/0003_bookings.py`
- Modify: `backend/app/booking/state.py`
- Create: `backend/tests/test_booking_state_machine.py`

**Interfaces:**
- Consumes: `BookingStatus`
- Produces:
  - Table `bookings`: `id`, `patient_id`, `physio_id`, `mode` (`teleconsult`|`home_visit`), `slot_start`, `status`, `paystack_reference` unique, `amount_kobo`
  - `create_draft(...) -> Booking` status `draft`
  - `mark_awaiting_payment(booking, reference)`
  - `mark_processing(booking)` optional, from initialize response
  - `advance_to_confirmed(session, booking_id, *, source: str)` **raises `RuntimeError` unless `source == "paystack_webhook"`**
  - `cancel(booking)`

- [ ] **Step 1: Write the failing test**

```python
from app.booking.state import advance_to_confirmed, create_draft, mark_awaiting_payment
from app.models.types import BookingStatus

def test_conversation_cannot_confirm(db_session, patient, physio):
    booking = create_draft(db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000)
    mark_awaiting_payment(booking, "ref_1")
    try:
        advance_to_confirmed(db_session, booking.id, source="conversation")
        assert False
    except RuntimeError:
        db_session.refresh(booking)
        assert booking.status == BookingStatus.AWAITING_PAYMENT

def test_webhook_source_confirms(db_session, patient, physio):
    booking = create_draft(db_session, patient.id, physio.id, "teleconsult", slot_start=None, amount_kobo=2000000)
    mark_awaiting_payment(booking, "ref_2")
    advance_to_confirmed(db_session, booking.id, source="paystack_webhook")
    db_session.refresh(booking)
    assert booking.status == BookingStatus.CONFIRMED
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_booking_state_machine.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Replace Plan 1 stub. Legal transitions: `draft → awaiting_payment → confirmed` (webhook) or `awaiting_payment → processing → confirmed`. Any other confirm source raises. Do not add a turn_handler helper that passes `paystack_webhook` as a fake source.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_booking_state_machine.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/booking.py backend/alembic/versions/0003_bookings.py backend/app/booking/state.py backend/tests/test_booking_state_machine.py
git commit -m "feat: allow booking confirmation only from the Paystack webhook path"
```

---

### Task 4: Paystack client and webhook

**Files:**
- Create: `backend/app/booking/paystack_client.py`
- Create: `backend/app/api/webhooks/paystack.py`
- Create: `backend/tests/test_paystack_webhook.py`

**Interfaces:**
- Consumes: `Settings.paystack_secret_key`, `paystack_webhook_secret`
- Produces:
  - `initialize_transaction(email, amount_kobo, reference, callback_url) -> {authorization_url, reference}`
  - `POST /webhooks/paystack` verifies HMAC, idempotent on event id, on `charge.success` calls `advance_to_confirmed(..., source="paystack_webhook")`, enqueues “booking confirmed” WhatsApp
  - FakePaystack in tests

- [ ] **Step 1: Write the failing test**

```python
def test_invalid_signature_does_not_confirm(client, db_session, awaiting_booking):
    response = client.post("/webhooks/paystack", content=b'{"event":"charge.success"}', headers={"x-paystack-signature": "nope"})
    assert response.status_code in {400, 401, 403}
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status != "confirmed"

def test_valid_charge_success_confirms(client, db_session, awaiting_booking, paystack_signed_body):
    body, sig = paystack_signed_body
    response = client.post("/webhooks/paystack", content=body, headers={"x-paystack-signature": sig})
    assert response.status_code == 200
    db_session.refresh(awaiting_booking)
    assert awaiting_booking.status == "confirmed"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_paystack_webhook.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Verify signature with secret. Store `paystack_events.id` unique. Map `data.reference` to booking. If amount mismatch, audit and do not confirm. Conversation initialize path: `booking_flow` creates draft, `initialize_transaction`, `mark_awaiting_payment`, reply with the Paystack URL and the word **processing** if asked whether it is paid.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_paystack_webhook.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/booking/paystack_client.py backend/app/api/webhooks/paystack.py backend/tests/test_paystack_webhook.py
git commit -m "feat: confirm bookings from verified Paystack webhooks only"
```

---

### Task 5: Booking flow in the turn handler

**Files:**
- Create: `backend/app/booking/booking_flow.py`
- Modify: `backend/app/conversation/turn_handler.py`
- Modify: `backend/app/conversation/orchestrator.py`
- Create: `backend/tests/test_booking_flow.py`

**Interfaces:**
- Consumes: confirmed `ExtractedTriage`, `rank`, `create_draft`, Paystack initialize
- Produces: after patient confirms summary, Joy presents ≤3 physios (name, price naira, rating, specialty). Patient picks index + `teleconsult` or `home_visit`. Then payment link. Reminders: enqueue a Redis delayed job stub `send_session_reminder(booking_id)` (send function may no-op time travel in tests).

- [ ] **Step 1: Write the failing test**

```python
def test_post_triage_offers_specialty_matches_not_booking_confirmed(db_session, neuro_patient_ready, fake_llm):
    from app.conversation.turn_handler import handle_turn
    fake_llm.reply = "ok"
    result = handle_turn(db_session, neuro_patient_ready.phone, "yes that's correct", fake_llm)
    assert "confirmed" not in result.reply_text.lower()
    assert "processing" in result.reply_text.lower() or "pay" in result.reply_text.lower() or "₦" in result.reply_text or "naira" in result.reply_text.lower() or "physio" in result.reply_text.lower()
```

Also assert a match audit row exists.

Patient `cancel` / `reschedule` replies update `BookingStatus.CANCELLED` or `slot_start` only when status is `confirmed` or `awaiting_payment`. They must never set `confirmed`. Include `test_patient_cancel_does_not_confirm`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_booking_flow.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Remove Plan 1 “matching isn’t live” copy. Orchestrator gains phases or substates stored on conversation: `offering_matches`, `awaiting_slot_mode`, `awaiting_payment`. Still no `confirmed` from this file.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_booking_flow.py tests/test_booking_state_machine.py tests/test_turn_handler.py -v`

Expected: PASS (old turn tests still hold: safety override, no conversation confirm)

- [ ] **Step 5: Commit**

```bash
git add backend/app/booking/booking_flow.py backend/app/conversation backend/tests/test_booking_flow.py
git commit -m "feat: take patients from confirmed triage to Paystack payment link"
```
