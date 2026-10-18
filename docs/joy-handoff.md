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

## Rollout

1. Deploy Convex. Then run these commands once to link patients from existing Joy bookings to their physios, repeating each with the returned `cursor` until `isDone` is true:

   ```
   npx convex run joyHandoff:backfillJoyCareLinks '{"status":"confirmed"}' --prod
   npx convex run joyHandoff:backfillJoyCareLinks '{"status":"completed"}' --prod
   ```

2. Automatic linking by phone needs the phone number in the Clerk sign-in token. In Clerk's `convex` JWT template, include `phone_number` and `phone_number_verified`. Sign-up must also collect and verify a phone number.
3. On Joy's side:
   - send the intake after triage;
   - report the stages above;
   - capture `share_with_clinician` consent;
   - quote `/v/<code>` in every booking message;
   - stop sending only `triage_summary_reference` as the clinical handoff.
