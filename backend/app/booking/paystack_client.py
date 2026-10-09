from typing import Any

import httpx

from app.config import get_settings

PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"
PAYSTACK_TRANSFER_URL = "https://api.paystack.co/transfer"


def initialize_transaction(
    email: str,
    amount_kobo: int,
    reference: str,
    callback_url: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> dict[str, str]:
    settings = get_settings()
    if not settings.paystack_secret_key:
        raise RuntimeError("Paystack is not configured")
    payload: dict[str, Any] = {
        "email": email,
        "amount": amount_kobo,
        "reference": reference,
        "callback_url": callback_url,
    }
    if metadata:
        payload["metadata"] = metadata
    response = httpx.post(
        PAYSTACK_INITIALIZE_URL,
        headers={
            "Authorization": f"Bearer {settings.paystack_secret_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=15.0,
    )
    response.raise_for_status()
    data = response.json()["data"]
    return {
        "authorization_url": data["authorization_url"],
        "reference": data["reference"],
    }


def initiate_transfer(
    amount_kobo: int, recipient: str, reference: str, reason: str = ""
) -> dict[str, str]:
    settings = get_settings()
    if not settings.paystack_secret_key:
        return {"transfer_code": f"TRF_{reference}", "reference": reference}
    response = httpx.post(
        PAYSTACK_TRANSFER_URL,
        headers={
            "Authorization": f"Bearer {settings.paystack_secret_key}",
            "Content-Type": "application/json",
        },
        json={
            "source": "balance",
            "amount": amount_kobo,
            "recipient": recipient,
            "reference": reference,
            "reason": reason,
        },
        timeout=15.0,
    )
    response.raise_for_status()
    data = response.json()["data"]
    return {
        "transfer_code": str(data.get("transfer_code") or reference),
        "reference": str(data.get("reference") or reference),
    }
