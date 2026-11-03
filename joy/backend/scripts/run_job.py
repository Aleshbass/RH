"""Trigger one of Joy's internal jobs once, then exit (for a Railway cron service).

    python scripts/run_job.py rh_booking_reconciliation

Needs ``INTERNAL_JOB_TOKEN`` and ``JOY_INTERNAL_URL`` (for example the API's
private address, ``http://joy-api.railway.internal:8080``). Exits non-zero on
failure so Railway records the run as failed.
"""

from __future__ import annotations

import os
import sys

import httpx

JOBS = {"rh_booking_reconciliation", "stats_digest"}


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] not in JOBS:
        print(f"usage: run_job.py {{{'|'.join(sorted(JOBS))}}}", file=sys.stderr)
        return 2
    base = os.environ.get("JOY_INTERNAL_URL", "").rstrip("/")
    token = os.environ.get("INTERNAL_JOB_TOKEN", "")
    if not base or not token:
        print("JOY_INTERNAL_URL and INTERNAL_JOB_TOKEN are required", file=sys.stderr)
        return 2
    response = httpx.post(
        f"{base}/api/internal/jobs/{argv[1]}",
        headers={"X-Internal-Job-Token": token},
        timeout=120.0,
    )
    print(f"{argv[1]}: HTTP {response.status_code} {response.text[:300]}")
    return 0 if response.is_success else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
