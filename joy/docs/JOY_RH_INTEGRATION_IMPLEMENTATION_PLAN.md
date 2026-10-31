# Joy AI and RH Integration Implementation Plan

Updated: 8 September 2026. Safety revision source: `C:/Users/HP/Downloads/safety rule Joy.docx`, client-supplied Rehabify Clinical Safety Engine draft version `1.0.0`. This plan incorporates its workflow; clinical thresholds remain pending clinical-lead approval. This is an implementation specification, not evidence that the features are deployed.

## Purpose

This plan brings Joy AI in line with the client's recent direction and connects it safely to the existing Rehabify Health platform in the RH repository.

The immediate delivery priority is:

1. Triage
2. Booking
3. Payment

Voice-note handling and deterministic safety are part of the triage priority. Physiotherapist operations, family access, and admin reporting follow after the core patient journey is working end to end.

This plan covers backend, AI and conversational engineering, integrations, and APIs. It does not add a new frontend, admin panel UI, patient portal, or physiotherapist dashboard.

Production RH base URL: `https://physioaroundme.com`. Patient-facing links returned to Joy must be canonical HTTPS URLs under this domain unless RH explicitly returns another approved domain. Do not derive public links from internal Railway or Convex addresses. Use `https://joy-api.physioaroundme.com` as the proposed custom domain for Joy's server API, WhatsApp webhook and RH event receiver; keep the Railway hostname as an infrastructure fallback rather than a patient-facing URL.

## Target outcome

A patient can contact Joy on WhatsApp, describe their problem in text or by voice, complete the correct deterministic safety protocol, explicitly accept the current policy, receive verified specialty-correct physiotherapist options and real availability from RH, initiate payment, and receive confirmation only after RH has processed a valid Paystack webhook.

A physiotherapist can text `PT` from the WhatsApp number registered in RH, be resolved to the matching verified RH physiotherapist, and then manage authorized operational work through Joy. An authorized family member can text Joy from a granted phone number and receive a permission-filtered, patient-safe care update generated from approved source data.

The same integration later supports physiotherapist WhatsApp workflows, authorized family updates, and admin operational queries without maintaining conflicting copies of RH data inside Joy.

## Non-negotiable architecture

### Joy AI owns

- WhatsApp inbound and outbound handling
- Persona and phone-number identity routing for WhatsApp
- Gemini-based story understanding and structured extraction
- Conversation stage and short-term conversational context
- Structured triage sessions
- Deterministic safety-screen progress and decisions
- Clinical protocol version used for each safety decision
- Patient-facing safety and escalation responses
- Policy presentation and acceptance evidence
- Joy-specific append-only audit events
- Mapping between Joy identities and RH identifiers
- Translation and conversational rendering

### RH owns

- Rehabify platform users and patient records
- Physiotherapist profiles and verification status
- Provider specialties, prices and service modes
- Availability schedules and calendar conflicts
- Marketplace bookings and appointments
- Patient-physiotherapist relationships
- Paystack transaction and payment state
- Final booking confirmation
- Session notes and operational care records
- Visit-location events
- Family-access grants used by the wider platform
- Admin operational and financial aggregates

### Communication boundary

Joy calls a versioned, service-authenticated RH HTTP API. RH sends signed, idempotent domain events to one Joy integration endpoint.

Joy must not directly call public Convex mutations, depend on Clerk browser sessions, or write to the RH Convex database. RH must not update Joy's clinical safety state.

## Required decisions before implementation

Record these decisions in both repositories before application code is changed:

1. RH is the source of truth for booking and payment state.
2. RH receives and verifies Paystack webhooks. Joy receives a signed booking event from RH.
3. General clinical history remains conversational: one open story request followed by a consolidated request for missing non-safety details.
4. Preserve the repository's question discipline: one open story request, extract existing answers, then group missing questions. Keep approved safety question IDs and clinical meanings intact within that grouped follow-up. A one-at-a-time exception in the earlier plan conflicts with `AGENTS.md` and `docs/ARCHITECTURE.md` and is removed; any future exception requires an explicit resolution of that conflict.
5. Nigerian Pidgin remains supported alongside English, Yoruba, Igbo and Hausa unless the client formally removes it.
6. Patient-initiated change of physiotherapist is either an immediate permitted operation or a request requiring admin approval. The recommended default is an approval-based request.
7. During development, create a dedicated Consultation & Booking Policy in RH and expose its current version to Joy. The draft must be reviewed and approved by the client's authorized legal/clinical owner before production use. Its intended public route is `https://physioaroundme.com/consultation-booking-policy`; RH remains authoritative for the final canonical URL, version, effective date and acceptance wording.
8. Patient images are acknowledged but are not used for diagnosis unless a separately approved clinical image workflow is introduced.
9. The `PT` keyword starts physiotherapist discovery but is not sufficient authentication by itself. The verified WhatsApp sender number must match exactly one active RH physiotherapist.
10. Physiotherapist sessions created through `PT` expire after an agreed period. Sensitive operations such as payout or bank changes require step-up authentication and are not authorized merely by control of the WhatsApp number.
11. Family identity is resolved from an active RH family-access grant. A keyword or claim of relationship never grants access.
12. The provider response to a paid booking remains separate from payment status. A rejection starts a defined rematch and refund or credit workflow without rewriting payment history.

## End-to-end patient flow

1. Joy resolves the WhatsApp sender locally.
2. Joy calls RH to resolve or provision the platform patient and stores the RH patient ID.
3. Gemini extracts a structured story without deciding safety or booking eligibility.
4. Joy selects the applicable versioned clinical protocol in code.
5. Joy evaluates general and applicable region rules immediately, reuses supplied answers, and groups the remaining approved questions without a repeated checklist.
6. Each answer is represented as `YES`, `NO`, `UNCLEAR` or `UNANSWERED`, stored with its source evidence, and evaluated by the deterministic rules engine on every triage turn.
7. RED and ORANGE block routine booking. AMBER branches to the five-minute specialist-review flow defined below. GREEN permits the routine pathway only after required checks are complete. Incomplete assessment is never clearance. Steps 8–16 describe the permitted routine branch, not a continuation for every outcome.
8. Joy presents a plain-language summary and records confirmation or correction.
9. Joy obtains the current policy URL and version, presents it, and records explicit acceptance.
10. Joy calls RH for verified specialty-correct matches.
11. Joy calls RH for real availability and presents returned slots only.
12. Joy asks RH to create a pending booking or slot hold using an idempotency key.
13. Joy asks RH to initialize Paystack and sends the returned payment URL.
14. RH verifies the Paystack webhook, records payment, revalidates current safety eligibility and confirms the booking only if the applicable gates still pass. Otherwise it records a recoverable hold and follows the approved resolution workflow.
15. RH sends a signed `booking.confirmed` event to Joy.
16. Joy records the external event, sends the WhatsApp confirmation, and makes the confirmed summary available to the selected physiotherapist.

## End-to-end physiotherapist identity and command flow

1. A sender texts `PT` to Joy from WhatsApp.
2. Joy verifies the Meta webhook and normalizes the sender number to E.164.
3. Joy calls `POST /api/v1/joy/physiotherapists/resolve` with the phone number and a correlation ID.
4. RH returns no match, one eligible match, or an explicit non-eligible state. It never returns multiple full profiles.
5. With no match, Joy explains that the number is not linked to an RH physiotherapist and does not provision a physiotherapist locally.
6. With one active match, Joy stores the RH physiotherapist mapping and opens a time-limited physiotherapist session.
7. Joy shows only the actions allowed by RH for that physiotherapist.
8. Each requested mutation is confirmed conversationally where necessary and sent to RH with the physiotherapist ID, actor phone, request ID and idempotency key.
9. RH rechecks ownership and authorization on every operation; it does not trust Joy's cached role alone.
10. Joy records the result and sends the WhatsApp response.

Initial physiotherapist capabilities:

- View and respond to assigned booking requests
- Accept or reject a booking request, never the patient as a person
- Update availability after confirming Joy's interpretation
- Add or update an appointment/session note
- Record `IN_TRANSIT`, `ARRIVED` and `DEPARTED` visit events
- Send current location for an authorized home-visit booking
- Send a note or message to the patient through Joy
- Request patient feedback after an eligible completed session

Immediate booking notification flow:

1. RH verifies payment and records the paid booking.
2. RH sends Joy a signed booking event containing the assigned physiotherapist and response deadline.
3. Joy immediately sends the physiotherapist the patient-safe triage summary, appointment details and `ACCEPT` or `REJECT` instructions.
4. The physiotherapist response updates a separate `provider_response` field.
5. Acceptance continues the appointment workflow. Rejection triggers the approved rematch and refund or credit workflow and notifies the patient without claiming that payment failed.

## End-to-end family identity and care-update flow

Recommended mechanism: direct phone registration initiated by the patient.

1. The patient tells Joy to add a family member and supplies the phone number and permission tier.
2. Joy confirms the request and calls RH to create or update the family-access grant.
3. RH stores the patient, family phone, permission tier, status, grantor, granted time and revocation time.
4. When that family number contacts Joy, Joy calls the RH family-resolution endpoint before disclosing patient information.
5. If there is no active grant, Joy shares no patient information and explains that the patient must add the number first.
6. If one active grant exists, Joy resolves the family persona and linked patient.
7. If the family member has grants for multiple patients, Joy presents only the permitted patient display names and asks which person they mean.
8. Joy requests a structured, permission-filtered care-summary payload from RH.
9. Joy generates a concise family-friendly summary from that payload. It does not summarize unrestricted raw notes.
10. Joy stores the generated summary with source record IDs and records the disclosure in the audit log.
11. Revocation takes effect immediately on the next request and invalidates cached access.

Recommended permission behavior:

- `view_only` is the default and permits care/progress summaries only.
- `full_access` must be explicit and may permit approved booking and payment operations.
- Neither tier exposes internal clinician notes, staff discussions, hidden safety scores, direct provider contact information or unrelated patient records.
- A family member cannot grant access to another person.
- Emergency notifications follow the approved patient-consent and safety policy, not a general family-summary permission.

## Phase 0 Source-of-truth alignment

Phase 0 specification artifacts implemented on 9 September 2026:

- [Shared API and event contract, v1 draft](JOY_RH_API_CONTRACT.md)
- [Decisions, release gates and next slice](JOY_RH_PHASE0_DECISIONS.md)
- RH counterpart: `RH/docs/JOY_INTEGRATION_ARCHITECTURE.md`, with existing-function mapping.

These define target behavior, not deployed endpoints. Payment success and provider acceptance
are separate states: verified Paystack evidence is necessary, but RH emits final confirmation
only after acceptance, current safety, consent and allocation checks. This clarification applies
where earlier flow descriptions abbreviate payment-to-confirmation. Clinical/operational release
decisions remain open as recorded in the decision record.

### Joy AI repository

- Update `AGENTS.md`, `docs/ARCHITECTURE.md`, and the prompt architecture documentation to reflect the new protocol-driven safety screen.
- Preserve grouped follow-ups with individually traceable approved safety questions; record and resolve any future requested exception against the architecture and contract.
- Document RH as the operational source of truth for provider, booking, appointment and payment data.
- Remove Exercise Prescription and Tracking language from active Phase 1 prompt guidance.
- Add a decision record describing the RH integration and webhook ownership.

### RH repository

- Add an integration architecture document describing the Joy service boundary.
- Document which existing Convex functions will be wrapped and which must become internal-only.
- Document that no Joy integration route may rely on a Clerk browser session.
- Document Paystack webhook ownership and the event sent to Joy.

### Exit criteria

- The source-of-truth boundaries are approved.
- Question scheduling preserves the architecture's grouped follow-up requirement.
- Policy URL ownership and change-physio approval rules are decided.

## Phase 1 Integration foundation

### RH work

Create a versioned route group under `app/api/v1/joy/`.

Implement shared integration infrastructure:

- Service authentication using a dedicated Joy credential
- Request timestamp and signature validation or short-lived service JWT validation
- Constant-time credential comparison
- Request correlation IDs
- `Idempotency-Key` support for mutations
- Stable JSON error codes
- Request and response schema validation
- Audit logging for every Joy-initiated mutation
- Rate limiting appropriate for server-to-server traffic
- Redaction of secrets and sensitive medical data from logs

Recommended headers:

- `Authorization: Bearer <service-token>` or signed request headers
- `X-Request-Id`
- `Idempotency-Key` on every mutation
- `X-Joy-Api-Version: 1`

Create RH integration adapters that call internal Convex queries and mutations. Do not expose arbitrary function names or raw database operations.

Add lookup endpoints needed before persona routing is finalized:

- `POST /api/v1/joy/physiotherapists/resolve` for exact E.164 phone matching
- `POST /api/v1/joy/family/resolve` for active family grants by phone

Lookup responses must be deliberately minimal. A failed lookup must not reveal whether another phone number, email address or private profile exists.

### Joy AI work

Create an `RHClient` abstraction using `httpx` with:

- Explicit request and response models
- Short connect/read timeouts
- Retries only for safe reads and idempotent mutations
- Correlation and idempotency headers
- Error translation into stable Joy domain errors
- Structured logging without credentials or unnecessary clinical text
- Circuit-breaker or degraded-service behavior

Add configuration for:

- RH API base URL
- RH service credential or signing key
- RH event-signing secret
- RH API version
- Current environment

Create an identifier mapping model containing at least:

- Joy persona and local person ID
- RH user or patient ID
- RH physiotherapist ID when relevant
- RH family grant IDs and linked patient IDs when relevant
- Creation and verification timestamps

Add a time-limited persona-session record for physiotherapists resolved through `PT`. Store the resolution source, resolved RH identity, last verification time, expiry and allowed capability set. Re-resolve against RH after expiry or before a sensitive operation.

Add a read-only RH connectivity health check that does not expose secrets.

### RH-to-Joy events

Create `POST /api/integrations/rh/events` in Joy.

The endpoint must:

- Verify the RH signature before parsing or acting
- Reject stale timestamps
- Enforce unique event IDs
- Store the raw canonical event payload or its integrity hash
- Return success for an already-processed event
- Enqueue side effects after durable receipt
- Append an audit event for accepted and rejected integration events

Initial event envelope:

```json
{
  "event_id": "evt_unique_id",
  "event_type": "booking.confirmed",
  "api_version": "1",
  "occurred_at": "2026-09-07T12:00:00Z",
  "data": {}
}
```

Initial event types:

- `booking.payment_confirmed`
- `booking.provider_response_requested`
- `booking.provider_accepted`
- `booking.provider_rejected`
- `booking.cancelled`
- `booking.rescheduled`
- `family.access_changed`
- `patient.message_available`
- `booking.confirmed`
- `specialist_review.requested`
- `specialist_review.scheduled`
- `specialist_review.completed`
- `specialist_review.cancelled`

Review events describe review lifecycle and clinician evidence; they do not directly overwrite Joy's safety assessment or establish payment confirmation.

### Exit criteria

- Unauthorized service requests fail.
- Duplicate mutation requests do not duplicate records.
- Duplicate RH events do not duplicate WhatsApp messages.
- Both services expose healthy authenticated integration checks.

## Phase 2 Joy conversational and clinical refactor

This phase implements the previously identified AI refinements without moving final clinical authority into Gemini or RAG.

### Replace the large master prompt

- Stop loading the full `joy_master_prompt.md` on every turn.
- Create a short core prompt limited to identity, tone, privacy, non-diagnosis and obedience to backend state.
- Assemble only the persona and stage fragments required for the current turn.
- Remove out-of-scope exercise coaching and adherence instructions.
- Keep clinical decision logic out of prompt prose.

### Expand conversation stages

Replace the broad three-stage patient flow with explicit stages:

- `STORY_CAPTURE`
- `SAFETY_INTRODUCTION`
- `SAFETY_SCREEN`
- `TRIAGE_SUMMARY`
- `POLICY_REVIEW`
- `POLICY_ACCEPTANCE`
- `SPECIALIST_MATCHING`
- `SLOT_SELECTION`
- `AWAITING_PAYMENT`
- `BOOKING_CONFIRMED`
- `SPECIALIST_REVIEW`
- `AWAITING_SPECIALIST_REVIEW`
- `REVIEW_OUTCOME_PENDING`
- `MEDICAL_ESCALATION`
- `EMERGENCY_ESCALATION`

Transitions must be code-owned and validated. Gemini may recommend conversational wording but may not select an unauthorized transition.

### Expand structured story extraction

Add fields for:

- Main complaint
- Body region
- Onset and duration
- Mechanism
- Symptoms
- Radiation
- Aggravating and relieving factors
- Functional limitations
- Main concern
- Relevant medical history
- Patient goals
- Extraction confidence and ambiguous fields

Store the source message ID for clinically important facts.

### Implement the safety protocol runtime

- Reconcile `clinical_engine_v1.json` with the supplied safety document, preserving source rule IDs and version provenance; activate only a clinically approved, validated rule release.
- Validate the protocol file at application startup.
- Select the region protocol deterministically from structured data, with a controlled clarification path when uncertain.
- Introduce a protocol scheduler that records protocol version, question IDs, order, answers and resulting actions.
- Apply general rules alongside the relevant region rules; group missing approved questions in a deterministic backend-selected order and preserve individual answer mapping.
- Do not allow Gemini to invent, remove or independently reorder safety questions. Do not re-ask facts already established unless a correction or new symptom makes them stale.
- Normalize exact affirmative and negative answers in code.
- Use a constrained Gemini classification only for complex or multilingual answers.
- Require the classifier to return `YES`, `NO` or `UNCLEAR` with evidence and no action recommendation. The backend assigns `UNANSWERED` when evidence is absent.
- Treat uncertainty according to the protocol; never silently coerce it to `NO`.
- Evaluate all relevant protocol rules and combinations in code.
- Keep patient-facing escalation code-composed and independent of Gemini availability.

### Language behavior

- Support English, Nigerian Pidgin, Yoruba, Igbo and Hausa.
- Persist language and code-switching context.
- Create reviewed localized versions of every safety question and escalation message.
- Permit Gemini to personalize the lead-in but not alter the clinical meaning of the question.
- Add back-translation or semantic-equivalence QA fixtures for approved translations.

### Voice and image behavior

- Preserve the five-minute voice-note limit and resilient failure copy.
- Move toward the documented Gemini Live implementation where operationally justified.
- Feed voice transcripts through the same typed extraction and safety pipeline as text.
- Acknowledge patient images without diagnosing from them.
- Keep clinical image analysis disabled until explicitly approved.

### Policy acceptance

- Separate triage-summary confirmation from policy acceptance.
- Retrieve the current policy URL and version from RH.
- Store policy version, URL, presentation time, acceptance message ID, actor and acceptance time.
- Require explicit acceptance before matching or booking.
- Add a dedicated append-only policy audit event.

### RAG boundary

Use RAG for:

- Approved terminology and patient education
- Specialty explanations
- Service and preparation information
- Approved non-diagnostic explanations

Do not use RAG for:

- Safety decisions
- Safety-question selection
- Policy acceptance
- Booking permission
- Payment confirmation

Add document versioning, chunk identifiers, retrieval traces and evaluation fixtures before expanding the knowledge base.

### Exit criteria

- Gemini cannot independently unblock a safety-screened patient.
- Approved safety questions are not invented or reordered.
- Summary confirmation cannot imply policy acceptance.
- Every safety decision identifies its protocol version, rule IDs, question IDs and answers.
- The Tolu conversation passes as an end-to-end test without premature booking confirmation.

## Phase 3 Priority patient APIs in RH

The safety requirements and Phase 3A review service below are part of the initial triage delivery, not deferred physiotherapist operations.

### Resolve patient

`POST /api/v1/joy/patients/resolve`

Input:

- Phone number in E.164 format
- Optional name and email
- Joy local person ID

Output:

- RH patient/user ID
- Existing or created indicator
- Minimal permitted patient metadata

Requirements:

- Idempotent by normalized phone number
- Never create multiple RH patients for the same phone
- Do not require Clerk authentication

### Retrieve current policy

`GET /api/v1/joy/policy/current`

Output:

- Policy version
- Canonical URL
- Effective date
- Acceptance wording identifier

RH must also provide the public policy page at the canonical URL. The initial content may be developed from RH's existing Terms and Conditions and Payment Policy, plus the approved consultation, triage-review, provider-response, cancellation, rematching, refund and data-sharing terms. Gemini must not generate or rewrite the policy at runtime.

### Match physiotherapists

`POST /api/v1/joy/matches`

Input:

- RH patient ID
- Condition area and required specialty tags
- Location or coordinates
- Teleconsult or home-visit preference
- Optional price and time preferences
- Urgency used only as an ordering signal after safety clearance

Output:

- Up to three verified eligible physiotherapists
- Verified display name and specialty information
- Service modes and price in kobo
- Match reasons based only on verified data
- Stable RH physiotherapist IDs

Requirements:

- Specialty eligibility is a hard filter before ranking.
- A non-MSK case must never fall back to an MSK-only provider.
- Empty results return an honest no-specialist response.
- The existing nationwide fallback must not bypass specialty eligibility.

### Retrieve availability

`GET /api/v1/joy/physiotherapists/{physioId}/availability`

Parameters:

- Start and end time
- Session duration
- Service mode
- Time zone

Requirements:

- Reuse RH availability and appointment-conflict logic.
- Include Google Calendar conflicts where available.
- Return only future bookable slots.
- Use Africa/Lagos as the explicit default time zone.

### Create pending booking

`POST /api/v1/joy/bookings`

Input:

- RH patient ID
- RH physiotherapist ID
- Exact returned slot
- Service mode and session type
- Price quoted by RH
- Joy triage-summary reference
- Policy version and acceptance reference
- Current Joy assessment ID and revision, protocol version, and verifiable service-specific eligibility reference
- Immutable origin fields: `source_system=joy_ai`, `source_channel=whatsapp`, Joy conversation ID and correlation/request ID

Requirements:

- Require an idempotency key.
- Revalidate availability transactionally.
- Recalculate authoritative price in RH.
- Enforce the safety gate in RH as well as Joy. Validate the patient, assessment revision, allowed service, freshness and policy evidence through an authenticated Joy eligibility check; never trust a caller-supplied color or boolean. Reject unavailable, stale or invalid clearance. Revalidate on rescheduling and before final confirmation.
- Create only `pending_payment` or equivalent status.
- Never accept `confirmed` from the request.
- Return booking ID, expiry/hold information and amount in kobo.

### Initialize payment

`POST /api/v1/joy/bookings/{bookingId}/payment`

Requirements:

- Initialize Paystack against the existing RH booking.
- Generate or reuse an idempotent reference.
- Return the Paystack authorization URL and pending status.
- Never confirm the booking synchronously from Joy's request.
- Create a durable payment-attempt record before calling Paystack and inherit the booking's immutable origin fields.
- Include only non-clinical attribution in Paystack metadata: RH booking ID, `source_system=joy_ai`, `source_channel=whatsapp` and an opaque correlation ID. Do not include the symptom story, safety answers or phone number as attribution metadata.
- Persist the Paystack reference, access-code hash or safe identifier, initialization result, timestamps and failure category so abandoned and failed attempts remain visible to authorized administrators.

### Joy channel attribution

Every booking, specialist review, payment attempt, verified transaction, appointment and downstream resolution created from the WhatsApp flow must remain attributable to Joy. Store structured immutable fields rather than inferring origin from free-text notes:

- `source_system`: `joy_ai`
- `source_channel`: `whatsapp`
- `source_entry_point`: `patient_booking`, `specialist_review`, `physio_command` or another controlled enum
- `joy_conversation_id`
- `joy_assessment_id` when applicable
- `origin_request_id` and idempotency key
- `originated_at`

Copy the attribution forward when RH creates a payment attempt, appointment, provider-response workflow, rematch, refund or reconciliation record. The webhook handler must resolve the authoritative booking/payment attempt by reference and compare attribution; it must not trust metadata alone. Origin is historical provenance and cannot be changed by rescheduling, reassignment or an admin update.

Use equivalent controlled values for non-Joy entry points, such as `rh_marketplace_web`, `rh_patient_dashboard`, `rh_admin` and `rh_clinic`, so reporting compares channels consistently. Expose origin filters and counts in the existing RH admin booking and transaction views and in the Joy admin integration APIs.

### Booking status

`GET /api/v1/joy/bookings/{bookingId}`

Return:

- Booking status
- Payment status
- Appointment details when confirmed
- Physiotherapist-safe display data
- Last-updated timestamp

### Update and cancel

- `PATCH /api/v1/joy/bookings/{bookingId}` for allowed rescheduling details
- `POST /api/v1/joy/bookings/{bookingId}/cancel`

Both operations must enforce actor permissions, status transitions and idempotency.

### Paystack hardening in RH

- Make `completeMarketplaceBooking` internal-only.
- Invoke it only after Paystack signature, reference, currency and amount validation.
- Add durable Paystack event IDs for replay protection.
- Remove or protect client-triggered paths that can mark a marketplace booking confirmed.
- Do not create an appointment at a fabricated default time if the booking has no validated slot.
- Publish a signed `booking.confirmed` event to Joy only after the RH transaction commits and current eligibility passes; payment received during a safety hold produces payment evidence, not appointment confirmation.

### Joy integration

- Replace local production matching with `RHClient.match_physios`.
- Replace local production availability with RH availability.
- Store RH booking IDs in Joy; do not create a competing production booking lifecycle.
- Treat RH status as authoritative when answering payment and appointment questions.
- Send confirmation only after the signed RH event or an authenticated reconciliation read.

### Exit criteria

- A full patient journey works from WhatsApp story to Paystack-confirmed RH appointment.
- A repeated request or webhook cannot create duplicate patients, bookings, payments or confirmation messages.
- A patient cannot book without current service-specific eligibility and explicit policy acceptance: routine clearance for standard consultations, or AMBER eligibility for a specialist review.
- A non-MSK patient cannot be matched to an MSK-only physiotherapist.

## Safety revision requirements

These twelve requirements extend the earlier plan. The source document covers MSK; it does not replace the separately required non-MSK protocols or authorize exercise prescription, doctor booking, or new UI work.

### 1 Four outcomes and action permissions

Implement a central action matrix in Joy and enforce its service permissions in RH:

- `GREEN`: allow the routine MSK pathway after complete required checks, subject to consent, booking and payment gates.
- `AMBER`: block routine consultation; offer a distinct five-minute specialist triage review.
- `ORANGE`: block routine consultation and the five-minute review; provide approved medical or urgent clinical assessment guidance.
- `RED`: block both booking routes, stop standard triage, provide approved emergency guidance and create an urgent alert.

Use `UNKNOWN` only as an internal incomplete-assessment state, never as a fifth clinical clearance outcome. No exercise service is implemented in this phase, regardless of the source JSON's exercise flags.

### 2 Versioned rule bank

Import the general rules and low-back, neck, shoulder, elbow, wrist/hand, mid-back, hip, knee, ankle/foot, jaw and other-MSK definitions into a schema-validated configuration. Preserve rule/question IDs, priorities, conditions, outcomes and source provenance. Store release version, checksum, approval identity/date and effective date. Reject duplicate IDs, unknown actions, incomplete condition branches and unsupported schema versions before activation. Do not use arbitrary executable expressions from configuration.

### 3 General and region screening

Evaluate general rules together with every applicable region protocol. Define deterministic selection and clarification behavior for multiple or uncertain regions. Reuse evidence from the open story and group missing approved questions. Maintain question-level answer provenance even when a single message answers several questions. Apply independently approved protocols to non-MSK presentations; never treat this document as universal clinical coverage.

### 4 Explicit uncertainty

Persist `YES`, `NO`, `UNCLEAR` and `UNANSWERED` separately. Negation, conflicting statements, uncertain translation and absent facts must not become negative answers by default. Required missing answers block GREEN. Allow the initial grouped follow-up to complete an assessment; unresolved uncertainty then follows the source's AMBER specialist-review route. LLM confidence cannot clear a patient, and a known higher-severity trigger always overrides uncertainty.

### 5 Precedence and reassessment

Compute the final outcome in code using `RED > ORANGE > AMBER > GREEN`, retaining every triggered rule. Rule numeric priority must not downgrade the outcome. Run the engine independently on every triage turn, including when extraction fails or the model is unavailable. New symptom reports during payment or after booking must also trigger reassessment. Link each immutable assessment revision to its predecessor and invalidate older eligibility when new evidence changes the decision. Preserve payment history and alert the responsible clinician for affected existing appointments; do not silently cancel or refund them without the approved operational policy.

### 6 Five-minute review service

RH owns `SPECIALIST_TRIAGE_REVIEW`, a distinct five-minute service with eligible reviewers, real availability, duration, price policy, assignment and lifecycle. Joy offers it only on AMBER and explains that it provides initial safety review and next-step advice, not a full consultation. Pass the patient's permitted structured summary, answers, uncertainty and triggered rules to the assigned reviewer. A nearest general physiotherapist is not automatically an eligible reviewer.

### 7 Recorded clinician outcomes

RH stores `PROCEED_TO_MSK_PATHWAY`, `BOOK_STANDARD_CONSULTATION`, `MEDICAL_REVIEW` or `URGENT_ESCALATION`, with clinician identity, qualifications/authorization reference, reasoning, timestamps, patient ID and reviewed assessment revision. Corrections append a superseding record. Joy verifies the signed outcome event, checks for newer symptoms and derives permitted next steps in code while preserving the original safety result. A clinician decision is not payment confirmation and cannot authorize a different patient or superseded assessment.

### 8 ORANGE and RED escalation

Maintain clinically approved localized messages, reasons and urgency instructions. ORANGE recommends the appropriate medical assessment; RED sends emergency guidance immediately without waiting for policy acceptance, payment, model output or staff acknowledgement. RED also creates a durable urgent alert with delivery retries and an accountable recipient. Define handoff availability and failure copy. Do not promise doctor appointments, response times or emergency dispatch unless an actual authorized service exists. Never offer a five-minute review as a substitute for ORANGE or RED escalation.

### 9 Booking gates across both systems

Joy is authoritative for safety evaluation; RH is authoritative for the operational booking and validates service-specific eligibility through authenticated integration. Bind eligibility to patient, assessment revision, rule version, service type, issue/expiry time and any valid clinician-review reference. Recheck before creating or rescheduling a hold, initializing payment and confirming the appointment. Fail closed on missing or stale evidence. If payment succeeds after clearance becomes invalid, record the verified payment but hold appointment progression for the approved clinical and financial resolution workflow. Keep safety, consent, payment and provider acceptance as separate states. Neither service may use RAG or an LLM decision to bypass these checks.

### 10 Persistent state and audit

Joy stores immutable assessment revisions, question answers, source message/transcript references, normalized facts, conflicting evidence, rule version/checksum, triggered rules, final result and permitted/blocked actions. RH stores review appointments and authored clinician decisions. Correlate records using patient, assessment, review, booking and event IDs. Append audit entries for GREEN as well as AMBER, ORANGE and RED, booking denials, review decisions, alerts and superseded clearance. Support independently authorized audit queries; do not put raw health data in routine application logs. Existing persona and family permissions apply to every disclosure.

### 11 Rule-derived verification

Add fixtures for every supported condition branch, including yes/no/unclear/unanswered and mixed answers to compound questions. Verify precedence, general-plus-region evaluation, grouped questions, no-repeat behavior, multilingual negation, correction history, model failure and new symptoms after clearance. Cover AMBER review creation through clinician outcome, reviewer authorization, unavailable reviewers, duplicate or out-of-order events, stale clinician decisions and direct RH attempts to bypass safety. Test payment arriving after invalidated clearance and verify no false appointment confirmation.

The knee role-play is an ambiguity fixture: warmth and worsening pain without swelling or fever do not automatically satisfy `KN-003`'s combined condition. Worsening with walking alone does not establish rapid deterioration. Expected routing must follow the clinically approved handling of partial and uncertain findings; do not encode this example as automatic GREEN or automatic ORANGE.

### 12 Clinical and operational release gates

Before production activation, obtain clinical-lead approval of thresholds, question wording, translations, urgency messages, review authority and all condition combinations. Specifically resolve `KN-003`'s compound wording and the missing inability-to-weight-bear-without-injury branches in `KN-001`, `HP-001` and `AF-001`. Define when unanswered intake becomes unresolved AMBER, how long clearance remains applicable, and whether/how a clinician can authorize progression. No unresolved branch may silently pass.

Confirm reviewer staffing, qualifications, working hours, appointment mode, response expectations, no-reviewer/no-show fallback, consent wording, review fee and payment/refund policy, and alert ownership. The document does not answer these operational questions. A free review would need an explicitly approved event-driven scheduling lifecycle because the existing contract ties booking confirmation to payment webhooks; do not invent a zero-value payment or silently relax that constraint. Implementation of schemas, adapters and tests can proceed while these decisions are collected, but the affected production paths remain disabled.

## Phase 3A Specialist review integration

Implement alongside the initial patient triage path, before the patient pilot. Endpoint names below are proposed API contracts, not claims that RH already provides them.

### RH work

- `GET /api/v1/joy/specialist-reviews/availability`: accept patient/assessment reference, required review specialty, service mode and time range; return eligible reviewers, actual five-minute slots, price and policy references.
- `POST /api/v1/joy/specialist-reviews`: accept current AMBER eligibility, exact returned slot, reviewer, permitted summary and policy-acceptance evidence; enforce authorization, transactional slot allocation and idempotency. Return a review ID and, where applicable, a linked payment-pending booking ID.
- `GET /api/v1/joy/specialist-reviews/{reviewId}`: return authorized lifecycle, scheduling and recorded outcome data.
- `POST /api/v1/joy/specialist-reviews/{reviewId}/outcomes`: accept one of the four approved clinician outcomes, reasoning and reviewed assessment revision; restrict to the assigned authorized reviewer and append the decision.
- Emit signed, durable review lifecycle events defined in Phase 1 after committed changes. Paid reviews reuse the existing Paystack flow and webhook-only confirmation; free-review scheduling remains gated on the explicit decision above.

### Joy work

- Add typed `RHClient` methods for review availability, requests, retrieval and clinician outcome submission by an authenticated reviewer persona.
- Provide a service-authenticated eligibility endpoint, proposed as `POST /api/integrations/rh/safety/eligibility`, so RH can validate the latest patient/assessment/service permission. Return a scoped decision reference and stable denial reason without unnecessary medical details.
- Handle AMBER with summary confirmation, explicit review-policy acceptance, real reviewer availability, booking request and truthful status updates. Urgent guidance is never conditional on consent or payment.
- Route assigned reviewer notifications and structured outcome collection through the authorized physiotherapist WhatsApp identity flow. Deliver these minimal reviewer capabilities before the broader Phase 4 operations.
- Consume review events idempotently, retain original assessments, re-evaluate current evidence and explain the next step without claiming an appointment that RH has not confirmed.

### Exit criteria

- An AMBER patient can reach an eligible reviewer and receive a recorded next step without obtaining a routine appointment prematurely.
- ORANGE and RED cannot enter the review booking route.
- Unavailable reviewers produce an approved fallback, never invented availability or automatic clearance.
- A recorded clinician outcome cannot bypass newer safety evidence, policy acceptance, verified payment or provider-response rules.

## Phase 4 Physiotherapist operations

Implement after the patient booking and payment path is stable.

### RH endpoints

- `POST /api/v1/joy/physiotherapists/resolve`
- `GET /api/v1/joy/physiotherapists/{physioId}/work-summary`
- `PATCH /api/v1/joy/physiotherapists/{physioId}/availability`
- `POST /api/v1/joy/bookings/{bookingId}/respond`
- `POST /api/v1/joy/bookings/{bookingId}/session-notes`
- `POST /api/v1/joy/bookings/{bookingId}/visit-events`
- `POST /api/v1/joy/patients/{patientId}/messages`
- `POST /api/v1/joy/bookings/{bookingId}/feedback-request`

### Required behavior

- Availability updates parse in Joy but are validated and written in RH only after the physiotherapist confirms the interpreted schedule.
- The `PT` keyword triggers an exact phone lookup and never creates a physiotherapist account.
- Only active and appropriately verified RH physiotherapists receive a capability session.
- RH re-authorizes every command against the booking, patient relationship and physiotherapist ID.
- Booking responses use `accept` or `reject`; do not describe this as accepting or rejecting the patient.
- A physio response does not create payment confirmation.
- Session notes are attached to the correct confirmed appointment and author.
- Visit events use explicit `IN_TRANSIT`, `ARRIVED` and `DEPARTED` events tied to a booking.
- Location includes consent context, coordinates, accuracy, event time and expiry rules.
- Joy sends WhatsApp messages; RH stores the operational message/audit record and returns delivery content or an event.
- Feedback requests are allowed only after an eligible completed session and are deduplicated.
- Payout and bank-detail changes require step-up authentication and remain outside the basic `PT` session unless separately approved.

### Exit criteria

- A physiotherapist can manage the specified workflow entirely through Joy while RH remains authoritative.
- An unregistered, inactive or unverified phone cannot enter the physiotherapist workflow by sending `PT`.
- Location and note updates cannot target another physiotherapist's booking.
- Every mutation identifies the acting WhatsApp identity and linked RH identity.

## Phase 5 Family and admin operations

### Family access

RH endpoints:

- `POST /api/v1/joy/family/resolve`
- `POST /api/v1/joy/patients/{patientId}/family-access`
- `PATCH /api/v1/joy/patients/{patientId}/family-access/{grantId}`
- `DELETE /api/v1/joy/patients/{patientId}/family-access/{grantId}`
- `GET /api/v1/joy/family/{familyPhone}/patients/{patientId}/care-summary`

Requirements:

- Normalize and resolve the family phone number.
- Default to view-only unless full access is explicit.
- Check active grants on every request.
- Return a deliberately structured, patient-safe source payload rather than raw notes.
- Let Joy generate the family-facing summary only from fields allowed by the active grant.
- Store summary source IDs, generation time and disclosed recipient for auditability.
- Stop access immediately after revocation.
- Invalidate Joy's cached family resolution when RH emits `family.access_changed`.
- Audit reads as well as mutations.

### Change physiotherapist

Recommended endpoint:

- `POST /api/v1/joy/bookings/{bookingId}/change-physio-request`

The endpoint should record the patient's reason and either apply an approved automatic policy or place the request in an admin workflow. Do not reuse clinic-owner reassignment without adapting its authorization and side effects.

### Admin operations

RH already contains authenticated admin dashboard pages for marketplace bookings and invoice-oriented transactions, backed by Convex functions that enforce the admin role. Extend these existing surfaces and data functions rather than building a competing admin interface as part of Joy. The current views are not yet a complete ledger of all appointment types, booking attempts, Paystack initialization attempts, webhook events and reconciliation outcomes.

RH endpoints:

- `GET /api/v1/joy/admin/patients/{patientId}`
- `GET /api/v1/joy/admin/physiotherapists/{physioId}`
- `GET /api/v1/joy/admin/finance/summary`
- `POST /api/v1/joy/admin/escalations`
- `PATCH /api/v1/joy/admin/physiotherapists/{physioId}/verification`
- `POST /api/v1/joy/admin/bookings/{bookingId}/reassign`

Requirements:

- Return least-privilege operational summaries.
- Never expose internal secrets, unrestricted clinical notes or raw financial credentials.
- "Update admin panel" means update a specific backend record; it does not authorize building or manipulating the UI.

### Exit criteria

- Family members cannot access data without a live grant.
- View-only family members cannot book or pay.
- Admin operations are explicit, authorized and audited.

## Phase 6 Reliability, security and observability

### Contract and schema testing

- Store OpenAPI or equivalent schemas for the RH Joy API.
- Generate or validate Joy Pydantic models against those schemas.
- Add consumer-driven contract fixtures shared by both repositories.
- Make breaking contract changes require a new API version.

### Failure handling

- RH unavailable: Joy explains that live booking information is temporarily unavailable without inventing providers or slots.
- Payment pending: Joy reports processing and does not confirm.
- Event delivery failure: RH retries with exponential backoff and a dead-letter record.
- Joy event handler failure: Joy durably stores the event before retrying side effects.
- Partial booking failure: RH does not leave a confirmed payment without a recoverable reconciliation state.

### Reconciliation

Add a scheduled Joy reconciliation job for RH booking IDs that remain pending beyond an expected window. It reads RH status and repairs missed notifications without directly changing RH state.

### Observability

Track:

- RH API latency and error rate by endpoint
- Match result counts and no-specialist outcomes
- Safety outcomes by protocol version and rule ID
- Policy presentation-to-acceptance conversion
- Pending-payment age
- Webhook and event retry counts
- Duplicate/idempotent request counts
- WhatsApp confirmation delivery state
- Bookings, payment attempts, successful payments, provider responses, refunds and reconciliation outcomes by immutable source system and channel

Do not place patient story text, access tokens or exact coordinates in routine metrics.

## Testing strategy

### Joy unit tests

- Structured story extraction merge behavior
- Stage transition rules
- Question scheduling and no-repeat behavior
- `YES`, `NO`, `UNCLEAR` and `UNANSWERED` handling
- Every protocol escalation branch
- Policy acceptance independent of summary confirmation
- RH client response and failure mapping
- Signed event verification and idempotency
- Multilingual safety copy
- `PT` keyword does not provision an unknown physiotherapist
- Exact phone match, inactive match, no match and expired physio session
- Family lookup with no grant, one grant, multiple grants and revoked grant
- Generated family summary cannot include fields excluded from the source payload

### RH unit and integration tests

- Service authentication and authorization
- Phone-number patient resolution
- Specialty hard filtering
- Availability conflict calculation
- Booking idempotency and slot revalidation
- Amount and currency validation
- Paystack replay protection
- Webhook-only confirmation
- Immutable Joy WhatsApp attribution from booking through payment, appointment, rematch and refund
- Admin filtering for Joy-originated bookings, all Paystack attempts and successful Joy-originated transactions
- Family permission enforcement
- Visit event ownership
- Admin least-privilege responses
- Exact normalized physiotherapist phone resolution
- Minimal lookup response that does not leak private profile data
- Physio command ownership and capability enforcement
- Appointment-bound arrival, departure and location events
- Feedback-request eligibility and deduplication
- Family resolution, multiple grants, revocation and permission-filtered payloads

### Cross-repository end-to-end tests

- Tolu low-back journey with all safety answers clear
- Each low-back red flag answered yes
- Ambiguous and corrected safety answers
- No provider with the required specialty
- Natural-language request such as "tomorrow evening"
- Duplicate booking request
- Payment pending, failed and confirmed
- Duplicate Paystack and RH events
- Patient cancellation and reschedule
- Physiotherapist acceptance and rejection
- Immediate physiotherapist notification after the paid-booking event
- Unregistered sender texting `PT`
- Registered physiotherapist session expiry and re-resolution
- Rejected paid booking enters rematch/refund or credit handling
- Family view-only update and revoked access
- Family member linked to multiple patients
- English, Pidgin, Yoruba, Igbo, Hausa and mixed-language turns
- Voice transcription timeout and retry behavior
- Image receipt without unsupported diagnosis

## Migration and rollout

### Data preparation

- Add nullable RH external IDs to Joy identity and booking-reference records.
- Backfill mappings only where identity can be verified by normalized phone or another approved key.
- Do not automatically merge conflicting people.
- Add a report for unmatched and ambiguous records.

### Feature flags

Introduce flags for:

- RH patient resolution
- RH matching
- RH availability
- RH booking creation
- RH payment ownership
- RH family and admin integrations
- Approved safety protocol release and specialist-review service availability; disabling the review service must never disable safety gates or convert AMBER into GREEN

### Rollout sequence

1. Deploy authenticated read-only endpoints.
2. Run Joy in shadow-read mode and compare RH results with local results.
3. Enable RH matching for internal test numbers.
4. Enable RH booking creation with test Paystack credentials.
5. Validate signed confirmation events and duplicate handling.
6. Complete clinical sign-off and validate GREEN, AMBER review, ORANGE and RED paths, including staffed review/alert handling, before enabling the limited patient pilot.
7. Remove local production writes for domains now owned by RH.
8. Enable physiotherapist, family and admin operations progressively.

### Rollback

- Disable RH write feature flags.
- Preserve received event and audit records.
- Do not roll back a confirmed RH payment or appointment through Joy.
- Continue safety and triage locally while live booking is unavailable.

## Definition of done

The integration is complete when:

- Joy uses a small stage-specific prompt architecture.
- Gemini extracts and communicates but cannot determine final safety or booking status.
- The versioned clinical question bank is executable and auditable.
- Safety questions and escalations work in all required languages.
- Summary confirmation and policy acceptance are separate recorded events.
- RH supplies verified specialty-correct providers and real availability.
- RH owns booking, appointment and payment state.
- Only a verified RH Paystack webhook can produce a confirmed booking.
- RH sends signed, idempotent events to Joy.
- Joy never invents providers, availability, payments or booking success.
- Patient, physiotherapist, family and admin operations enforce code-level permissions.
- `PT` resolves an existing RH physiotherapist by verified WhatsApp phone and never creates one from a keyword.
- Paid bookings notify the assigned physiotherapist immediately for an accept or reject response.
- Family updates require an active RH grant and use a permission-filtered source payload before Joy generates the summary.
- Every clinical, matching, consent, booking and integration decision is independently auditable.
- The full Tolu scenario and its failure variants pass cross-repository tests.
- All twelve safety revision requirements pass their clinical, operational and technical release gates.
- AMBER has a working five-minute review route with persisted, authorized clinician decisions and tested unavailable-service behavior.
- RH rejects missing, stale and service-incompatible safety eligibility, including payment/clearance race cases.
- Every rule release is clinically approved; exercise prescription and unsupported doctor booking remain outside this delivery.

## Recommended execution slices

To keep reviews small and reversibility high, implement in this order:

1. Architecture decisions and API contract
2. RH service authentication and read-only patient/provider endpoints
3. Joy `RHClient` and identifier mapping
4. Joy prompt, state and structured extraction refactor
5. Clinically reviewed rule bank, four-outcome safety runtime, grouped scheduler, persistent assessment revisions and localized safety copy
6. Policy retrieval and explicit consent
7. RH strict matching and availability
8. RH pending booking and Paystack ownership
9. Signed RH-to-Joy confirmation events
10. RH five-minute review service, minimal reviewer WhatsApp identity/actions, clinician outcomes, cross-system safety gates and end-to-end patient pilot after release approval
11. `PT` physiotherapist resolution and immediate booking alerts
12. Physiotherapist operational commands and feedback requests
13. Family resolution, access grants and generated summaries
14. Admin operations
15. Reconciliation, observability and production hardening

Do not begin a later slice until the preceding slice's unit, contract and relevant end-to-end tests pass.
