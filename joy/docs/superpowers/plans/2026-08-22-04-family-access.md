# Family Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Patients add and revoke family by phone number, choose view-only vs full access, and relay questions to the physio without sharing the physio’s number.

**Architecture:** Direct phone registration (contract default). Patient WhatsApp: “add +234… view-only|full”. Creates `family_members` linked to `patients`. Resolver already prefers family table. Permissions from Plan 1 become the real gate for `book`/`pay`. Relay stores a `RelayThread` and uses Joy as the only contact path. Safety escalation copies the patient-facing reasoning to family with access.

**Tech Stack:** Plan 1–3 stack.

## Global Constraints

- After Plan 3 (relay needs a physio on the booking). If executing earlier, stub relay until a `physio_id` exists.
- No one-time redeemable codes.
- Default new family to `view_only` if the patient does not state a tier.
- Never put physio phone or Paystack secret in a family message.
- `authorize` in code; do not rely on the family prompt fragment alone.

---

### Task 1: Add, permission, revoke

**Files:**
- Create: `backend/app/family/access.py`
- Modify: `backend/app/family/permissions.py` (may wrap `identity/permissions.py`)
- Create: `backend/tests/test_family_access.py`

**Interfaces:**
- Consumes: patient identity, E.164 phone
- Produces:
  - `add_family(session, patient_id, phone_e164, tier: PermissionTier) -> FamilyMember`
  - `set_tier(...)`
  - `revoke(session, patient_id, phone_e164) -> None`  # row remains with `revoked_at` so audit trail exists; `resolve` ignores revoked
  - Patient turn parsing: detect add/revoke intents

- [ ] **Step 1: Write the failing test**

```python
from app.family.access import add_family, revoke
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.models.types import PermissionTier, Persona

def test_view_only_cannot_pay(db_session, patient):
    member = add_family(db_session, patient.id, "+2348110000001", PermissionTier.VIEW_ONLY)
    identity = resolve(db_session, "+2348110000001")
    assert identity.persona == Persona.FAMILY
    assert identity.linked_patient_id == patient.id
    assert authorize(identity, "pay") is False
    assert authorize(identity, "view_progress") is True

def test_revoke_stops_resolve(db_session, patient):
    add_family(db_session, patient.id, "+2348110000002", PermissionTier.FULL_ACCESS)
    revoke(db_session, patient.id, "+2348110000002")
    assert resolve(db_session, "+2348110000002") is None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_family_access.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Normalize Nigerian numbers to E.164. Duplicate add updates tier rather than creating two actives.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_family_access.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/family backend/tests/test_family_access.py
git commit -m "feat: add and revoke family access by phone with permission tiers"
```

---

### Task 2: Progress visibility, booking on behalf, emergency notify

**Files:**
- Modify: `backend/app/conversation/turn_handler.py`
- Modify: `backend/app/safety/escalation.py`
- Create: `backend/tests/test_family_actions.py`

**Interfaces:**
- Consumes: `authorize`, booking flow, safety result
- Produces: view_only receives progress/summary copy, cannot start Paystack; full_access may run `booking_flow` against `linked_patient_id`; `notify_family_on_safety(patient_id, SafetyResult)` sends the same reasoning text

- [ ] **Step 1: Write the failing test**

```python
def test_full_access_can_initiate_payment_for_patient(db_session, family_full, fake_llm):
    from app.conversation.turn_handler import handle_turn
    from app.identity.permissions import authorize
    assert authorize(family_full, "pay") is True
    result = handle_turn(db_session, family_full.phone_e164, "book the neuro physio teleconsult", fake_llm)
    assert "pay" in result.reply_text.lower() or "http" in result.reply_text.lower() or "processing" in result.reply_text.lower()

def test_safety_notifies_family(db_session, patient, family_view, fake_llm):
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    from app.conversation.turn_handler import handle_turn
    handle_turn(db_session, patient.phone_e164, "chest pain", fake_llm)
    from app.models.conversation import Message
    family_msgs = [m for m in db_session.query(Message).all() if m.conversation.person_id == family_view.person_id]
    assert any("chest" in (m.text or "").lower() or "doctor" in (m.text or "").lower() for m in family_msgs)
```

Family notify may be recorded as outbound intended messages if WhatsApp send is faked — assert on a `OutboundNotice` table or messages with `role=joy` on the family conversation. If you add `outbound_notices`, include it in this task’s migration.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_family_actions.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

On safety fire, after patient message, load non-revoked family and enqueue the same `patient_message` text.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_family_actions.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/conversation/turn_handler.py backend/app/safety/escalation.py backend/tests/test_family_actions.py
git commit -m "feat: let family act within permission and receive red-flag notices"
```

---

### Task 3: Physio relay without exposing contacts

**Files:**
- Create: `backend/app/family/relay.py`
- Create: `backend/app/models/relay.py`
- Create: `backend/alembic/versions/0007_family_relay.py`
- Create: `backend/tests/test_family_relay.py`

**Interfaces:**
- Consumes: family identity with any access tier (view_only may ask; they cannot book)
- Produces:
  - `ask_physio(session, family_id, question: str) -> RelayMessage`
  - Worker sends question to physio WhatsApp with patient first name + triage summary already on file (no re-ask)
  - Physio reply `apply_physio_answer` sends to family
  - Payload must not contain physio `phone_e164` or family number on the opposite leg
  - `AuditKind.RELAY`

- [ ] **Step 1: Write the failing test**

```python
def test_relay_hides_physio_number(db_session, family_view, physio, patient):
    from app.family.relay import ask_physio, apply_physio_answer
    thread = ask_physio(db_session, family_view.id, "how is recovery going?")
    outbound = thread.last_physio_payload
    assert physio.phone_e164 not in outbound
    answer = apply_physio_answer(db_session, thread.id, "doing well, continue the walks")
    assert family_view.phone_e164 not in (answer.physio_visible_text or "")
    assert physio.phone_e164 not in (answer.family_visible_text or "")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_family_relay.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

If no assigned physio (no confirmed booking), reply that relay starts after a physio is assigned — do not invent a number.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_family_relay.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/family/relay.py backend/app/models/relay.py backend/alembic/versions/0007_family_relay.py backend/tests/test_family_relay.py
git commit -m "feat: relay family questions to physios without sharing phone numbers"
```
