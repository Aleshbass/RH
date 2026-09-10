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
    gemini_text_model: str = "gemini-2.0-flash"
    gemini_live_model: str = "gemini-2.0-flash-live"
    whatsapp_verify_token: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    paystack_secret_key: str = ""
    paystack_webhook_secret: str = ""
    paystack_callback_url: str = ""
    joy_environment: str = "development"
    internal_api_secret: str = ""
    internal_job_token: str = ""
    rh_api_base_url: str = ""
    rh_api_key_id: str = ""
    rh_api_hmac_secret: str = ""


def get_settings() -> Settings:
    return Settings()
