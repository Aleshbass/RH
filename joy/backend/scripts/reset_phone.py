"""Reset one WhatsApp number so Joy treats it as a new sender (see app/ops/reset_phone.py).

Dry run by default; applying needs the phone number typed again as confirmation.

    python scripts/reset_phone.py +2348101157557
    python scripts/reset_phone.py +2348101157557 --apply --confirm +2348101157557
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import SessionLocal
from app.ops.reset_phone import normalize_phone, reset_phone


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("phone")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm", default="")
    args = parser.parse_args()
    apply = args.apply and normalize_phone(args.confirm) == normalize_phone(args.phone)
    if args.apply and not apply:
        print("Type the same phone number after --confirm to apply. Nothing changed.")
        return 1
    with SessionLocal() as session:
        report = reset_phone(session, args.phone, apply=apply)
    print(json.dumps(report, indent=2))
    return 1 if report["refused"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
