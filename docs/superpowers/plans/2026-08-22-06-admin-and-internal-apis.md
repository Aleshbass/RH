# Admin WhatsApp and Internal APIs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver admin phone-urgent workflows, make the audit log independently queryable over HTTP, and expose the internal APIs the frontend team needs — without building any of their UIs.

**Architecture:** `admin/` handles escalation routing, verification quick-reply (ambiguous cases stay `needs_web_review`), broadcasts, stats digest. `api/internal/*` is thin HTTP over existing domain functions. Conversation takeover: if `conversations.human_takeover is True`, the worker does not call Gemini; Joy tells the patient a human has stepped in (visible by default). Retool UI is out of scope.

**Tech Stack:** Plan 1–5 stack.

## Global Constraints

- After Plan 5 so referral/payout/triage/match events exist to query.
- No Retool, no takeover UI, no receipt HTML pages — JSON/PDF-ready payloads only.
- HMO pre-authorisation export remains out of scope; do not add a generic claims exporter.
- Audit HTTP is read/append-only. No PATCH of `audit_events`.
- Takeover visibility: patient sees an explicit human-in-the-loop message.

---

### Task 1: Escalation router, verification queue, takeover flag

**Files:**
- Create: `backend/app/admin/escalation_router.py`
- Create: `backend/app/admin/verification_queue.py`
- Modify: `backend/app/models/conversation.py` (`human_takeover: bool`, `takeover_notified_at`)
- Create: `backend/alembic/versions/0010_admin.py`
- Create: `backend/tests/test_admin_escalation.py`

**Interfaces:**
- Consumes: `SafetyResult`, disputes text, off-platform flags, physio `onboarding_status=submitted`
- Produces:
  - `route_escalation(kind, payload) -> None` WhatsApp all `admins`
  - `quick_reply_verify(physio_id, decision: 'approve'|'reject'|'web')`
  - `set_takeover(conversation_id, on: bool) -> str` patient-visible notice when `on=True`
  - Off-platform detector stub: keyword list (`pay me direct`, `my personal number`) → escalation kind `off_platform`

- [ ] **Step 1: Write the failing test**

```python
def test_takeover_is_visible(db_session, patient_conversation):
    from app.admin.escalation_router import set_takeover
    text = set_takeover(db_session, patient_conversation.id, True)
    assert "human" in text.lower() or "person" in text.lower() or "team" in text.lower()
    db_session.refresh(patient_conversation)
    assert patient_conversation.human_takeover is True

def test_quick_approve_physio(db_session, submitted_physio, admin_identity):
    from app.admin.verification_queue import quick_reply_verify
    quick_reply_verify(db_session, submitted_physio.id, "approve")
    db_session.refresh(submitted_physio)
    assert submitted_physio.onboarding_status == "verified"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_escalation.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`turn_handler`: if `human_takeover`, skip LLM, optionally still run safety on patient text and route to admin. Verification `web` leaves status `submitted` and records `needs_web_review=True`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_escalation.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/admin backend/app/models/conversation.py backend/alembic/versions/0010_admin.py backend/tests/test_admin_escalation.py
git commit -m "feat: route admin escalations and make conversation takeover visible"
```

---

### Task 2: Broadcasts and stats digest

**Files:**
- Create: `backend/app/admin/broadcast.py`
- Create: `backend/app/admin/stats_digest.py`
- Create: `backend/tests/test_admin_broadcast_stats.py`

**Interfaces:**
- Consumes: explicit admin instruction + segment (`all_patients`|`all_physios`|`physios_in_city`)
- Produces: `send_broadcast(admin_id, segment, body)` (refuse if identity is not admin); `digest() -> str` counts bookings/revenue_kobo/active_physios for a period

- [ ] **Step 1: Write the failing test**

```python
def test_non_admin_cannot_broadcast(db_session, patient_identity):
    from app.admin.broadcast import send_broadcast
    try:
        send_broadcast(db_session, patient_identity.person_id, "all_patients", "hello")
        assert False
    except PermissionError:
        pass

def test_digest_contains_counts(db_session):
    from app.admin.stats_digest import digest
    text = digest(db_session)
    assert "booking" in text.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_admin_broadcast_stats.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Schedule hook: `POST /api/internal/jobs/stats_digest` protected by `INTERNAL_JOB_TOKEN` in Settings (not a public UI).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_admin_broadcast_stats.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/admin/broadcast.py backend/app/admin/stats_digest.py backend/tests/test_admin_broadcast_stats.py
git commit -m "feat: add admin WhatsApp broadcasts and stats digest"
```

---

### Task 3: Queryable audit API and frontend-facing internals

**Files:**
- Create: `backend/app/api/internal/admin_panel.py`
- Create: `backend/app/api/internal/physio_profile.py`
- Create: `backend/app/api/internal/partner_portal.py`
- Create: `backend/app/api/internal/receipts.py`
- Create: `backend/tests/test_internal_apis.py`

**Interfaces:**
- Consumes: domain tables
- Produces JSON only:
  - `GET /api/internal/audit?kind=&person_id=&from=&to=` list events ascending, no updates
  - `GET/PUT /api/internal/physios/{id}/profile` credentials/bio/pricing **data** (UI is someone else)
  - `GET /api/internal/partners/{id}/referrals`
  - `GET /api/internal/receipts/{booking_id}` payload `{amount_kobo, paid_at, patient_name, physio_name, reference}` — not an HTML page
  - Protect with `INTERNAL_API_KEY` header. 401 without it.

- [ ] **Step 1: Write the failing test**

```python
def test_audit_is_independently_queryable(client, db_session, safety_audit_row):
    response = client.get("/api/internal/audit", params={"kind": "safety"}, headers={"X-Internal-Key": "test-key"})
    assert response.status_code == 200
    ids = [row["id"] for row in response.json()["events"]]
    assert str(safety_audit_row.id) in ids

def test_audit_rejects_patch(client):
    response = client.patch("/api/internal/audit/00000000-0000-0000-0000-000000000001", json={"kind": "x"}, headers={"X-Internal-Key": "test-key"})
    assert response.status_code in {404, 405, 422}

def test_receipt_json_not_html(client, confirmed_booking):
    response = client.get(f"/api/internal/receipts/{confirmed_booking.id}", headers={"X-Internal-Key": "test-key"})
    assert response.status_code == 200
    assert "text/html" not in response.headers.get("content-type", "")
    assert "amount_kobo" in response.json()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_internal_apis.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Register routers in `main.py`. Document paths in `backend/docs/internal-api.md` (short table of methods). This markdown is for the frontend team, not a UI.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_internal_apis.py -v && pytest -v`

Expected: full suite PASS — Contract §4 now demonstrable: languages+triage (Plan 1), specialty match + webhook booking (Plan 2), physio WhatsApp (Plan 3), family (Plan 4), partner fee (Plan 5), queryable audit (this task).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/internal backend/tests/test_internal_apis.py backend/docs/internal-api.md backend/app/main.py
git commit -m "feat: expose queryable audit and internal APIs for the frontend team"
```
