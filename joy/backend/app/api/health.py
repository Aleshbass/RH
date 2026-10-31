from fastapi import APIRouter, Response

from app.config import get_settings

router = APIRouter()


@router.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/ready")
def ready(response: Response) -> dict[str, object]:
    """Configuration-only readiness without exposing credentials or calling paid APIs."""
    settings = get_settings()
    provider = settings.llm_provider.casefold().strip()
    provider_configured = {
        "gemini": bool(settings.gemini_api_key),
        "openai": bool(settings.openai_api_key),
        "openrouter": bool(settings.openrouter_api_key and settings.openrouter_text_model),
    }.get(provider, False)
    checks = {
        "databaseConfigured": bool(settings.database_url),
        "redisConfigured": bool(settings.redis_url),
        "llmProvider": provider_configured,
        "rhConfigured": bool(settings.rh_api_base_url and settings.rh_api_hmac_secret),
        "whatsappConfigured": bool(
            settings.disable_whatsapp_delivery
            or (settings.whatsapp_access_token and settings.whatsapp_phone_number_id)
        ),
    }
    ok = all(checks.values())
    if not ok:
        response.status_code = 503
    return {"status": "ready" if ok else "not_ready", "checks": checks}
