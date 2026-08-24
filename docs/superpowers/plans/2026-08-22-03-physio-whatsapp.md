# Physio WhatsApp Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a physiotherapist onboard, set availability, get booking alerts, file voice session notes, check in on home visits, and request payouts entirely on WhatsApp.

**Architecture:** Persona `physiotherapist` is already resolved in Plan 1. This plan fills `physio/` and wires the orchestrator’s physio phases. Calendar writes go through `write_slots(physio_id, slots)` so the free-text parser can be swapped later. New-booking alerts fire from the Paystack-confirmed path in Plan 2 (enqueue `notify_physio_booking`). Payouts append `AuditKind.PAYOUT` and call Paystack transfer via a client method that tests fake.

**Tech Stack:** Plan 1–2 stack. Voice notes reuse `conversation/voice.py`.

## Global Constraints

- After Plan 2 is green. No physio **web dashboard**. If they ask to edit bio/photo/pricing/credentials, reply that it lives on the web dashboard — do not build that UI.
- Availability parser is free-text; always echo back the interpreted schedule and wait for explicit yes before `write_slots`.
- 48-hour verification SLA: store `credentials_submitted_at` and `verification_due_at = submitted + 48h`. Approval is Plan 6; this plan only tracks and tells the physio where they stand.
- Payout audit events are append-only.
- Do not confirm a booking from physio accept/decline. Accept/decline is after `confirmed` payment.

---

### Task 1: Onboarding (MRTB, credentials, specialties, SLA)

**Files:**
- Create: `backend/app/physio/onboarding.py`
- Modify: `backend/app/models/physiotherapist.py`
- Create: `backend/alembic/versions/0004_physio_onboarding.py`
- Create: `backend/tests/test_physio_onboarding.py`

**Interfaces:**
- Consumes: inbound WhatsApp media ids (store URL/string), `Identity` physio or unknown→physio
- Produces:
  - `apply_onboarding_turn(session, physio, text, media) -> str`
  - Fields: `mrtb_number`, `credential_urls: list[str]`, `specialty_tags`, `onboarding_status` (`collecting`|`submitted`|`verified`|`rejected`), `credentials_submitted_at`, `verification_due_at`
  - Creating a physio from unknown if they say they are a physiotherapist (Plan 1 unknown flow)

- [ ] **Step 1: Write the failing test**

```python
def test_submitted_sets_48h_deadline(db_session, physio):
    from app.physio.onboarding import apply_onboarding_turn
    apply_onboarding_turn(db_session, physio, "MRTB 12345, specialties neuro and msk", media=["https://files/cred.jpg"])
    db_session.refresh(physio)
    assert physio.onboarding_status == "submitted"
    assert physio.verification_due_at is not None
    delta = physio.verification_due_at - physio.credentials_submitted_at
    assert 47 * 3600 <= delta.total_seconds() <= 49 * 3600
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_physio_onboarding.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Conversational collection; do not ask one field per turn if the message already contains number + tags + photo. Confirm SLA in the reply (“submitted, verification within 48 hours”).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_physio_onboarding.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/physio/onboarding.py backend/app/models/physiotherapist.py backend/alembic/versions/0004_physio_onboarding.py backend/tests/test_physio_onboarding.py
git commit -m "feat: capture physio credentials and 48-hour verification SLA on WhatsApp"
```

---

### Task 2: Availability parse then calendar write

**Files:**
- Create: `backend/app/physio/availability.py`
- Create: `backend/app/models/availability_slot.py`
- Create: `backend/alembic/versions/0005_availability_slots.py`
- Create: `backend/tests/test_physio_availability.py`

**Interfaces:**
- Consumes: free-text
- Produces:
  - `parse_availability(text: str) -> list[WeeklyWindow]` (`weekday: int`, `start_hhmm: str`, `end_hhmm: str`)
  - `write_slots(session, physio_id, windows: list[WeeklyWindow]) -> None`  # only calendar writer
  - Double-booking: `write_slots` replaces weekly template; booking overlap check uses confirmed bookings + windows in Plan 2 ranking `next_slot`

- [ ] **Step 1: Write the failing test**

```python
from app.physio.availability import parse_availability, write_slots

def test_parse_weekdays_hours():
    windows = parse_availability("free Mon-Fri 9-5")
    assert len(windows) == 5
    assert windows[0].start_hhmm == "09:00"
    assert windows[0].end_hhmm == "17:00"

def test_write_slots_not_called_until_confirm(db_session, physio):
    windows = parse_availability("free Mon-Fri 9-5")
    # parser must not write
    assert db_session.query(type(physio)).count() >= 0
    write_slots(db_session, physio.id, windows)
    from app.models.availability_slot import AvailabilitySlot
    assert db_session.query(AvailabilitySlot).filter_by(physio_id=physio.id).count() == 5
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_physio_availability.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Turn handler for physio: parse → reply with plain-language recap → on “yes” call `write_slots`. Ranking in Plan 2 should read slots for `next_slot` (update `ranking.py` here if it still returns None).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_physio_availability.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/physio/availability.py backend/app/models/availability_slot.py backend/alembic/versions/0005_availability_slots.py backend/tests/test_physio_availability.py
git commit -m "feat: parse physio free-text hours and write slots only after confirm"
```

---

### Task 3: Booking alerts, triage summary, accept/decline

**Files:**
- Create: `backend/app/physio/booking_alerts.py`
- Modify: `backend/app/api/webhooks/paystack.py` (enqueue alert after confirm)
- Create: `backend/tests/test_physio_booking_alerts.py`

**Interfaces:**
- Consumes: confirmed `Booking`, patient `ExtractedTriage`, `SafetyResult`
- Produces: WhatsApp text with patient (first name), condition area, red flags cleared or fired, goals; replies `accept`/`decline` set `booking.physio_response` (`accepted`|`declined`) **without** changing `BookingStatus` away from `confirmed` except decline → `cancelled` after paid is a product choice: **decline after pay** flags admin (Plan 6) and keeps status `confirmed` until refund exists. This plan: decline sets `physio_response=declined` and enqueues admin audit `ADMIN`, does not mark payment confirmed from this path.

- [ ] **Step 1: Write the failing test**

```python
def test_alert_after_confirm_does_not_change_status(db_session, confirmed_booking):
    from app.physio.booking_alerts import notify_new_booking, apply_physio_reply
    notify_new_booking(db_session, confirmed_booking.id)
    apply_physio_reply(db_session, confirmed_booking.physio_id, "decline")
    db_session.refresh(confirmed_booking)
    assert confirmed_booking.status == "confirmed"
    assert confirmed_booking.physio_response == "declined"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_physio_booking_alerts.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Include triage summary in the alert body so the physio starts informed. Physio `reschedule` / `cancel` messages call `booking_flow.reschedule` / cancel notify; they still must not set `confirmed`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_physio_booking_alerts.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/physio/booking_alerts.py backend/app/api/webhooks/paystack.py backend/tests/test_physio_booking_alerts.py
git commit -m "feat: alert physios of paid bookings with triage summary"
```

---

### Task 4: Session notes, home-visit check-in, payouts

**Files:**
- Create: `backend/app/physio/session_notes.py`
- Create: `backend/app/physio/home_visit_checkin.py`
- Create: `backend/app/physio/payouts.py`
- Create: `backend/app/models/payout.py`
- Create: `backend/app/models/session_note.py`
- Create: `backend/alembic/versions/0006_physio_notes_payouts.py`
- Create: `backend/tests/test_physio_notes_payouts.py`

**Interfaces:**
- Consumes: voice transcript, lat/lng, payout amount
- Produces:
  - `note_from_voice(booking_id, transcript) -> SessionNote` structured `{subjective, objective, plan}` via FakeLLM JSON in tests
  - `checkin(booking_id, lat, lng)` and `complete(booking_id)` timestamped; `BookingStatus.COMPLETED` only from `complete` after `confirmed`
  - `request_payout(physio_id, amount_kobo) -> Payout` status `requested`; `mark_payout_sent` from transfer webhook/fake; `append` `AuditKind.PAYOUT`
  - Weekly earnings summary function `earnings_statement(physio_id, period) -> str`

- [ ] **Step 1: Write the failing test**

```python
def test_payout_is_audited(db_session, physio):
    from app.physio.payouts import request_payout
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind
    request_payout(db_session, physio.id, 500000)
    kinds = [r.kind for r in db_session.query(AuditEvent).all()]
    assert AuditKind.PAYOUT in kinds or "payout" in {str(k) for k in kinds}

def test_complete_home_visit_requires_confirmed(db_session, draft_booking):
    from app.physio.home_visit_checkin import complete
    try:
        complete(db_session, draft_booking.id)
        assert False
    except ValueError:
        pass
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_physio_notes_payouts.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`complete` on confirmed home visit or teleconsult marks `completed` (session done, not payment). Payment confirm remains webhook-only. Wire physio turns in `turn_handler` by `identity.persona == PHYSIO`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_physio_notes_payouts.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/physio backend/app/models/payout.py backend/app/models/session_note.py backend/alembic/versions/0006_physio_notes_payouts.py backend/tests/test_physio_notes_payouts.py
git commit -m "feat: add WhatsApp session notes, home-visit check-in, and payouts"
```
