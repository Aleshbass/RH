from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://joy:joy@localhost:5432/joy"

    @field_validator("database_url", mode="before")
    @classmethod
    def _psycopg_driver(cls, value: object) -> object:
        if not isinstance(value, str):
            return value
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value.removeprefix("postgresql://")
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value.removeprefix("postgres://")
        return value
    redis_url: str = "redis://localhost:6379/0"
    gemini_api_key: str = ""
    # Keep local/default deployments on current, supported Gemini models. The
    # production environment can still override these explicitly.
    gemini_text_model: str = "gemini-3.6-flash"
    # Voice notes use generate_content; Live-only models (e.g. gemini-3.8-live) reject it.
    gemini_live_model: str = "gemini-3.6-flash"
    # Gemini remains Joy's default.  The other adapters are explicit
    # server-side fallbacks; clients never receive any provider credential.
    llm_provider: str = "gemini"
    openai_api_key: str = ""
    openai_text_model: str = "gpt-5-mini"
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_text_model: str = ""
    openrouter_fallback_models: str = ""
    llm_provider_timeout_seconds: float = 8.0
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    # Approved Meta template (one body variable {{1}}) used for messages sent more
    # than 24 hours after the person last wrote. Empty: always send plain text.
    whatsapp_update_template: str = ""
    whatsapp_update_template_language: str = "en"
    resend_api_key: str = ""
    from_email: str = ""
    from_name: str = "Rehabify Joy"
    paystack_secret_key: str = ""
    paystack_webhook_secret: str = ""
    paystack_callback_url: str = ""
    joy_environment: str = "development"
    # Local-only developer console. It is deliberately separate from the
    # production internal API secret so a local test credential cannot grant
    # access to a deployed Joy instance.
    dev_console_token: str = ""
    disable_whatsapp_delivery: bool = False
    internal_api_secret: str = ""
    internal_job_token: str = ""
    rh_api_base_url: str = ""
    rh_api_key_id: str = ""
    rh_api_hmac_secret: str = ""
    rh_convex_read_base_url: str = ""
    rh_convex_read_hmac_secret: str = ""
    # Optional operational gateway.  Unlike the read-only gateway, this key
    # can invoke a small, fixed set of RH-owned Convex mutations (for example
    # a pending booking hold).  It is never a Convex admin credential.
    rh_convex_gateway_base_url: str = ""
    rh_convex_gateway_hmac_secret: str = ""
    rh_safety_hmac_secret: str = ""
    rh_event_hmac_secret: str = ""
    # Release controls for RH-owned operational paths. They permit an
    # immediate safe disable without rolling back the deployed service.
    rh_physio_operations_enabled: bool = True
    rh_family_operations_enabled: bool = True
    rh_reconciliation_enabled: bool = True
    typesafe_api_key: str = ""
    typesafe_model: str = "jev-latest"
    typesafe_enabled: bool = False
    typesafe_shadow_mode: bool = True


def get_settings() -> Settings:
    return Settings()
