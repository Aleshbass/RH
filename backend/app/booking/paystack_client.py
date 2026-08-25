import httpx

from app.config import get_settings

PAYSTACK_INITIALIZE_URL = "https://api.paystack.co/transaction/initialize"


def initialize_transaction(
    email: str, amount_kobo: int, reference: str, callback_url: str
) -> dict[str, str]:
    settings = get_settings()
    response = httpx.post(
        PAYSTACK_INITIALIZE_URL,
        headers={
            "Authorization": f"Bearer {settings.paystack_secret_key}",
            "Content-Type": "application/json",
        },
        json={
            "email": email,
            "amount": amount_kobo,
            "reference": reference,
            "callback_url": callback_url,
        },
        timeout=15.0,
    )
    response.raise_for_status()
    data = response.json()["data"]
    return {
        "authorization_url": data["authorization_url"],
        "reference": data["reference"],
    }
