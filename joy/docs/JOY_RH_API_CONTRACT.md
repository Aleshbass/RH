# Joy and RH integration contract

Version: 1.0.0-draft. Established 9 September 2026 in Phase 0. This contract specifies future behavior; no endpoint is represented as deployed. Joy maintains the canonical copy. RH's `docs/JOY_INTEGRATION_ARCHITECTURE.md` references this version; changes must be reviewed in both repositories before either implementation ships.

## Ownership and deployment

Joy runs on Railway and owns WhatsApp delivery, authenticated persona resolution, conversation state, clinical evidence, deterministic safety, consent evidence and its append-only audit. Gemini extracts facts and drafts permitted responses; it cannot authorize actions. RAG supplies approved explanatory context, never permissions or safety decisions.

RH remains on Vercel at `https://physioaroundme.com` and owns Convex operational records: identities, providers, availability, prices, bookings, payments, appointments, reviews, family grants and operational reporting. Proposed Joy public origin: `https://joy-api.physioaroundme.com`, pending DNS setup. Next.js routes use `/api/v1/joy`; RH events use Joy's `/api/integrations/rh/events`. Use environment-specific origins and secrets; a preview must never write production Convex or initialize live payments.

## Transport and service authentication

Use HTTPS and HMAC-SHA256 with independent keys for Joy-to-RH and RH-to-Joy. Configure active and retiring key IDs per environment; rotation accepts both only during an explicit overlap. No API requires a Clerk browser session or a secret exposed as `NEXT_PUBLIC_*`.

Required headers: `X-Joy-Api-Version: 1`, `X-Key-Id`, `X-Timestamp` (Unix seconds), `X-Request-Id` (UUID), `X-Signature` (lowercase hex HMAC); JSON requests use `Content-Type: application/json`. Mutations also require `Idempotency-Key`. Cap bodies at 256 KiB; reject oversized payloads before processing. Media is represented by an authorized reference, never embedded in this contract.

Sign UTF-8 bytes of these newline-separated fields with no trailing newline:

```text
UPPERCASE_HTTP_METHOD
path-and-query
X-Timestamp
X-Request-Id
Idempotency-Key-or-empty-string
X-Actor-Context-or-empty-string
lowercase-hex-SHA256-of-exact-raw-body
```

The path-and-query is the exact transmitted request target, excluding origin; do not reorder query parameters or reserialize the body after signing. GET has an empty body. Validate key ID, version, signature and timestamp within 300 seconds before parsing business fields; compare signatures in constant time. Reserve request IDs atomically for at least 10 minutes. Each retry uses a new request ID/timestamp/signature but the same business idempotency key. Unsigned, reused-request-ID or expired requests have no business effect. Authenticate events by this same method with the separate RH-to-Joy key. TLS authenticates response transport.

Service authentication permits access to a route, not arbitrary patient records. Every non-health/policy call carries an actor object: `persona`, normalized `sender_phone`, `rh_user_id` when resolved, and `persona_session_id` when required. Resolution routes establish the RH identity and may omit `rh_user_id`. RH validates the binding and applicable active grant, provider assignment or admin role per operation. `PT` and a supplied phone alone never grant authority; only Joy's verified Meta sender context can start resolution. Scope service credentials to explicit capabilities. Do not log credentials, raw clinical bodies or family phone URLs.

### RH to Convex boundary

For GET requests, carry the actor in `X-Actor-Context` as base64url-encoded compact JSON,
included verbatim in the signature above; never put actor phones in URL query strings.
For JSON writes, use the body actor and leave this header empty. Reject conflicting actor
locations. Gateway service events use their authenticated service actor rather than pretending
to originate from a WhatsApp user. Do not log the actor header.

A plain `ConvexHttpClient` cannot call an `internalMutation` directly. Add a narrow authenticated Convex HTTP action gateway registered in `convex/http.ts` for RH server use. RH signs gateway requests with a third, server-only key; the gateway validates authentication, replay and the actor scope, then dispatches an allowlisted operation to `ctx.runQuery`, `ctx.runMutation` or `ctx.runAction` for internal functions. Never accept arbitrary Convex function names. This is a planned implementation boundary, not reuse of the existing unauthenticated singleton client as an authorization mechanism. Keep browser Clerk functions for existing users, but route them through the same domain validations where behavior is shared.

## Common data and responses

IDs are opaque nonempty strings, phone numbers are E.164, currency is `NGN`, money is nonnegative integer kobo, and times are RFC3339 UTC strings. Slot requests include `time_zone: Africa/Lagos` by default. Convert Convex millisecond dates and any existing naira prices in RH adapters. Reject unknown write fields and invalid enums. Return no raw Convex documents. Paginated lists use `limit` (1–100; default 25) and an opaque `cursor`; return `items` and `next_cursor`.

Success envelope: `{ "request_id": "...", "data": { ... } }`. Errors: `{ "request_id": "...", "error": { "code": "...", "message": "...", "retryable": false } }`. No traces or clinical text in errors. Use 200 for reads/replayed completed writes, 201 for created records, 202 for durable in-progress work; a replay returns the original saved status and result. Lists may validly be empty.

Stable errors: 400 `INVALID_REQUEST`; 401 `UNAUTHENTICATED`, `SIGNATURE_EXPIRED`, `REPLAY_DETECTED`; 403 `FORBIDDEN`, `SAFETY_NOT_ELIGIBLE`, `POLICY_NOT_ACCEPTED`; 404 `NOT_FOUND` (also conceals inaccessible records); 409 `IDEMPOTENCY_CONFLICT`, `SLOT_UNAVAILABLE`, `STALE_ASSESSMENT`, `INVALID_TRANSITION`; 422 `UNSUPPORTED_SERVICE`; 429 `RATE_LIMITED`; 503 `DEPENDENCY_UNAVAILABLE`. Only transport errors, 429 and transient 503 are automatically retried, with bounded backoff, jitter and `Retry-After` where provided.

Persist idempotency by environment + authenticated service + route + actor + key, with a request-body hash and result. Same key/different body returns 409. Concurrent identical writes create one operation; an unfinished replay returns its operation ID. Keep business idempotency records at least 30 days and financial reference/event uniqueness for the financial record's retention lifetime. A timeout is an unknown result, not evidence to create another payment. Reconcile the existing reference before allowing a fresh attempt.

## Core endpoint contract

Every listed payload uses the envelope and actor rules above. Listed inputs are required unless explicitly optional; server-generated output fields must not be accepted as write authority.

### Foundation and identity

- `GET /health`: returns `status`, `api_version`, `service`; authenticated connectivity check with no credentials or infrastructure details.
- `POST /patients/resolve`: `phone`, `joy_person_id`, optional `name`, `email`; returns `resolution` (`EXISTING`, `NOT_FOUND`, `CREATED`, `AMBIGUOUS`), and `patient_id` only when uniquely resolved. Phase 1 implements read-only `EXISTING`/`NOT_FOUND`/`AMBIGUOUS`; `CREATED` is reserved for the later explicit provisioning write. Patient provisioning is idempotent by verified phone; never merge users by unverified email or give a new user an admin/provider role. Ambiguous mappings block dependent work.
- `POST /physiotherapists/resolve`: `phone`; returns `resolution` (`MATCH`, `NO_MATCH`, `INELIGIBLE`), and for MATCH only `physiotherapist_id`, `display_name`, `capabilities`, `persona_session_id`, `expires_at`. Session default is 30 minutes, with authorization rechecked on every operation. No auto-provisioning or private profile enumeration.
- `POST /family/resolve`: `phone`; returns active permitted `grants` with `grant_id`, `patient_id`, `patient_display_name`, `permissions`, `expires_at` (nullable). No active grant yields an empty list. Recheck on every disclosure.
- `GET /policy/current`: optional `service_type` and `language`; returns `policy_id`, `version`, `url`, `content_sha256`, `effective_at`, `acceptance_text`, `language`, `approval_status`. No approved active policy means the booking gate stays closed. Joy persists the exact version, content hash, presentation/acceptance timestamps, actor and source message IDs. The planned page is `/consultation-booking-policy` on RH, not an already deployed page.

### Matching and booking

- `POST /matches`: `patient_id`, `assessment_id`, `assessment_revision`, `required_specialties`, `service_type`, `service_mode`, `location`; optional `time_preference`, `max_price_kobo`. Returns up to three `providers` containing `physiotherapist_id`, `display_name`, verified `specialties`, available `service_modes` and factual `match_reasons`. Specialty and geographic service eligibility are hard filters before ranking.
- `GET /physiotherapists/{id}/availability`: `from`, `to`, `duration_minutes`, `service_type`, `service_mode`, `time_zone`; returns real `slots` with `slot_id`, `starts_at`, `ends_at`, `quote_id`, `quote_expires_at`, `amount_kobo`, `currency`, `fee_breakdown`. Do not fabricate working hours or ignore calendar conflicts.
- `POST /bookings`: `patient_id`, `physiotherapist_id`, `slot_id`, `quote_id`, `service_type`, `service_mode`, `assessment_id`, `assessment_revision`, `consent_reference`, `summary_reference`, `origin`; home visits also require confirmed `patient_address`. Return `booking_id`, `booking_status`, `payment_status`, `provider_response`, `hold_expires_at`, authoritative `amount_kobo`, `currency`. Revalidate quote, eligibility and conflicts atomically with the hold. Proposed technical hold default is 15 minutes and must be displayed from RH's returned expiry, never invented by Joy.
- `POST /bookings/{id}/payment`: `booking_id` from path and optional approved payment-method preference; RH loads price and recipient from the booking. Returns `payment_attempt_id`, `reference`, `authorization_url`, `payment_status`, `hold_expires_at`. Save the attempt before Paystack initialization; use its immutable reference for recovery. A fresh attempt requires prior attempt resolution or explicit retry, not an automatic new reference on timeout.
- `GET /bookings/{id}`: returns the four independent states, `revision`, `last_event_id`, appointment/slot details, attribution and pending resolution. Reading status must not mark a payment successful or synthesize a missed event.
- `PATCH /bookings/{id}`: `expected_revision`, replacement `slot_id`, `quote_id`, `consent_reference`, current assessment reference and optional reason. Revalidate conflicts, safety, authorization and any additional charge before rescheduling.
- `POST /bookings/{id}/cancel`: `expected_revision`, `reason`; returns cancellation and financial-resolution states under the approved policy. Cancellation never erases payment evidence or implicitly promises a refund.
- `POST /bookings/{id}/respond`: assigned provider actor, `expected_revision`, `response` (`ACCEPT` or `REJECT`), optional reason; returns current states. RH authorizes against the assigned provider and rejects stale assignments.
- `POST /bookings/{id}/change-physio-request`: authorized patient/delegate actor, `reason`, `expected_revision`; returns `request_id`, `status: PENDING_APPROVAL`. Approval-based handling is the default; reassigning never overwrites original payment attribution.

### Safety eligibility and review

RH calls `POST https://joy-api.physioaroundme.com/api/integrations/rh/safety/eligibility`, authenticated with its RH-to-Joy key. Input: `patient_id`, `assessment_id`, `assessment_revision`, `service_type`, `consent_reference`, optional `clinician_review_id`. Output: `eligible`, `decision_reference`, `safety_status`, `reason_code`, `assessment_revision`, `protocol_version`, `policy_valid`, `issued_at`, `expires_at`. Eligibility expires after at most 60 seconds and immediately when superseded. RH binds it to the same patient/service/revision, checks again before finalization, and consumes invalidation events. Unavailable or incomplete assessment fails closed; extraction confidence alone cannot grant eligibility.

GREEN permits a routine service after required checks. AMBER permits only `SPECIALIST_TRIAGE_REVIEW`. ORANGE and RED permit neither. `UNKNOWN` is internal assessment progress, not clearance. Evaluate general plus region rules every triage turn with `YES`, `NO`, `UNCLEAR`, `UNANSWERED` and severity precedence RED > ORANGE > AMBER > GREEN. New symptoms trigger a new immutable revision, supersede clearance and require reassessment even after payment or booking.

- `GET /specialist-reviews/availability`: same slot contract, fixed `duration_minutes: 5`, approved reviewer specialty and mode.
- `POST /specialist-reviews`: same booking contract with `service_type: SPECIALIST_TRIAGE_REVIEW` and AMBER eligibility; returns `review_id`, linked `booking_id` when paid, lifecycle and quote. Requires explicit review-policy acceptance. A no-reviewer result offers only approved fallback guidance.
- `GET /specialist-reviews/{id}`: authorized review lifecycle, associated assessment and recorded outcome.
- `POST /specialist-reviews/{id}/outcomes`: assigned reviewer, `expected_revision`, reviewed assessment ID/revision, `outcome`, `reasoning`; append `decision_id`, clinician identity, authorization evidence and timestamp. Outcomes: `PROCEED_TO_MSK_PATHWAY`, `BOOK_STANDARD_CONSULTATION`, `MEDICAL_REVIEW`, `URGENT_ESCALATION`. Corrections use `supersedes_decision_id`. Joy evaluates authenticated clinician evidence against current symptoms; RH cannot directly overwrite Joy safety state.

Paid reviews follow the payment rules below. Free-review confirmation, reviewer staffing/hours, clinical thresholds, escalation recipients and response deadlines require client decisions before their production paths activate. Emergency guidance is immediate and never waits for consent, payment, a reviewer, or an LLM.

## Payment and appointment state model

Store independent `safety_status`, `consent_reference`, `payment_status`, `provider_response`, `booking_status`, `appointment_status`. Payment states: `NOT_STARTED`, `INITIALIZING`, `PENDING`, `SUCCEEDED`, `FAILED`, `REFUND_PENDING`, `REFUNDED`. Provider states: `NOT_REQUESTED`, `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`. Booking states: `HELD`, `AWAITING_PAYMENT`, `AWAITING_PROVIDER`, `CONFIRMED`, `SAFETY_HOLD`, `RESOLUTION_REQUIRED`, `EXPIRED`, `CANCELLED`, `COMPLETED`. Appointment states: `NOT_CREATED`, `PENDING_PROVIDER`, `CONFIRMED`, `ON_HOLD`, `CANCELLED`, `COMPLETED`.

1. A valid hold/initialization produces HELD/AWAITING_PAYMENT. Joy says the slot is temporarily reserved only after RH returns a hold.
2. Only RH's verified Paystack webhook may establish `payment_status: SUCCEEDED`. Verify raw-body signature, immutable reference, provider transaction ID, amount and currency; commit once. Keep verified receipt evidence even if a slot expired or safety changed.
3. With valid current safety/consent/slot, payment receipt moves booking to AWAITING_PROVIDER and emits `booking.payment_confirmed` and `booking.provider_response_requested`. Joy says “Payment received; awaiting physiotherapist acceptance.”
4. An authorized provider acceptance is recorded in RH. RH confirms only when SUCCEEDED payment evidence, ACCEPTED provider, current safety, consent and allocation all hold. Commit `booking.confirmed` in the same transaction/outbox operation. Joy says “Appointment confirmed” only on this signed event. Thus payment webhook evidence is necessary, but payment alone is not sufficient. Joy never writes confirmation.
5. Rejection/expiry leaves payment success intact and enters RESOLUTION_REQUIRED with an approved rematch/refund workflow. Do not promise automatic credit/refund or reuse a slot without validation.
6. New safety evidence invalidates eligibility. Payment received during a safety hold does not confirm an appointment. A confirmed appointment enters ON_HOLD pending the approved clinical handling; retain financial history. Recheck revisions and allocation when progressing again.

Browser redirects and “I have paid” messages cannot finalize payment. A reference lookup used for recovery is read-only; a missing webhook must be replayed through the verified event path, not replaced by a conversation-side confirmation. Do not poll Paystack for normal payment or delivery progression. Retire existing public mutations and callback completion only through a coordinated RH release that preserves other website booking paths.

## Events and reliable delivery

RH writes each domain change and an outbox record atomically in Convex. Publish after commit. Joy authenticates and persists an inbox event before acknowledging; background processing performs side effects. Return 200 for already durably received event IDs. Transient inability to persist returns 503 so delivery retries. Never acknowledge a lost event as processed.

Envelope:

```json
{
  "event_id": "evt_opaque",
  "event_type": "booking.payment_confirmed",
  "api_version": "1",
  "occurred_at": "2026-09-09T12:00:00Z",
  "aggregate_type": "booking",
  "aggregate_id": "booking_opaque",
  "aggregate_revision": 3,
  "correlation_id": "request_opaque",
  "data": {
    "patient_id": "patient_opaque",
    "payment_attempt_id": "attempt_opaque",
    "payment_status": "SUCCEEDED",
    "booking_status": "AWAITING_PROVIDER",
    "provider_response": "PENDING",
    "source_system": "joy_ai",
    "source_channel": "whatsapp"
  }
}
```

Events: `booking.payment_confirmed`, `booking.provider_response_requested`, `booking.provider_accepted`, `booking.provider_rejected`, `booking.confirmed`, `booking.cancelled`, `booking.rescheduled`, `booking.safety_hold`, `payment.initialization_failed`, `payment.failed`, `payment.refund_updated`, `specialist_review.requested`, `specialist_review.scheduled`, `specialist_review.completed`, `specialist_review.cancelled`, `family.access_changed`, `patient.message_available`. Payloads carry aggregate IDs/revision and new states; completed reviews additionally carry clinician decision ID and reviewed assessment revision; access changes carry grant ID/status; messages carry an authorized message reference, never unrestricted notes.

Joy sends `safety.assessment_superseded` to proposed RH `POST /api/v1/joy/safety/events` using the Joy-to-RH credentials and the same envelope. Carry patient ID, old/new assessment revision and decision reference. RH invalidates pending progression and checks the current eligibility endpoint. Prevent cross-service races by serializing progression per booking, comparing assessment revisions, and applying any later invalidation to a committed booking as SAFETY_HOLD; do not imply cross-database atomicity.

Deduplicate by event ID and deduplicate outbound messages by event ID + recipient + message purpose. Events for the same aggregate have monotonically increasing revisions. Keep every receipt for audit, but never regress state on late events; replay missing revisions from the sender's durable outbox using an authorized recovery operation. Suggested retries: 5s, 30s, 2m, 10m, 30m, then hourly up to 24h, followed by a dead-letter alert and controlled replay. Critical guidance is never delayed behind event retry. A worker crash after sending may leave WhatsApp delivery uncertain; reconcile provider message IDs/status events rather than claim exactly-once external delivery.

## Origin attribution and reporting

RH derives `source_system: joy_ai` and `source_channel: whatsapp` from the authenticated integration credential, not a user/model value. Persist `source_entry_point`, `joy_conversation_id`, `joy_assessment_id` where applicable, `origin_request_id`, `originated_at` and immutable parent IDs. Separate original booking source from the actor/channel of later payment or administrative actions: paying on a browser does not turn a Joy-originated booking into a website booking; Joy assisting a website booking does not rewrite its origin.

Copy booking provenance into holds, reviews, payment attempts, confirmed payments, appointments, rematches and refunds. Include only opaque booking/attempt IDs and non-clinical channel tags in Paystack metadata. Authoritative reference mapping is in RH. Historical records with unknown origin stay `UNKNOWN`; do not backfill them all as website traffic.

Admin reporting API work must provide filters for source, creation range and each independent state, and distinguish booking counts, payment-attempt counts and verified successful amounts to avoid counting retries as revenue. Existing RH admin UI work belongs to its frontend owner; this backend delivers the data and documented interfaces.

## Subsequent capability contract

Preserve these planned routes; each needs a typed service schema before its execution slice begins:

- Physio: `GET /physiotherapists/{id}/work-summary`, `PATCH /physiotherapists/{id}/availability`, `POST /bookings/{id}/session-notes`, `/visit-events`, `/feedback-request`, and `POST /patients/{id}/messages`. Require provider assignment, structured confirmed edits and idempotency. Bank/payout changes need separate step-up authority.
- Family: `POST /patients/{id}/family-access`, `PATCH` or `DELETE /patients/{id}/family-access/{grantId}`, and `GET /family/{familyPhone}/patients/{patientId}/care-summary`. Redact phone paths from logs. Default view-only; require active RH grant on every request and generate summaries only from approved returned fields. Direct phone registration is the agreed default.
- Admin: `GET /admin/patients/{id}`, `/admin/physiotherapists/{id}`, `/admin/finance/summary`, `/admin/bookings`, `/admin/payment-attempts`, `/admin/transactions`; `POST /admin/escalations`, `PATCH /admin/physiotherapists/{id}/verification`, `POST /admin/bookings/{id}/reassign`. Scope admin actors and paginate/filter reads. No generic “update admin panel” mutation.

## Acceptance for implementation slices

Contract fixtures must cover authentication, exact raw-body signing, key rotation, replay, wrong actor, duplicates/concurrency, stale revisions, slot conflicts, immutable source, policy mismatch, false payment claims, callback failures, webhook replay and out-of-order events. Include GREEN routine flow, AMBER review/outcome, ORANGE/RED denial and new symptoms after payment. Unauthorized gateway operations must never reach Convex internal functions. Do not enable clinical rules before clinical sign-off or a free review before its confirmation/fee policy is resolved.
