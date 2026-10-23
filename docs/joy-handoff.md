# Joy → clinician handoff

Added October 2026. This describes what Joy sends so a physiotherapist can see what Joy learned and where the patient got to, and what Rehabify (RH) does with it. Both endpoints use the existing Joy → RH request signing, `actor` object and envelope. The shared contract in the Joy-AI repository (`docs/JOY_RH_API_CONTRACT.md`) should be updated to match.

## What RH does on its side

- When a physio accepts a Joy booking, or an admin schedules a virtual consultation, RH:
  - adds the patient to that physio's patient list (`source: joy_whatsapp`);
  - opens a course of care, using Joy's chief complaint as the presenting condition;
  - puts a one-line note on the appointment.
- RH records its own journey stages:
  - `booking_held`
  - `payment_completed` / `payment_failed`
  - `provider_requested` / `provider_accepted` / `provider_rejected` / `provider_timeout`
  - `awaiting_admin_schedule` / `admin_scheduled` / `rescheduled`
  - `meeting_link_sent`
  - `call_joined`
  - `cancelled`

  Joy must not send these.
- Every Joy booking now gets a booking code at creation, for every service mode, not only online visits. `GET /api/v1/joy/bookings/{id}` returns `booking_code` and `meeting_url` once the code exists, usually within a second.
- `/v/<code>` now shows the booking status before payment and while waiting for the physio, and it works for home and clinic visits. The video join is still only for confirmed online visits. Joy can quote the link in every booking message.
- If someone signs up on RH with a verified email or phone number that matches their Joy record, their Joy bookings are attached to the new account.

## 1. Send the intake

`PUT /api/v1/joy/patients/{patient_id}/intake`

Send this after triage, and again whenever the assessment changes. Send one request per assessment revision. Sending the same revision again replaces the earlier copy.

```json
{
  "joy_conversation_id": "conv_123",
  "assessment_id": "asm_456",
  "assessment_revision": 2,
  "booking_id": "<RH booking id, optional>",
  "protocol_version": "msk-1.4",
  "triage_level": "green",
  "chief_complaint": "Lower back pain after lifting, 3 weeks",
  "body_areas": ["lower back"],
  "pain_score": 6,
  "onset": "Lifting a bag of cement on 26 Sept",
  "duration": "3 weeks",
  "red_flags": [{ "question": "Numbness in the groin?", "answer": "No", "flagged": false }],
  "aggravating_factors": ["sitting", "bending"],
  "easing_factors": ["walking"],
  "goals": "Back to work on site",
  "medical_history": "Hypertension",
  "medications": "Amlodipine",
  "answers": [{ "question": "Any previous back problems?", "answer": "Once, 2019" }],
  "clinician_summary": "35M, mechanical LBP, no red flags...",
  "patient_summary": "Back pain since lifting 3 weeks ago, worse when sitting.",
  "language": "en",
  "preferred_times": "Weekday evenings",
  "consent": { "share_with_clinician": true, "policy_version": "2026-09", "acceptance_reference": "acc_789", "given_at": 1760000000000 },
  "actor": { "persona": "patient", "sender_phone": "+2348031234567", "rh_user_id": "<patient_id>" }
}
```

**Required fields:**
- `joy_conversation_id`
- `assessment_id`
- `assessment_revision`
- `actor`

All other fields are optional, and fields that are too long are rejected.

**Who sees what:**
- The physio sees everything except `patient_summary`.
- The patient sees `patient_summary`, `chief_complaint`, `body_areas`, `pain_score` and `goals`.
- If `consent.share_with_clinician` is `false`, the physio only sees that an intake exists, not what it says.

Do not send raw transcripts.

## 2. Report journey stages

`POST /api/v1/joy/patients/{patient_id}/journey-events`

```json
{
  "event_id": "evt_unique_per_stage",
  "stage": "matches_shown",
  "booking_id": "<optional>",
  "occurred_at": 1760000000000,
  "note": "Showed 3 physios in Lekki",
  "actor": { "persona": "patient", "sender_phone": "+2348031234567", "rh_user_id": "<patient_id>" }
}
```

Joy may send these stages:
- `conversation_started`
- `referral_linked`
- `triage_completed`
- `eligibility_passed`
- `eligibility_blocked`
- `matches_shown`
- `payment_link_sent`
- `reminder_sent`
- `hold_expired`
- `abandoned`
- `cancelled`
- `handed_to_human`

Only send `triage_completed` when there is no intake to send, because sending an intake records that stage automatically.

`event_id` makes retries safe. Keep `note` operational and short, at most 200 characters, and never put clinical content in it.

## 3. Patient dashboard links

Added 22 October 2026. Joy patients get a Rehabify dashboard without creating an account themselves.

**What RH does.** When a Joy booking is paid, RH:
- creates the patient's login. This is a Clerk account whose only sign-in address is a private placeholder (`wa-<patient_id>@patients.physioaroundme.com`, a domain with no mailbox). RH does not add the email Joy collected, because Clerk would mark it as verified. The patient signs in with links from Joy until they add their own email in the dashboard;
- moves the street address from the booking onto their profile;
- sends Joy the event `patient.dashboard_ready`:

```json
{
  "event_type": "patient.dashboard_ready",
  "data": {
    "patient_id": "<patient_id>",
    "booking_id": "<booking_id or null>",
    "dashboard_url": "https://physioaroundme.com/go/<code>",
    "expires_at": 1762600000000,
    "mode": "one_tap"
  }
}
```

**What `mode` means.**
- `one_tap`: tapping "Open my dashboard" signs the patient in, with no password.
- `claim`: RH couldn't create the login (for example, `CLERK_SECRET_KEY` isn't set in Convex). The page asks the patient to create an account, then attaches their Joy record to it.
- `sign_in`: the patient already had their own account, so the page sends them to sign in.

**How long a link lasts.** Each link opens the dashboard once and expires after 30 days. Issuing a new link retires the patient's unused ones.

**What Joy should send.** Joy should send `dashboard_url` when this event arrives, for example: "Your Rehabify dashboard is ready: <link>". Never post the link anywhere but the patient's own chat.

**New link on request.** When the patient asks for their dashboard link, call:

`POST /api/v1/joy/patients/{patient_id}/dashboard-link`

```json
{ "actor": { "persona": "patient", "sender_phone": "+2348031234567", "rh_user_id": "<patient_id>" } }
```

The response is `{ ok, dashboard_url, expires_at, mode }`. RH only issues a link when `sender_phone` is the patient's own number; otherwise it returns `{ ok: false, reason: "not_found" }`.

**Where patients ask.** The RH sign-in page and `/v/<code>` both open WhatsApp with "Hi Joy, please send me my Rehabify dashboard link." Joy should answer it by calling the endpoint above.

## Rollout

1. Deploy Convex. Then run these commands once to link patients from existing Joy bookings to their physios, repeating each with the returned `cursor` until `isDone` is true:

   ```
   npx convex run joyHandoff:backfillJoyCareLinks '{"status":"confirmed"}' --prod
   npx convex run joyHandoff:backfillJoyCareLinks '{"status":"completed"}' --prod
   ```

2. Dashboard links need `CLERK_SECRET_KEY` set in Convex. No paid Clerk feature is used. Without the key, every link is created in `claim` mode.
3. Automatic linking by phone needs the phone number in the Clerk sign-in token. In Clerk's `convex` JWT template, include `phone_number` and `phone_number_verified`. Sign-up must also collect and verify a phone number.
4. On Joy's side:
   - send the intake after triage;
   - report the stages above;
   - capture `share_with_clinician` consent;
   - quote `/v/<code>` in every booking message;
   - send `dashboard_url` from `patient.dashboard_ready`, and answer "send me my dashboard link" with the dashboard-link endpoint;
   - stop sending only `triage_summary_reference` as the clinical handoff.
