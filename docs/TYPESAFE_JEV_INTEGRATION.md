# TypeSafe Jev integration

Jev is used as an optional structured-decision sidecar.  It does not generate
patient-facing text, determine safety outcomes, create bookings, or confirm
payments.  Gemini remains responsible for conversational language; deterministic
safety code and RH remain authoritative for safety and operational decisions.

## What is evaluated

When enabled in shadow mode, a patient message is submitted with direct phone
numbers and email addresses redacted.  Jev returns two non-authoritative values:

- a bounded intent choice (`triage`, `booking`, `payment`, `family_access`,
  `general_support`, or `unclear`); and
- the probability that a short routing clarification is needed.

The result is appended to Joy's triage audit trail without retaining the source
message in that audit event.  A Jev error is fail-open: the patient conversation
continues using the existing workflow.

## Environment configuration

Keep the API key in Railway only; never commit it:

```ini
TYPESAFE_API_KEY=<server-side TypeSafe key>
TYPESAFE_MODEL=jev-latest
TYPESAFE_ENABLED=false
TYPESAFE_SHADOW_MODE=true
```

After a key is set, set `TYPESAFE_ENABLED=true` while retaining
`TYPESAFE_SHADOW_MODE=true`.  This collects calibration evidence without changing
Joy's live behaviour.  Moving Jev out of shadow mode requires reviewed examples,
thresholds, and clinical/operations approval.

## Privacy boundary

Only the minimum message text necessary for the narrow routing judgment is sent
to TypeSafe; explicit contact identifiers are redacted first.  Do not extend this
integration to send patient records, provider records, payment data, raw booking
payloads, or safety decisions without a new privacy and clinical review.
