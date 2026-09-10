# RH integration with Joy

Phase 0, 9 September 2026. This specification describes planned integration, not deployed endpoints. RH remains on Vercel at `https://physioaroundme.com`; Convex remains its operational backend. Joy runs separately on Railway. Current RH implementation work is on `vance-ft`.

## Contract and responsibility

The canonical shared contract is version `1.0.0-draft` in the Joy-AI repository at `docs/JOY_RH_API_CONTRACT.md`; its decision record is `docs/JOY_RH_PHASE0_DECISIONS.md`. In this workspace, the contract is at `C:/Users/HP/Documents/Joy-AI/docs/JOY_RH_API_CONTRACT.md`. Consumers must pin/review the same contract revision before releases; do not silently maintain a divergent second schema.

RH owns identities, approved specialties, prices, real availability, allocations, bookings, appointments, payment attempts, verified payments, review appointments, authored clinician decisions, family grants and operational reports. Joy owns safety assessments, conversation, consent evidence and WhatsApp delivery. Clinical summaries reach RH only through authorized references or approved fields; RH does not mutate Joy safety state.

Expose versioned Next.js routes under `app/api/v1/joy`. Authenticate each with the contract's directional HMAC key, timestamp, replay protection and idempotency; resolve actor and record ownership for every operation. The Joy integration cannot depend on a Clerk browser session. Existing browser admin/user queries retain their own Clerk authorization.

### Phase 1 configuration

Set server-only RH variables in the Vercel environment: `JOY_RH_INBOUND_KEY_ID`,
`JOY_RH_INBOUND_HMAC_SECRET`, `CONVEX_JOY_GATEWAY_URL` and
`CONVEX_JOY_GATEWAY_SECRET`. Set the matching `CONVEX_JOY_GATEWAY_SECRET` only in
the Convex environment as well. Joy holds the corresponding outbound key ID and
secret, plus `RH_API_BASE_URL`. Never use `NEXT_PUBLIC_*` for any of these values.
Use separate values for preview/staging/production. Key rotation is a deliberate
overlap deployment, not an edit-in-place of a live shared secret.

The initial allowlist contains only request replay reservation, patient identity
resolution and physiotherapist identity resolution. It is not wired to an existing
browser route or WhatsApp handler yet. The request reservation table stores opaque
request IDs for ten minutes, while a separate five-minute bridge-nonce reservation
protects direct Convex requests. Neither stores clinical content; scheduled cleanup is
added with the operational job slice.

Next.js cannot directly invoke a private Convex function with the existing plain `ConvexHttpClient`. Introduce a server-only, allowlisted Convex HTTP gateway in `convex/http.ts`, authenticated separately from the public Joy boundary. It validates the forwarded actor and operation, then calls internal Convex queries/mutations/actions. Never ship a Convex administrative deployment key to Joy or expose a generic function-execution endpoint.

## Payment and appointment decisions

Only verified Paystack webhook evidence can set payment success. Commit that evidence and an outbox event together. A paid booking initially awaits provider response: Joy says “Payment received; awaiting physiotherapist acceptance.” RH confirms the appointment only after provider acceptance, valid safety/consent and allocation, then emits `booking.confirmed`. Provider acceptance alone cannot confirm payment. New symptoms can place an already-paid or confirmed booking on a safety hold while preserving the payment record.

Separate booking, payment, provider-response and appointment states according to contract v1. Do not use existing `confirmed` records as proof that a provider accepted: backfill only where evidence exists; preserve legacy provenance. Browser callbacks display durable state and cannot finalize bookings. Keep website and guest paths working through a coordinated migration; implement shared domain operations before removing old entry points.

## Existing function mapping

These are inspected reuse candidates, not assurances that present validation meets the contract.

- Patient resolution: `convex/users.ts` has `getMyUser`, `getUserByEmail`, `updateOrCreateUser`. These target Clerk/email identities and do not implement the required verified E.164 resolution. Add an internal phone mapping/provision operation with uniqueness and ambiguity handling; do not reuse guest email identity linking as authentication.
- PT resolution: users, physiotherapistProfiles and accountApprovalStatus records support verification checks. Add exact normalized phone resolution plus expiring capability sessions; no full profile on NO_MATCH/INELIGIBLE.
- Family: `convex/schema.ts` has `familyAccessGrants`, linked to user IDs rather than direct phone grants. Add verified phone-to-user mapping and grant operations, revocation and permission-filtered care payloads. No dedicated grant implementation was found in the inspected Convex files.
- Matching: `convex/marketplace/search.ts:searchPhysiotherapists` and `getPhysiotherapistProfile` supply provider data. Adapt an internal service query with hard specialty/region/mode eligibility and approved verification; do not expose raw profile records or rely on optional filters supplied by callers.
- Availability: prefer adapting `convex/calendar/availability.ts:getAvailableSlotsInternal` and `getAvailableSlotsWithGoogleCalendar`, with stored schedules, duration, time zone and atomic hold conflicts. `convex/appointments.ts:getAvailableTimeSlots` requires an existing patient relationship and fabricates 9–5 half-hour slots; it is not the new-patient integration endpoint.
- Booking: `convex/marketplace/booking.ts:createMarketplaceBooking` and `guestCreateMarketplaceBooking` create pending records. Extract a shared internal operation with authoritative RH price, validated quote/slot, current safety and consent, actor authorization, idempotency and immutable origin. Do not accept client serviceAmount as pricing authority.
- Payments: `app/api/payments/marketplace/route.ts` initializes checkout but lacks a durable attempt ledger at initialization. `convex/payments.ts:createPaymentRecord` is invoice-oriented. Add a booking-linked attempt ledger persisted before provider calls, immutable references and initialization outcome recovery.
- Finalization: `convex/marketplace/booking.ts:completeMarketplaceBooking` is a public mutation that marks paid/confirmed and creates downstream records. Replace with internal, replay-safe payment receipt and separate appointment finalization operations. Guard duplicate appointments/invoices/commission records; never fabricate tomorrow's slot. The replacement must be called only through authenticated event/domain paths.
- Payment mutation exposure: `convex/payments.ts:updatePaymentStatus` and `updatePatientBalance`, plus `app/api/payments/update-status/route.ts`, need internalization or authenticated restricted replacement. A caller-supplied status cannot establish successful payment. Audit all call sites before retiring them.
- Callbacks and webhook: `app/payment/callback/page.tsx` invokes marketplace completion and can display success despite completion failure. `app/api/payments/verify/route.ts` also has marketplace completion handling. Replace writes with durable status display/recovery. `app/api/webhooks/paystack/route.ts` needs explicit marketplace attempt routing, amount/currency checks, durable receipt/outbox and retry-safe error responses; its current invoice/badge handling is not sufficient.
- Reschedule/cancel: `convex/appointments.ts:rescheduleAppointment`, `cancelAppointmentAsPatient`, `requestAppointmentReschedule` and `convex/marketplace/booking.ts:cancelMarketplaceBooking` contain useful operations. Adapt actor, revision, policy, safety, price and allocation checks; do not call them as an arbitrary browser patient.
- Provider response and five-minute review: add explicit response state, review service, reviewer eligibility and append-only clinician outcomes. Do not equate `confirmAppointmentAsPatient` with provider acceptance.
- Availability writes: adapt `convex/calendar/availability.ts:updateAvailabilitySchedule`, `setDateOverride`, `removeDateOverride` after provider identity/confirmation and conflict validation.
- Notes/visits: adapt `convex/sessionLogs.ts:createSessionLog`, `updateSessionLog` and `convex/locationTracking.ts:pingLocation`, `stopTracking`. Add appointment ownership, allowed visit transitions, consent and precise location retention; do not expose broad live-location data.
- Admin: `convex/admin/marketplaceBookings.ts:adminGetAllMarketplaceBookings`, `adminReassignBookingPhysio`, and `convex/admin.ts:getMarketplaceTransactions`, `getPlatformRevenue` already enforce admin role. The transaction query reads invoices, so add independent attempt/payment reporting with source/state filters and real pagination. Existing UI remains the frontend owner's responsibility.

## RH records and delivery

Add identity mappings, service idempotency/replay records, holds/quotes, booking origin and independent states, payment attempts, verified event receipts, reviews/decisions and a durable outbox. Use Convex transactions for allocation, state and outbox atomicity. Signed RH events go to Joy's `/api/integrations/rh/events`; Joy invalidations arrive at `/api/v1/joy/safety/events`. Validate latest eligibility through Joy's authenticated eligibility endpoint. Retain failed deliveries and replay controls; never roll back financial evidence because notification delivery failed.

Derive `joy_ai`/`whatsapp` from authenticated service provenance; copy it through appointments, attempts, payments, rematches/refunds. Track an action's actor separately from original booking source. Mark uncertain historical origin UNKNOWN. Payment retries must not inflate revenue.

## Scope and release gates

Draft a versioned Consultation & Booking Policy at the user-authorized `/consultation-booking-policy` route, reviewed before production acceptance. Do not alter public legal policy from Gemini at runtime. Reconcile fee-policy/code inconsistencies before launch. Keep clinical sign-off, reviewer staffing, free-review handling, urgent response ownership and refund/rematch policy as explicit release gates. No doctor booking or exercise coaching is added by this specification.

First code slice: service authentication, allowlisted Convex gateway, health and minimal patient/provider data operations with contract/authorization tests. Deploy to an isolated preview using test Paystack and non-production Convex before production. No production deploy is part of Phase 0.
