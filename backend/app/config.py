from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql+psycopg://joy:joy@localhost:5432/joy"
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
    joy_environment: str = "development"
    internal_api_secret: str = ""


def get_settings() -> Settings:
    return Settings()
