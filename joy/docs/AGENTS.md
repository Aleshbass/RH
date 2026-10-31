# AGENTS.md — Working guide for AI coding agents on this repo

Drop this in the repo root (or `.cursor/rules/`) so any agent working in Cursor has the same
constraints you do. Point it at `docs/ARCHITECTURE.md` and `docs/joy-system-prompt.md`
for the detailed design; this file is the operating rules layer.

## What this project is

Joy — Rehabify's AI assistant, backend + AI/conversational engineering + infrastructure only.
Client: Ademola Abass (Rehabify / physioaroundme.com). Developer: Evans Agina. Fixed-scope
contract, ₦400,000, delivery due 21 August 2026.

## Hard scope boundary — do not build these

Per the contract, these are explicitly **out of scope** and belong to a separate frontend
developer:
- Physiotherapist profile & credentials dashboard (web)
- Admin Retool panel UI
- Partner web portal
- Patient/family web receipt links
- Conversation-takeover UI
- HMO pre-authorisation export (format not yet confirmed)
- Layer 3 (Exercise Prescription & Tracking)
- Voice-to-Text / Computer Vision add-ons beyond what's already scoped

If a task looks like it's building UI, or one of the above, stop and flag it rather than building
it — it's billable as a change request, not part of this delivery.

What this backend **does** owe the frontend team: clean, documented APIs and data it can consume
for all of the above. Build those endpoints even though you're not building what calls them.

## Non-negotiable architectural rules

Integration target: read `docs/JOY_RH_API_CONTRACT.md` and
`docs/JOY_RH_PHASE0_DECISIONS.md`. RH owns providers, availability, bookings,
appointments and payments in Convex; Joy owns conversation and clinical state in Postgres.
RH alone verifies Paystack payment webhooks. Payment evidence is necessary, not sufficient:
final confirmation also requires provider acceptance, current safety, consent and allocation.
Joy reflects signed RH events; neither Gemini nor the conversation handler confirms bookings.
Use versioned deterministic protocols with traceable answers and grouped missing questions.
These are integration clarifications, not permission to override the contract or clinical review.

1. **Red-flag detection is deterministic, not an LLM call.** It lives in `safety/` and runs
   independently every triage turn. Never implement it as a prompt instruction or a tool the model
   chooses to invoke. Its output overrides anything the LLM said, always.
2. **Booking status advances only on confirmed webhook events** (Paystack payment, not what the
   model believes happened). Never write a "confirmed" status from inside the conversation
   handler — only from the webhook handler.
3. **Persona/identity is resolved before any business logic runs**, and permissions are enforced
   in code (`identity/permissions.py`), not by trusting the prompt to behave.
4. **Every triage, match, and payout decision is written to an append-only audit log**,
   independently queryable — this is a literal acceptance criterion (Contract §4), not a nice-to-have.
5. **Context persists across sessions and personas.** A returning patient/physio/family member is
   never re-asked something already on record. Cross-persona relays (family↔physio, physio↔admin)
   must carry context without manual handoff.
6. **Triage question discipline**: one open question first, mine it for every extractable data
   point, batch whatever's left into one grouped follow-up. Never a one-at-a-time checklist — this
   is the specific bug in v1 and it's a hard requirement, not a style preference.

## Definition of Done (from Contract §4 — use this as your actual acceptance checklist)

- [ ] Patient completes MSK and non-MSK triage end-to-end, in all five languages, with correct
      specialty-based physio matching (never defaults to nearest MSK generalist)
- [ ] Red-flag detection fires immediately, independent of the LLM, reasoning shown to patient
- [ ] Booking status only advances on confirmed Paystack webhook events
- [ ] Physio onboarding, availability, booking alerts, session notes, payouts — all via WhatsApp
- [ ] Family add/permission/revoke and physio-relay questions work via WhatsApp
- [ ] Partner referral tracking and fee confirmation fire correctly via webhook/WhatsApp
- [ ] Every triage/match/payout decision is in the append-only audit log, independently queryable
- [ ] Context persists correctly across sessions and personas — nothing is re-asked

## Open decisions — current defaults if you're not told otherwise

- **Patient-family access mechanism**: undecided in the PRD (direct phone registration vs.
  one-time redeemable code). Per the contract, if the client hasn't confirmed by end of Week 1,
  **implement direct phone registration** to protect the timeline. Check with Vance before
  building the code-redemption path — it's not the contractual default.
- **Physio availability input**: free-text parsing is the PRD's implied approach (faster to build)
  over a structured slot picker, but it's flagged as an open question with a double-booking risk.
  Build free-text parsing but write `availability.py` so a structured picker can replace the
  parser later without touching the calendar-writing logic downstream.
- **Admin conversation takeover visibility**: PRD recommends telling the patient a human has
  stepped in. Build it visible by default.

## Stack notes

- LLM: Gemini API (Live API for voice/multilingual turns, text API for structured extraction).
  No fine-tuning in this phase — clinical grounding via RAG + a maintained clinical glossary.
- Data layer: Postgres (per your existing docker-compose setup — `casha-db`-style container,
  adapt naming for this project). Queue: Redis or RabbitMQ for webhook-triggered async work.
- WhatsApp Business API for all inbound/outbound; webhooks are the source of truth for payment
  and message delivery state, never polled.

## When you're unsure

If a requirement in a ticket conflicts with `docs/ARCHITECTURE.md`, the PRD, or the contract,
architecture and contract win — flag the conflict rather than silently picking one.
