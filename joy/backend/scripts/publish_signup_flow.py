"""Create, update or publish Joy's WhatsApp sign-up form (app/flows/signup_flow.py).

    python scripts/publish_signup_flow.py dump [--areas FILE]            print the Flow JSON
    python scripts/publish_signup_flow.py create [--areas FILE]          new draft; prints its id
    python scripts/publish_signup_flow.py update FLOW_ID [--areas FILE]  replace a draft's JSON
    python scripts/publish_signup_flow.py status FLOW_ID                 status, errors, preview link
    python scripts/publish_signup_flow.py publish FLOW_ID                publish (no edits after this)

The areas come from Rehabify's travel zones (operation service_areas) unless --areas points at a
saved copy. A draft can be tested on the owner's phone: set WHATSAPP_SIGNUP_FLOW_ID to its id and
WHATSAPP_SIGNUP_FLOW_MODE=draft on the Joy services, then message Joy "sign up". After publishing,
set the mode back to "published". A published form can't be changed: create a new one instead.

Needs WHATSAPP_ACCESS_TOKEN (whatsapp_business_management) and WHATSAPP_BUSINESS_ACCOUNT_ID.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.flows.signup_flow import build_signup_flow  # noqa: E402

GRAPH = "https://graph.facebook.com/v21.0"
FLOW_NAME = "Rehabify sign-up"


def _token() -> str:
    token = os.environ.get("WHATSAPP_ACCESS_TOKEN", "")
    if not token:
        raise SystemExit("WHATSAPP_ACCESS_TOKEN is not set")
    return token


def _cities(areas_file: str | None) -> list[dict]:
    if areas_file:
        data = json.loads(Path(areas_file).read_text(encoding="utf-8"))
        return list(data.get("cities") or data)
    from app.integrations.rh_client import RHActor, configured_rh_client

    result = configured_rh_client().service_areas(actor=RHActor(persona="patient", sender_phone="+2348122615453"))
    return [c for c in result.get("cities") or [] if isinstance(c, dict)]


def _flow_json(areas_file: str | None) -> str:
    return json.dumps(build_signup_flow(_cities(areas_file)), ensure_ascii=False)


def _show(response: httpx.Response) -> dict:
    try:
        data = response.json()
    except ValueError:
        data = {"raw": response.text}
    print(json.dumps(data, indent=2, ensure_ascii=False))
    if response.status_code >= 400:
        raise SystemExit(1)
    return data


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["dump", "create", "update", "status", "publish"])
    parser.add_argument("flow_id", nargs="?")
    parser.add_argument("--areas")
    parser.add_argument("--name", default=FLOW_NAME)
    args = parser.parse_args()
    headers = {"Authorization": f"Bearer {_token()}"} if args.action != "dump" else {}

    if args.action == "dump":
        print(json.dumps(json.loads(_flow_json(args.areas)), indent=2, ensure_ascii=False))
        return
    if args.action == "create":
        waba = os.environ.get("WHATSAPP_BUSINESS_ACCOUNT_ID", "")
        if not waba:
            raise SystemExit("WHATSAPP_BUSINESS_ACCOUNT_ID is not set")
        _show(httpx.post(f"{GRAPH}/{waba}/flows", headers=headers, timeout=60, json={
            "name": args.name, "categories": ["SIGN_UP"], "flow_json": _flow_json(args.areas), "publish": False,
        }))
        return
    if not args.flow_id:
        raise SystemExit("FLOW_ID is required")
    if args.action == "update":
        _show(httpx.post(
            f"{GRAPH}/{args.flow_id}/assets", headers=headers, timeout=60,
            data={"name": "flow.json", "asset_type": "FLOW_JSON"},
            files={"file": ("flow.json", _flow_json(args.areas).encode("utf-8"), "application/json")},
        ))
    elif args.action == "publish":
        _show(httpx.post(f"{GRAPH}/{args.flow_id}/publish", headers=headers, timeout=60))
    _show(httpx.get(
        f"{GRAPH}/{args.flow_id}", headers=headers, timeout=60,
        params={"fields": "id,name,status,categories,validation_errors,preview.invalidate(false)"},
    ))


if __name__ == "__main__":
    main()
