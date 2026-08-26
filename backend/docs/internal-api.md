# Internal APIs (frontend team)

JSON only. No Retool UI, receipt HTML pages, or HMO export in this repo.

Auth for the routes below: header `X-Internal-Key` must match Settings `internal_api_secret` (`INTERNAL_API_SECRET`). 401 if missing, wrong, or the secret is empty.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/internal/audit?kind=&person_id=&from=&to=` | List `audit_events` ascending by `created_at`. Filters optional. No PATCH/PUT/DELETE. |
| GET | `/api/internal/physios/{id}/profile` | Credentials / pricing / specialty / city JSON. |
| PUT | `/api/internal/physios/{id}/profile` | Update `credential_urls`, `price_kobo`, `specialty_tags`, `city`, `mrtb_number`. Does not set `verified`. |
| GET | `/api/internal/partners/{id}/referrals` | Patients with `referred_by_partner_id` plus `referral_fees` rows. |
| GET | `/api/internal/receipts/{booking_id}` | JSON `{amount_kobo, paid_at, patient_name, physio_name, reference}` for confirmed/completed bookings. Not HTML. |

Booking status is not advanced from these routes. Audit is read/append-only.

Other internal hooks (different headers):

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/internal/simulate_turn` | `X-Internal-Secret` |
| POST | `/api/internal/jobs/stats_digest` | `X-Internal-Job-Token` |
