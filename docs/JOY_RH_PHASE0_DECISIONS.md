# Phase 0 integration decisions

Recorded 9 September 2026. Implements architecture alignment and API contract definition only. The client's plan approval establishes direction; clinical release approval, legal policy approval and unresolved service operations remain separate.

## Decisions established

1. RH stays on Vercel at `https://physioaroundme.com`; Joy stays on Railway. No hosting/database migration is required.
2. RH owns operational Convex records; Joy PostgreSQL stores clinical/conversation state, consent, identity mappings, event inbox and audit. Redis is coordination, not durable clinical truth.
3. Gemini performs extraction and constrained response drafting. Joy's deterministic versioned rule engine owns safety, evaluated independently every triage turn and on new symptoms. RAG cannot grant clearance.
4. One open story question followed by grouped missing questions preserves existing architecture. Keep source evidence and individually traceable safety answers. Targeted clarification of an actual ambiguity is permitted; do not turn the protocol into a repetitive checklist.
5. RH verifies Paystack webhooks and owns payment success. Provider acceptance is independent. Final appointment confirmation requires both, plus current safety, consent and allocation. Signed RH events are the only source of confirmation in Joy. This clarifies the contract's webhook requirement; it does not permit confirmation without verified payment evidence.
6. Five-minute AMBER review is a separate service; ORANGE and RED cannot use it as a substitute for medical/emergency guidance. Clinician outcomes are signed evidence that Joy evaluates against the current assessment, not direct edits to safety state.
7. Dedicated HMAC-authenticated service APIs and a narrow authenticated Convex HTTP gateway separate Joy from browser Clerk sessions and private internal functions. Contract v1 is in `docs/JOY_RH_API_CONTRACT.md`.
8. Preserve immutable Joy WhatsApp origin from booking through payment/refund; track later actors separately.
9. Use direct patient-initiated phone registration for family grants, view-only by default. `PT` resolves an existing verified provider; it creates no provider account.
10. Patient-initiated physio changes create an approval request by default. RH policy decides rematching and financial resolution.
11. Draft the Consultation & Booking Policy in RH during development; activate only an approved version. The user expressly authorized this policy page; this does not authorize new admin/dashboard UI.
12. Exercise prescription, coaching, adherence tracking and doctor appointment booking are outside this delivery. Existing exercise data in RH is not removed. Do not advertise these capabilities in active Joy prompt guidance.

## Open release decisions

- Clinical lead: rule thresholds, partial answer combinations, multilingual wording, reviewed non-MSK protocols, clearance lifetime, authorized reviewer qualifications and authority.
- Operations owner: reviewer staffing, mode, response deadline, unavailable/no-show fallback, urgent-alert recipients and acknowledgement handling.
- Client policy owner: review price, free-review event lifecycle (if free), cancellation/hold expiry, provider rejection, refund and rematch terms. Never simulate a free payment.
- Deployment owner: activate proposed Joy custom domain, install separate service keys, choose staging domains and non-production Convex/Paystack resources.
- Reconcile actual fee calculations with published RH policy before quoting production prices. Local booking fee code and current published no-platform-fee wording differ.

These decisions do not block development of authenticated read-only endpoints, typed clients and contract tests. They block activation of the dependent clinical/payment services. No new client confirmation is requested for already agreed defaults.

## Next execution slice

Build RH service authentication, the allowlisted Convex gateway, health and minimal patient/provider reads, with authorization and replay tests. Patient provisioning remains an explicit idempotent write. Then implement Joy's typed RH client and mapping records. Keep web booking paths operational during the later coordinated payment-hardening migration.
