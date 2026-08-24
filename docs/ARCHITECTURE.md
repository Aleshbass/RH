# Joy — Backend Architecture & File Structure

Source of truth: `Joy — PRD & Capability Matrix` (Parts A/B/C) + the Rehabify–Evans Agina
Software Development Agreement (3 Aug 2026). This document translates both into a concrete
backend layout your Cursor agent can build against.

Contract scope reminder: **backend, AI/conversational engineering, and infrastructure only.**
No frontend/web UI. Web-facing surfaces (physio dashboard, Admin Retool panel, partner portal,
receipt links) are someone else's job — this backend only needs to expose the APIs/data they'll
consume.

Stack assumption, based on your v1 (Python) and your existing FastAPI-backend repo: **Python +
FastAPI**, Postgres as the primary data layer, Redis or RabbitMQ for queuing webhook-driven
work, Gemini API (Live API for voice/multilingual, text API for structured turns) as the LLM.
If your actual repo is Node/TypeScript instead, the module boundaries below map 1:1 — just swap
the file extensions and framework-specific glue.

---

## 1. Why this shape

Three requirements from the PRD drive the whole structure, more than any individual feature:

1. **The red-flag safety layer must be deterministic and separate from the LLM** (PRD §6, §Safety
   Rules). This is not a prompt instruction — it's a code path the LLM cannot talk its way around.
   It lives in its own module (`safety/`) and is called *alongside* the conversation, not as a tool
   the model chooses to invoke.
2. **Joy is identity-aware and persona-routed** (PRD "Identity & Routing"). Every inbound message
   resolves to exactly one of five personas before any business logic runs. This routing decision
   is infrastructure, not a prompt — it's what decides which prompt fragments, which DB rows, and
   which permissions apply.
3. **Booking state only advances on confirmed webhook events**, never on what the LLM says
   happened (PRD §6, Contract §4). Paystack and WhatsApp webhooks are the actual source of truth;
   the conversation layer reflects that state, it doesn't set it.

Everything else — triage, matching, physio backend, family access, partner referrals, admin — is
a fairly direct translation of Part B of the PRD into modules.

---

## 2. File tree

```
backend/
├── app/
│   ├── main.py                      # FastAPI app entrypoint, router registration
│   ├── config.py                    # env vars, settings (Gemini key, Paystack key, WA token, DB url)
│   │
│   ├── api/                         # HTTP boundary — thin, no business logic
│   │   ├── webhooks/
│   │   │   ├── whatsapp.py          # inbound WA message webhook (verify + enqueue)
│   │   │   └── paystack.py          # payment webhook (verify signature, confirm booking)
│   │   ├── internal/                # endpoints the (separate) frontend team will call
│   │   │   ├── physio_profile.py    # read/write for physio dashboard (credentials, bio, pricing)
│   │   │   ├── admin_panel.py       # Retool-facing: audit log queries, verification queue, stats
│   │   │   ├── partner_portal.py    # partner-facing: referral stats, compliance export
│   │   │   └── receipts.py          # patient/family receipt + statement generation
│   │   └── health.py                # liveness/readiness
│   │
│   ├── identity/                    # PRD: "Identity & Routing" — resolve sender BEFORE anything else
│   │   ├── resolver.py              # phone number -> persona (patient/physio/family/admin/partner)
│   │   ├── permissions.py           # what persona X may see/do; family view-only vs full access
│   │   └── unknown_sender.py        # first-contact flow when persona isn't yet on record
│   │
│   ├── conversation/                # the actual chat loop, per persona
│   │   ├── state_manager.py         # per-conversation context across turns AND across language switches
│   │   ├── language.py              # language detection/mirroring (EN/Pidgin/Yoruba/Igbo/Hausa)
│   │   ├── orchestrator.py          # decides: still listening? triage? handoff to admin? etc.
│   │   ├── turn_handler.py          # single turn: build context -> call Gemini -> parse -> act
│   │   └── voice.py                 # voice-note ingestion via Gemini Live API
│   │
│   ├── safety/                      # DETERMINISTIC — no LLM calls in this module, ever
│   │   ├── red_flag_rules.py        # rule definitions (symptom combos, comorbidities, etc.)
│   │   ├── evaluator.py             # runs rules against extracted structured data every turn
│   │   └── escalation.py            # what happens when a rule fires — always independent of LLM output
│   │
│   ├── triage/
│   │   ├── extraction.py            # pulls structured fields out of the patient's free-text/voice answer
│   │   ├── question_batching.py     # PRD "low-friction triage": one open question, then ONE batched follow-up
│   │   ├── msk.py                   # MSK-specific triage logic
│   │   ├── non_msk.py               # neuro / paeds / cardiorespiratory / women's health / post-surgical
│   │   └── summary.py               # plain-language recap + confirm-or-correct step
│   │
│   ├── matching/
│   │   ├── specialty_match.py       # never default to nearest MSK generalist for a non-MSK case
│   │   └── ranking.py               # specialty + location + price + availability + rating
│   │
│   ├── booking/
│   │   ├── booking_flow.py          # teleconsult vs home visit, slot selection
│   │   ├── paystack_client.py       # initialize/verify payment
│   │   └── state.py                 # booking status machine — ONLY advances on webhook confirmation
│   │
│   ├── physio/
│   │   ├── onboarding.py            # MRTB number, credential capture, specialty tags, 48hr SLA timer
│   │   ├── availability.py          # free-text parsing ("free Mon-Fri 9-5") -> calendar
│   │   ├── booking_alerts.py        # instant new-booking push + accept/decline
│   │   ├── session_notes.py         # voice note -> structured shareable note
│   │   ├── home_visit_checkin.py    # live location on arrival + "done" message, timestamped
│   │   └── payouts.py               # withdrawal requests, transfer trigger, earnings statements
│   │
│   ├── family/
│   │   ├── access.py                # add/revoke; direct-phone-registration (contract default) for now
│   │   ├── permissions.py           # view-only vs full-access enforcement
│   │   └── relay.py                 # family <-> physio question relay without exposing direct contact
│   │
│   ├── partner/
│   │   ├── referral.py              # link/attribution tracking, direct referral intake
│   │   ├── fee_confirmation.py      # flat ₦2,000 first-session fee, auto-confirmed
│   │   └── urgent_flag.py
│   │
│   ├── admin/
│   │   ├── escalation_router.py     # red flags / disputes / off-platform-activity -> admin, real-time
│   │   ├── verification_queue.py    # quick-reply approve/reject + handoff to full web review
│   │   ├── broadcast.py             # segmented broadcast sends
│   │   └── stats_digest.py          # scheduled bookings/revenue/active-physio summary
│   │
│   ├── audit/
│   │   └── logger.py                # append-only writer — every triage/match/payout decision, independently queryable
│   │
│   ├── llm/
│   │   ├── gemini_client.py         # thin wrapper: text + Live API (voice) calls
│   │   ├── prompt_builder.py        # CONTEXT ENGINEERING lives here — assembles the right prompt
│   │   │                            # fragments for persona + conversation phase (see prompts/ below)
│   │   └── rag/
│   │       ├── retriever.py         # pulls relevant clinical glossary / specialty docs into context
│   │       └── knowledge_base/      # physio specialty definitions, clinical glossary, red-flag reference
│   │
│   ├── models/                      # DB schema (SQLAlchemy or equivalent)
│   │   ├── patient.py
│   │   ├── physiotherapist.py
│   │   ├── family_member.py
│   │   ├── admin.py
│   │   ├── partner.py
│   │   ├── conversation.py
│   │   ├── triage_session.py
│   │   ├── booking.py
│   │   ├── payout.py
│   │   └── audit_log.py
│   │
│   └── queue/
│       ├── tasks.py                 # webhook-triggered async jobs (payment confirm, WA send retries)
│       └── worker.py
│
├── prompts/                         # plain-text/markdown prompt fragments, NOT hardcoded in Python
│   ├── base_identity.md             # who Joy is, the five personas, routing rule
│   ├── tone_and_format.md           # WhatsApp-native tone, emoji discipline, language mirroring
│   ├── empathy.md                   # genuine care every turn; never un-fires safety
│   ├── triage_discipline.md         # the exact fix for "fires questions immediately" — see prompts doc
│   ├── safety_interface.md          # how the LLM should treat the deterministic safety layer's output
│   ├── patient.md
│   ├── physiotherapist.md
│   ├── family.md
│   ├── admin.md
│   └── partner.md
│
├── tests/
│   ├── test_safety_rules.py         # red-flag rules must be tested independently of any LLM
│   ├── test_triage_batching.py
│   ├── test_booking_state_machine.py
│   └── test_identity_routing.py
│
├── scripts/
│   ├── migrate.py
│   └── seed_dev_data.py
│
├── docs/                            # this file, the prompt doc, and AGENTS.md live here in-repo
└── docker-compose.yml               # Postgres + Redis/RabbitMQ, matches your existing WSL setup
```

---

## 3. Data flow for one patient turn (the thing that's currently broken)

This is the sequence that fixes both problems you flagged — bot-like triage and language
switching:

1. **WhatsApp webhook** receives the message (text or voice) → enqueued, ack'd immediately.
2. **`identity/resolver.py`** resolves the sender to `patient` (or asks the one clarifying
   question if unknown).
3. **`conversation/state_manager.py`** loads prior context for this patient — including which
   language they were last using. Nothing is re-asked (Contract §4 Definition of Done).
4. **`conversation/orchestrator.py`** decides the conversation phase: first contact, mid-triage,
   post-triage. This decision — not the LLM — determines which prompt fragments load.
5. **`llm/prompt_builder.py`** assembles: `base_identity` + `tone_and_format` + `empathy` +
   `triage_discipline` + `patient` + retrieved RAG context, and injects the state manager's
   running context (including language).
6. **`llm/gemini_client.py`** calls Gemini (Live API if voice) — this is where the natural,
   code-switch-aware, non-checklist response comes from.
7. **`triage/extraction.py`** pulls structured fields out of whatever the model understood.
8. **`safety/evaluator.py`** runs the deterministic rules against those structured fields —
   independently, every turn, regardless of what the LLM said. If a rule fires, escalation wins,
   full stop. The patient-facing text is composed in `escalation.py` (care, then reason, then
   see-a-doctor) — do not re-prompt the LLM to soften the decision.
9. **`triage/question_batching.py`** checks what's still missing and, if anything is, batches it
   into one grouped question for the *next* turn — never fired mid-turn, never one at a time.
10. **`audit/logger.py`** writes the turn's decision (triage progress, safety check result) to the
    append-only log.

The bot-like feeling in v1 almost certainly came from skipping steps 4–5 and step 9 — i.e., every
turn used the same flat prompt and asked whatever was next on a checklist instead of batching.
That's the specific thing this structure is designed to prevent.
