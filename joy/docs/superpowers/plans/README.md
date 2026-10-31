# Joy AI plan index

Umbrella spec: [`../specs/2026-08-22-joy-ai-phase1-design.md`](../specs/2026-08-22-joy-ai-phase1-design.md)

Full Phase 1 is in scope (merged A). Implementation order is B. Do not start Plan N+1 until Plan N’s tests pass. Do not write application code until Vance says to execute a plan.

| # | Plan | Contract §4 slice |
|---|---|---|
| 1 | [2026-08-22-01-intelligence-core.md](./2026-08-22-01-intelligence-core.md) | Five-language batched MSK/non-MSK triage, deterministic red flags with caring (code-composed) copy, context persistence, WhatsApp, triage/safety audit |
| 2 | [2026-08-22-02-matching-and-booking.md](./2026-08-22-02-matching-and-booking.md) | Specialty matching (never MSK-default for non-MSK), Paystack, `confirmed` only from webhook |
| 3 | [2026-08-22-03-physio-whatsapp.md](./2026-08-22-03-physio-whatsapp.md) | Onboarding, availability, alerts, notes, check-in, payouts |
| 4 | [2026-08-22-04-family-access.md](./2026-08-22-04-family-access.md) | Direct-phone add/revoke, view-only vs full, relay, emergency notify |
| 5 | [2026-08-22-05-partner-referrals.md](./2026-08-22-05-partner-referrals.md) | Attribution, ₦2,000 first-session fee, urgent flag |
| 6 | [2026-08-22-06-admin-and-internal-apis.md](./2026-08-22-06-admin-and-internal-apis.md) | Escalations, verification, broadcasts, stats, queryable audit, internal APIs (no UIs) |

## Rules of the road

- One product tree (`docs/ARCHITECTURE.md`). Later plans fill reserved packages; they do not fork a second app.
- Plan 1 stubs `matching/` and `booking/` with `NotReadyError` / webhook-only confirm.
- Execute with superpowers:subagent-driven-development or executing-plans, one plan at a time.
