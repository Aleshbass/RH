# Partner Referrals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track partner referrals, start triage on a direct handoff, confirm when the patient books, flag urgent cases, and confirm the flat ₦2,000 first-session referral fee when that session completes.

**Architecture:** `partners` already exist as an identity table. Each partner has `referral_code`. Inbound WhatsApp with a code, or `direct_refer(patient_phone)`, attributes `patients.referred_by_partner_id`. Fee confirmation listens to `BookingStatus.COMPLETED` (Plan 3 session complete) for the patient’s **first** completed session, amount **200000 kobo**, `AuditKind.REFERRAL_FEE`. HMO pre-auth export is out of scope.

**Tech Stack:** Plan 1–4 stack.

## Global Constraints

- After Plan 3 (need completed sessions). Plan 4 not strictly required.
- Fee is flat ₦2,000 first session, not a percentage.
- No partner web portal UI; `api/internal/partner_portal.py` may wait for Plan 6 but this plan must persist the data that portal will read.
- Urgent flag only accelerates matching sort (boost), it does not skip safety or payment webhooks.

---

### Task 1: Referral codes and direct referral

**Files:**
- Create: `backend/app/partner/referral.py`
- Modify: `backend/app/models/partner.py`
- Modify: `backend/app/models/patient.py`
- Create: `backend/alembic/versions/0008_referrals.py`
- Create: `backend/tests/test_partner_referral.py`

**Interfaces:**
- Consumes: partner identity, patient phone
- Produces:
  - `ensure_code(partner) -> str`
  - `attribute(session, patient_id, code: str) -> None`
  - `direct_refer(session, partner_id, patient_phone) -> Patient` creates/links patient and starts/open triage session
  - Partner confirmation message when that patient reaches `BookingStatus.CONFIRMED`

- [ ] **Step 1: Write the failing test**

```python
def test_direct_refer_sets_attribution(db_session, partner):
    from app.partner.referral import direct_refer
    patient = direct_refer(db_session, partner.id, "+2348220000001")
    assert patient.referred_by_partner_id == partner.id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_partner_referral.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Unique `referral_code`. Idempotent `direct_refer` on same phone.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_partner_referral.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/partner/referral.py backend/app/models/partner.py backend/app/models/patient.py backend/alembic/versions/0008_referrals.py backend/tests/test_partner_referral.py
git commit -m "feat: attribute patients to referral partners from WhatsApp"
```

---

### Task 2: Urgent flag and fee confirmation

**Files:**
- Create: `backend/app/partner/urgent_flag.py`
- Create: `backend/app/partner/fee_confirmation.py`
- Create: `backend/app/models/referral_fee.py`
- Create: `backend/alembic/versions/0009_referral_fees.py`
- Modify: `backend/app/matching/ranking.py` (urgent boost)
- Modify: `backend/app/physio/home_visit_checkin.py` or booking complete hook
- Create: `backend/tests/test_partner_fee.py`

**Interfaces:**
- Consumes: `BookingStatus.COMPLETED`, partner id
- Produces:
  - `flag_urgent(patient_id, partner_id)`
  - `confirm_first_session_fee(session, booking_id) -> ReferralFee | None` — ₦2,000, once per patient, append `AuditKind.REFERRAL_FEE`, WhatsApp partner
  - Ranking: urgent patients sort before others with same specialty

- [ ] **Step 1: Write the failing test**

```python
def test_fee_once_on_first_completed(db_session, referred_patient, confirmed_then_completed_booking):
    from app.partner.fee_confirmation import confirm_first_session_fee
    first = confirm_first_session_fee(db_session, confirmed_then_completed_booking.id)
    assert first is not None
    assert first.amount_kobo == 200000
    second = confirm_first_session_fee(db_session, confirmed_then_completed_booking.id)
    assert second is None or second.id == first.id
    from app.models.audit_log import AuditEvent
    from app.models.types import AuditKind
    assert db_session.query(AuditEvent).filter_by(kind=AuditKind.REFERRAL_FEE).count() >= 1

def test_unpaid_booking_does_not_pay_fee(db_session, draft_referred_booking):
    from app.partner.fee_confirmation import confirm_first_session_fee
    assert confirm_first_session_fee(db_session, draft_referred_booking.id) is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_partner_fee.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Call `confirm_first_session_fee` from session `complete` after status is `completed` and the booking was previously `confirmed` via webhook. Wire partner turns: accept referral, urgent, content-request → enqueue admin (Plan 6 can read `content_requests`; this plan stores `PartnerContentRequest` rows).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_partner_fee.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/partner backend/app/models/referral_fee.py backend/alembic/versions/0009_referral_fees.py backend/app/matching/ranking.py backend/tests/test_partner_fee.py
git commit -m "feat: confirm ₦2000 first-session referral fees and urgent flags"
```
