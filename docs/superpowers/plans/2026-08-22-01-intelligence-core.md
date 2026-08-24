# Intelligence Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Joy conversation engine: identity, memory, five-language batched MSK/non-MSK triage, deterministic red flags with caring (not cold) reasoning, WhatsApp in/out, and append-only triage/safety audit — without fake booking confirmation.

**Architecture:** One FastAPI app under `backend/`. WhatsApp (or `simulate_turn`) enqueues a job; the worker resolves identity first, loads durable context, lets the orchestrator pick phase, calls Gemini, extracts structured triage, runs `safety/` with no LLM, batches leftover questions, and appends audit events. `matching/` and `booking/` exist only as `NotReadyError` stubs.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy 2, Alembic, Postgres 16, Redis 7, Pydantic v2, pytest, httpx. Gemini behind a protocol so CI uses a fake.

## Global Constraints

- Sources: `docs/AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/joy-system-prompt.md`, contract, PRD. Architecture and contract win.
- No product web UI. No code copied from `RH/` or `rehabify-joy/` except env keys when wiring `.env`.
- `safety/` must not import Gemini or `llm/`.
- Empathy is required on every reply. Safety still always wins: no second LLM, no booking after a fire. Escalation copy is care + reason + instruction in `escalation.py`.
- Never set booking status `confirmed` (no booking rows in this plan except none).
- Triage: one open question, then one batched follow-up. Never a one-at-a-time checklist.
- Types in `backend/app/models/types.py` match `docs/superpowers/specs/2026-08-22-joy-ai-phase1-design.md` §6 exactly.
- Working directory for all commands: `backend/`.
- Do not start Plan 2 until this plan’s tests pass.

---

### Task 1: App skeleton and health

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/docker-compose.yml`
- Create: `backend/.env.example`
- Create: `backend/app/__init__.py`
- Create: `backend/app/config.py`
- Create: `backend/app/main.py`
- Create: `backend/app/api/health.py`
- Create: `backend/tests/test_health.py`

**Interfaces:**
- Consumes: nothing
- Produces: `Settings` from env; `GET /api/health` returns `{"status": "ok"}`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_health.py
from fastapi.testclient import TestClient
from app.main import app

def test_health_ok():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_health.py::test_health_ok -v`

Expected: FAIL (module `app.main` not found)

- [ ] **Step 3: Write minimal implementation**

`pyproject.toml` depends on `fastapi`, `uvicorn`, `sqlalchemy`, `alembic`, `asyncpg`, `psycopg[binary]`, `pydantic-settings`, `redis`, `httpx`, `pytest`, `google-genai`. Python `>=3.12`.

```python
# backend/app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://joy:joy@localhost:5432/joy"
    redis_url: str = "redis://localhost:6379/0"
    gemini_api_key: str = ""
    gemini_text_model: str = "gemini-2.0-flash"
    gemini_live_model: str = "gemini-2.0-flash-live"
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    paystack_secret_key: str = ""
    paystack_webhook_secret: str = ""

def get_settings() -> Settings:
    return Settings()
```

```python
# backend/app/api/health.py
from fastapi import APIRouter
router = APIRouter()

@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
```

```python
# backend/app/main.py
from fastapi import FastAPI
from app.api.health import router as health_router

app = FastAPI(title="Joy AI")
app.include_router(health_router)
```

`docker-compose.yml`: Postgres 16 (`joy`/`joy`/`joy`) and Redis 7. `.env.example` lists the Settings fields with empty secrets.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_health.py::test_health_ok -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/pyproject.toml backend/docker-compose.yml backend/.env.example backend/app backend/tests/test_health.py
git commit -m "feat: add FastAPI health endpoint and local compose"
```

---

### Task 2: Canonical types, models, Alembic

**Files:**
- Create: `backend/app/models/__init__.py`
- Create: `backend/app/models/types.py`
- Create: `backend/app/models/base.py`
- Create: `backend/app/models/patient.py`
- Create: `backend/app/models/physiotherapist.py`
- Create: `backend/app/models/family_member.py`
- Create: `backend/app/models/admin.py`
- Create: `backend/app/models/partner.py`
- Create: `backend/app/models/conversation.py`
- Create: `backend/app/models/triage_session.py`
- Create: `backend/app/models/audit_log.py`
- Create: `backend/app/db.py`
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/versions/0001_baseline.py`
- Create: `backend/tests/test_types.py`

**Interfaces:**
- Consumes: `Settings.database_url`
- Produces: enums and Pydantic types from spec §6; SQLAlchemy tables `patients`, `physiotherapists`, `family_members`, `admins`, `partners` with unique `phone_e164`; `conversations`, `messages`, `triage_sessions`, `audit_events` (append-only, no update mapper)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_types.py
from app.models.types import ConditionArea, ExtractedTriage, Persona, SafetyResult

def test_extracted_triage_defaults():
    extracted = ExtractedTriage()
    assert extracted.condition_area is None
    assert extracted.flags == {}
    assert Persona.PATIENT == "patient"
    assert ConditionArea.NEURO == "neuro"
    result = SafetyResult(fired=False, rule_ids=[], reason_plain_language="", action="continue")
    assert result.fired is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_types.py -v`

Expected: FAIL (`app.models.types` missing)

- [ ] **Step 3: Write minimal implementation**

Copy spec §6 into `types.py` unchanged (field names, enum values, flag key comments). SQLAlchemy 2 `DeclarativeBase`. `audit_events`: `id`, `created_at`, `kind`, `actor_phone`, `person_id`, `payload` JSONB. No `updated_at` on audit. `conversations`: `id`, `person_id`, `persona`, `phase`, `last_known_language`, `summary_text`. `messages`: `conversation_id`, `role` (`user`|`joy`|`system`), `text`, `created_at`, unique `wa_message_id` nullable. `triage_sessions`: `patient_id`, `extracted` JSONB, `condition_area`, `status` (`open`|`summarised`|`escalated`). Phone columns unique across each identity table. Alembic `0001_baseline` creates all of these.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_types.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/models backend/app/db.py backend/alembic.ini backend/alembic backend/tests/test_types.py
git commit -m "feat: add canonical types and baseline schema"
```

---

### Task 3: Identity resolver and permissions

**Files:**
- Create: `backend/app/identity/__init__.py`
- Create: `backend/app/identity/resolver.py`
- Create: `backend/app/identity/permissions.py`
- Create: `backend/app/identity/unknown_sender.py`
- Create: `backend/tests/test_identity_routing.py`

**Interfaces:**
- Consumes: identity tables; `Identity`, `Persona`, `PermissionTier`
- Produces:
  - `resolve(session, phone_e164: str) -> Identity | None`
  - `authorize(identity: Identity, action: str) -> bool`
  - `begin_unknown(session, phone_e164: str) -> str`  # first WhatsApp question
  - Actions used now: `triage`, `book`, `pay`, `physio_onboard`, `admin`, `partner_refer`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_identity_routing.py
from uuid import uuid4
from app.identity.permissions import authorize
from app.identity.resolver import resolve
from app.models.types import Identity, PermissionTier, Persona

def test_family_view_only_cannot_pay():
    identity = Identity(
        persona=Persona.FAMILY,
        person_id=uuid4(),
        phone_e164="+2348000000001",
        linked_patient_id=uuid4(),
        permission_tier=PermissionTier.VIEW_ONLY,
    )
    assert authorize(identity, "pay") is False
    assert authorize(identity, "view_progress") is True

def test_unknown_phone_resolves_none(db_session):
    assert resolve(db_session, "+2348000000999") is None
```

Add `db_session` fixture in `backend/tests/conftest.py` (transaction-per-test against compose Postgres or SQLite only if Postgres types are avoided — **use Postgres**).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_identity_routing.py -v`

Expected: FAIL (identity package missing)

- [ ] **Step 3: Write minimal implementation**

`resolve` looks up phone in order: `admins`, `partners`, `physiotherapists`, `family_members`, `patients`. First hit wins. Never call Gemini. `authorize`: patient may `triage`/`book`/`pay`; family `view_only` only `view_progress`; family `full_access` also `book`/`pay`; physio `physio_onboard` and later physio actions; admin `admin`; partner `partner_refer`. `unknown_sender.begin_unknown` stores no persona yet and returns one question: ask whether they need physio care, are a physio, or were added by family — a single grouped ask, not three turns.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_identity_routing.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/identity backend/tests/test_identity_routing.py backend/tests/conftest.py
git commit -m "feat: resolve WhatsApp sender to persona before any LLM call"
```

---

### Task 4: Append-only audit logger

**Files:**
- Create: `backend/app/audit/__init__.py`
- Create: `backend/app/audit/logger.py`
- Create: `backend/tests/test_audit_logger.py`

**Interfaces:**
- Consumes: `audit_events` table, `AuditKind`
- Produces: `append(session, *, kind: AuditKind, actor_phone: str, person_id, payload: dict) -> UUID` — INSERT only. No update/delete functions.

- [ ] **Step 1: Write the failing test**

```python
from app.audit.logger import append
from app.models.audit_log import AuditEvent
from app.models.types import AuditKind

def test_audit_insert_not_update(db_session, patient_id):
    first = append(db_session, kind=AuditKind.SAFETY, actor_phone="+2348000000001", person_id=patient_id, payload={"fired": False})
    second = append(db_session, kind=AuditKind.SAFETY, actor_phone="+2348000000001", person_id=patient_id, payload={"fired": True})
    rows = db_session.query(AuditEvent).order_by(AuditEvent.created_at).all()
    assert len(rows) == 2
    assert rows[0].id == first
    assert rows[1].payload["fired"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_audit_logger.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`append` inserts `AuditEvent` and flushes. Do not expose `session.merge` on this table. If a caller tries to mutate a loaded event, tests should still show two rows after two `append` calls.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_audit_logger.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/audit backend/tests/test_audit_logger.py
git commit -m "feat: append-only audit log for triage and safety events"
```

---

### Task 5: Conversation state and language

**Files:**
- Create: `backend/app/conversation/__init__.py`
- Create: `backend/app/conversation/state_manager.py`
- Create: `backend/app/conversation/language.py`
- Create: `backend/tests/test_state_manager.py`

**Interfaces:**
- Consumes: `Conversation`, `Message`, `TriageSession`, `Identity`
- Produces:
  - `load(session, identity: Identity) -> ConversationState`
  - `save_turn(session, state, user_text, joy_text, extracted, phase, language)`
  - `ConversationState` with `phase`, `last_known_language`, `summary_text`, `recent_messages` (max 12), `extracted: ExtractedTriage`, `known_facts: dict`
  - `mirror_language(user_text: str, last_known: str | None) -> str` returning one of `en`, `pcm`, `yo`, `ig`, `ha` (heuristic + last known; Gemini may confirm later)

- [ ] **Step 1: Write the failing test**

```python
def test_returning_patient_keeps_extracted_fields(db_session, patient_identity):
    from app.conversation.state_manager import load, save_turn
    from app.models.types import ExtractedTriage, PatientPhase
    extracted = ExtractedTriage(onset="3 days", body_location="knee")
    state = load(db_session, patient_identity)
    save_turn(db_session, state, "knee hurt 3 days", "ok", extracted, PatientPhase.MID_TRIAGE, "en")
    again = load(db_session, patient_identity)
    assert again.extracted.onset == "3 days"
    assert again.extracted.body_location == "knee"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_state_manager.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`load` creates conversation + open triage session if missing. Merge extracted fields with “new non-null wins, never wipe a known value with None”. `known_facts` includes name/age/location from `patients` so the orchestrator will not re-ask them.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_state_manager.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/conversation/state_manager.py backend/app/conversation/language.py backend/app/conversation/__init__.py backend/tests/test_state_manager.py
git commit -m "feat: persist conversation facts so returning patients are not re-asked"
```

---

### Task 6: Prompt fragments and builder

**Files:**
- Create: `backend/prompts/base_identity.md`
- Create: `backend/prompts/tone_and_format.md`
- Create: `backend/prompts/empathy.md`
- Create: `backend/prompts/safety_interface.md`
- Create: `backend/prompts/triage_discipline.md`
- Create: `backend/prompts/patient.md`
- Create: `backend/prompts/physiotherapist.md`
- Create: `backend/prompts/family.md`
- Create: `backend/prompts/admin.md`
- Create: `backend/prompts/partner.md`
- Create: `backend/app/llm/__init__.py`
- Create: `backend/app/llm/prompt_builder.py`
- Create: `backend/tests/test_prompt_builder.py`

**Interfaces:**
- Consumes: `Identity`, phase string, `ExtractedTriage`, RAG snippet, history
- Produces: `build(identity, phase, extracted, language, history, rag_snippet) -> str`

- [ ] **Step 1: Write the failing test**

```python
def test_builder_includes_persona_and_phase(patient_identity):
    from app.llm.prompt_builder import build
    from app.models.types import ExtractedTriage, PatientPhase
    text = build(patient_identity, PatientPhase.FIRST_CONTACT, ExtractedTriage(), "en", [], "")
    assert "currently speaking with: patient" in text.lower() or "patient" in text.lower()
    assert "first_contact" in text
    assert "Do not open with a checklist" in text or "ONE open question" in text
    assert "empathy" in text.lower() or "genuine care" in text.lower() or "acknowledge" in text.lower()
    assert "red flag" in text.lower() or "safety" in text.lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_prompt_builder.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Paste fragment bodies from `docs/joy-system-prompt.md` into the markdown files, including **`empathy.md`**. `build` concatenates `base_identity + tone_and_format + empathy + safety_interface + triage_discipline + matching persona file + injected phase/extracted/language/history/rag`. Do not paste the whole PRD Part C as one blob.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_prompt_builder.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/prompts backend/app/llm/prompt_builder.py backend/tests/test_prompt_builder.py
git commit -m "feat: assemble Joy prompts by persona and conversation phase"
```

---

### Task 7: Gemini client protocol and fake

**Files:**
- Create: `backend/app/llm/gemini_client.py`
- Create: `backend/tests/fakes.py`
- Create: `backend/tests/test_gemini_client.py`

**Interfaces:**
- Consumes: `Settings.gemini_api_key`, models
- Produces:
  - `class LLMClient(Protocol): def complete(self, prompt: str, user_text: str) -> LLMResponse: ...`
  - `class LLMResponse: reply_text: str; extraction_json: dict; language: str`
  - `GeminiClient` real; `FakeLLM` in tests returns scripted replies

- [ ] **Step 1: Write the failing test**

```python
from tests.fakes import FakeLLM

def test_fake_llm_returns_scripted_extraction():
    llm = FakeLLM(reply="Tell me more.", extraction={"onset": "1 week"}, language="en")
    response = llm.complete("prompt", "my back has hurt for a week")
    assert response.extraction_json["onset"] == "1 week"
    assert response.reply_text == "Tell me more."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_gemini_client.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`GeminiClient.complete` asks the model for JSON `{reply_text, extraction, language}` using the prompt builder output plus user text. `FakeLLM` ignores the API. Live/voice method `complete_voice(audio_bytes, mime) -> LLMResponse` can raise `NotImplementedError` until Task 12, but the method must exist on the protocol.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_gemini_client.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/gemini_client.py backend/tests/fakes.py backend/tests/test_gemini_client.py
git commit -m "feat: wrap Gemini behind a testable LLM protocol"
```

---

### Task 8: Deterministic safety engine

**Files:**
- Create: `backend/app/safety/__init__.py`
- Create: `backend/app/safety/red_flag_rules.py`
- Create: `backend/app/safety/evaluator.py`
- Create: `backend/app/safety/escalation.py`
- Create: `backend/tests/test_safety_rules.py`

**Interfaces:**
- Consumes: `ExtractedTriage.flags` only
- Produces:
  - `evaluate(extracted: ExtractedTriage) -> SafetyResult`
  - `patient_message(result: SafetyResult) -> str`  # reasoning then instruction
- `safety/` must not import `app.llm`

- [ ] **Step 1: Write the failing test**

```python
from app.models.types import ExtractedTriage
from app.safety.evaluator import evaluate
from app.safety.escalation import patient_message

def test_cauda_equina_fires_without_llm():
    extracted = ExtractedTriage(flags={"saddle_anesthesia": True})
    result = evaluate(extracted)
    assert result.fired is True
    assert "cauda_equina" in result.rule_ids
    text = patient_message(result)
    assert "doctor" in text.lower() or "hospital" in text.lower() or "emergency" in text.lower()
    assert len(result.reason_plain_language) > 20
    care_marks = ("concern", "sorry", "care", "worried", "with you")
    assert any(m in text.lower() for m in care_marks)
    instruction_at = min(i for i in (text.lower().find("doctor"), text.lower().find("hospital"), text.lower().find("emergency")) if i >= 0)
    care_at = min(text.lower().find(m) for m in care_marks if m in text.lower())
    assert care_at < instruction_at
    assert "book" not in text.lower()
    assert "physio" not in text.lower()

def test_unknown_flags_do_not_fire():
    extracted = ExtractedTriage(flags={"saddle_anesthesia": None})
    assert evaluate(extracted).fired is False

def test_safety_module_has_no_llm_import():
    import app.safety.evaluator as ev
    import pathlib
    source = pathlib.Path(ev.__file__).read_text()
    assert "gemini" not in source.lower()
    assert "app.llm" not in source
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_safety_rules.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Implement the six rules from spec §6. `True` in `any_of` fires. `None`/`False`/`missing` does not. `patient_message` is **code**, not Gemini: a caring opener, then `reason_plain_language`, then a clear see-a-doctor line. Never instruction-only. Never offer a physio booking on a fired result.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_safety_rules.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/safety backend/tests/test_safety_rules.py
git commit -m "feat: evaluate red flags in code independent of Gemini"
```

---

### Task 9: Triage extraction, batching, MSK/non-MSK, summary

**Files:**
- Create: `backend/app/triage/__init__.py`
- Create: `backend/app/triage/extraction.py`
- Create: `backend/app/triage/question_batching.py`
- Create: `backend/app/triage/msk.py`
- Create: `backend/app/triage/non_msk.py`
- Create: `backend/app/triage/summary.py`
- Create: `backend/tests/test_triage_batching.py`

**Interfaces:**
- Consumes: `LLMResponse.extraction_json`, `ExtractedTriage`
- Produces:
  - `merge_extraction(existing: ExtractedTriage, incoming: dict) -> ExtractedTriage`
  - `missing_fields(extracted: ExtractedTriage) -> list[str]`
  - `grouped_followup(missing: list[str]) -> str | None`  # one message or None
  - `infer_condition_area(extracted) -> ConditionArea | None`  # msk vs neuro/paeds/cardio/womens/post_surgical
  - `plain_summary(extracted) -> str`

- [ ] **Step 1: Write the failing test**

```python
from app.models.types import ExtractedTriage
from app.triage.question_batching import grouped_followup, missing_fields
from app.triage.extraction import merge_extraction

def test_one_grouped_followup_not_checklist():
    extracted = merge_extraction(ExtractedTriage(), {"onset": "2 weeks", "body_location": "shoulder"})
    missing = missing_fields(extracted)
    assert "onset" not in missing
    followup = grouped_followup(missing)
    assert followup is not None
    assert followup.count("?") <= 2  # one grouped ask, not a chain of questions as separate turns
    assert "\n1." not in followup  # no numbered checklist

def test_neuro_not_labelled_msk():
    from app.triage.non_msk import infer_non_msk_area
    from app.models.types import ConditionArea
    extracted = ExtractedTriage(goals="walk after stroke")
    assert infer_non_msk_area(extracted) == ConditionArea.NEURO
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_triage_batching.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Required fields for a complete triage: `onset`, `severity`, `body_location` or condition narrative, `condition_area`, goals, and safety flags that are still `None` if the area is MSK with back/leg symptoms (safety exception: those missing flags become **one** structured sentence inside the same grouped follow-up, not extra turns). `infer_condition_area` uses keywords (stroke, parkinson, child, breathing, pelvic, surgery) then defaults unset area to `msk` only when the narrative is joint/muscle pain — never overwrite an explicit non-MSK area. `plain_summary` is confirm-or-correct language.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_triage_batching.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/triage backend/tests/test_triage_batching.py
git commit -m "feat: batch triage follow-ups and keep non-MSK specialty distinct"
```

---

### Task 10: Orchestrator, turn handler, matching stub

**Files:**
- Create: `backend/app/conversation/orchestrator.py`
- Create: `backend/app/conversation/turn_handler.py`
- Create: `backend/app/matching/__init__.py`
- Create: `backend/app/matching/specialty_match.py`
- Create: `backend/app/booking/__init__.py`
- Create: `backend/app/booking/state.py`
- Create: `backend/tests/test_turn_handler.py`

**Interfaces:**
- Consumes: identity, state, LLMClient, safety, triage, audit
- Produces:
  - `decide_phase(state) -> PatientPhase`
  - `handle_turn(session, phone: str, user_text: str, llm: LLMClient) -> TurnResult`
  - `match_physios(...)` raises `NotReadyError`
  - `confirm_booking(...)` does not exist; `booking.state.advance_to_confirmed` raises `RuntimeError("webhooks only")` if called

- [ ] **Step 1: Write the failing test**

```python
def test_first_contact_does_not_checklist(db_session, patient_phone, fake_llm):
    from app.conversation.turn_handler import handle_turn
    fake_llm.reply = "Sorry about the knee — tell me the whole story when you can."
    result = handle_turn(db_session, patient_phone, "my knee is bad", fake_llm)
    assert result.phase == "first_contact"
    assert "1-10" not in result.reply_text
    assert "knee" in result.reply_text.lower() or "sorry" in result.reply_text.lower() or "sound" in result.reply_text.lower()

def test_safety_overrides_model_cheer(db_session, patient_phone, fake_llm):
    fake_llm.extraction = {"flags": {"chest_pain": True}}
    fake_llm.reply = "Let's book a physio for tomorrow!"
    result = handle_turn(db_session, patient_phone, "chest pain and shoulder ache", fake_llm)
    assert result.blocked_by_safety is True
    assert "book" not in result.reply_text.lower()
    assert result.safety.fired is True
    assert result.reply_text != fake_llm.reply
    assert any(m in result.reply_text.lower() for m in ("concern", "sorry", "care", "worried"))
    assert "doctor" in result.reply_text.lower() or "emergency" in result.reply_text.lower() or "hospital" in result.reply_text.lower()

def test_booking_cannot_confirm_from_conversation():
    from app.booking.state import advance_to_confirmed
    try:
        advance_to_confirmed(booking_id="x")
        assert False, "must not confirm"
    except RuntimeError as exc:
        assert "webhook" in str(exc).lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_turn_handler.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Turn pipeline = spec §4. If identity is None, return `begin_unknown` text and audit `IDENTITY`. If safety fires, **discard** the model reply and send `patient_message` only — do not call Gemini again to rewrite it. Set triage session `escalated`, skip batching. After summary confirmed (`user_text` matches yes/correct), call `match_physios` inside try/except `NotReadyError` and tell the patient matching is the next slice — never “you’re booked”. `advance_to_confirmed` always raises.

Phase rules: no extracted narrative → `first_contact`. Missing fields → `mid_triage`. Summary sent, awaiting confirm → `post_triage`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_turn_handler.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/conversation/orchestrator.py backend/app/conversation/turn_handler.py backend/app/matching backend/app/booking backend/tests/test_turn_handler.py
git commit -m "feat: run each Joy turn through orchestrator, safety, and audit"
```

---

### Task 11: Redis queue, WhatsApp webhook, simulate_turn

**Files:**
- Create: `backend/app/queue/__init__.py`
- Create: `backend/app/queue/tasks.py`
- Create: `backend/app/queue/worker.py`
- Create: `backend/app/api/webhooks/whatsapp.py`
- Create: `backend/app/api/internal/simulate.py`
- Create: `backend/tests/test_whatsapp_webhook.py`

**Interfaces:**
- Consumes: `handle_turn`, WhatsApp credentials
- Produces:
  - `GET /webhook` verify hub.challenge
  - `POST /webhook` verify signature, enqueue, 200
  - `POST /api/internal/simulate_turn` body `{phone, text}`
  - `enqueue_inbound(wa_message_id, phone, text)` idempotent on `wa_message_id`

- [ ] **Step 1: Write the failing test**

```python
def test_webhook_verify(client):
    response = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "test-token", "hub.challenge": "abc"})
    assert response.status_code == 200
    assert response.text == "abc"

def test_simulate_turn_uses_handler(client, db_session, patient_phone):
    response = client.post("/api/internal/simulate_turn", json={"phone": patient_phone, "text": "hello"})
    assert response.status_code == 200
    assert "reply" in response.json()
```

Patch settings verify token to `test-token` in fixture.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_whatsapp_webhook.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Thin routers only. Worker calls `handle_turn` then WhatsApp send (fake in tests). Idempotency: skip if `wa_message_id` already in `messages`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_whatsapp_webhook.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/queue backend/app/api/webhooks backend/app/api/internal/simulate.py backend/tests/test_whatsapp_webhook.py
git commit -m "feat: accept WhatsApp webhooks and enqueue conversation turns"
```

---

### Task 12: Voice notes and RAG glossary

**Files:**
- Create: `backend/app/conversation/voice.py`
- Create: `backend/app/llm/rag/retriever.py`
- Create: `backend/app/llm/rag/knowledge_base/glossary.md`
- Create: `backend/app/llm/rag/knowledge_base/specialties.md`
- Create: `backend/tests/test_voice_and_rag.py`

**Interfaces:**
- Consumes: audio bytes; condition area
- Produces: `ingest_voice(audio, mime) -> str` transcript via `LLMClient.complete_voice`; `retrieve(condition_area) -> str` snippet

- [ ] **Step 1: Write the failing test**

```python
def test_retrieve_neuro_glossary():
    from app.llm.rag.retriever import retrieve
    from app.models.types import ConditionArea
    snippet = retrieve(ConditionArea.NEURO)
    assert "stroke" in snippet.lower() or "neuro" in snippet.lower()

def test_voice_uses_live_client(fake_llm):
    from app.conversation.voice import ingest_voice
    fake_llm.voice_transcript = "my child cannot sit since the operation"
    text = ingest_voice(fake_llm, b"fake", "audio/ogg")
    assert "child" in text
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_voice_and_rag.py -v`

Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

Glossary markdown lists specialty definitions (MSK, neuro, paediatric, cardiorespiratory, women’s health, post-surgical) and red-flag terms for RAG, not for deciding flags. `retrieve` returns the matching section. Voice path feeds transcript into `handle_turn` as `user_text`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_voice_and_rag.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/conversation/voice.py backend/app/llm/rag backend/tests/test_voice_and_rag.py
git commit -m "feat: ingest voice notes and retrieve clinical glossary snippets"
```

---

### Task 13: Five-language persistence acceptance

**Files:**
- Create: `backend/tests/test_languages_and_memory.py`
- Modify: `backend/tests/fakes.py` (scripted language echo)

**Interfaces:**
- Consumes: `handle_turn`, `FakeLLM`
- Produces: CI proof that EN/Pidgin/Yoruba/Igbo/Hausa fixtures complete two-turn triage without checklist, and a second session does not re-ask onset

- [ ] **Step 1: Write the failing test**

```python
LANGUAGES = {
    "en": "My lower back has hurt for two weeks after lifting.",
    "pcm": "My back dey pain me two weeks since I carry heavy load.",
    "yo": "Ẹ̀yìn mi ti ń dun fún ọ̀sẹ̀ méjì.",
    "ig": "Azụ m na-egbu m ụbọchị abụọ izu.",
    "ha": "Bayan na ji zafi tsawon makonni biyu.",
}

def test_each_language_two_turns_then_memory(db_session, fake_llm):
    from app.conversation.turn_handler import handle_turn
    for lang, line in LANGUAGES.items():
        phone = f"+2348000000{hash(lang) % 100:02d}"
        fake_llm.language = lang
        fake_llm.extraction = {"onset": "2 weeks", "body_location": "back", "condition_area": "msk"}
        first = handle_turn(db_session, phone, line, fake_llm)
        assert first.language == lang
        fake_llm.extraction = {"severity": 6}
        second = handle_turn(db_session, phone, "ok", fake_llm)
        assert second.phase in {"mid_triage", "post_triage"}
        handle_turn(db_session, phone, "still the back", fake_llm)
        from app.identity.resolver import resolve
        from app.conversation.state_manager import load
        identity = resolve(db_session, phone)
        state = load(db_session, identity)
        assert state.extracted.onset == "2 weeks"
```

Unknown senders in this test should be auto-provisioned as patients on first triage intent — implement that in `unknown_sender` if not already: if they describe a symptom, create `patients` row so `resolve` succeeds next line. Add a unit test in this file: symptom on unknown phone creates a patient, never a physio.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_languages_and_memory.py -v`

Expected: FAIL until provisioning + language persistence are wired

- [ ] **Step 3: Write minimal implementation**

If `resolve` is None and the message is not a physio/admin keyword, create patient + conversation. Persist `last_known_language` from `LLMResponse.language`. Do not ask “please choose English or Hausa”.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && pytest tests/test_languages_and_memory.py -v && pytest -v`

Expected: PASS (full suite green)

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_languages_and_memory.py backend/app/identity backend/app/conversation
git commit -m "feat: keep triage memory and language across five WhatsApp locales"
```
