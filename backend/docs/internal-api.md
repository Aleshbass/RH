# Internal APIs (frontend team)

JSON only. No Retool UI, receipt HTML pages, or HMO export in this repo.

Auth for the routes below: header `X-Internal-Key` must match Settings `internal_api_secret` (`INTERNAL_API_SECRET`). 401 if missing, wrong, or the secret is empty.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/internal/audit?kind=&person_id=&from=&to=&limit=&offset=` | List `audit_events` ascending by `(created_at, id)`. Filters optional. Default `limit` 100, max 500. `offset` default 0. No PATCH/PUT/DELETE. |
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
| POST | `/api/internal/jobs/rh_booking_reconciliation` | `X-Internal-Job-Token` |

`rh_booking_reconciliation` should be scheduled every 10 minutes by the
production job runner. It reads RH booking status only, records the last
observed status locally, and repairs a missed confirmation notification; it
never mutates an RH booking. Set `RH_RECONCILIATION_ENABLED=false` to stop it
immediately during an RH incident.
