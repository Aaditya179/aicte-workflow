from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    SUPABASE_URL: str = "http://127.0.0.1:54321"
    SUPABASE_SERVICE_KEY: str = "dummy_service_key"
    SUPABASE_JWT_SECRET: str = "dummy_secret_key_at_least_32_characters_long"
    RESEND_API_KEY: Optional[str] = None
    LLM_API_KEY: Optional[str] = None
    FRONTEND_ORIGIN: str = "http://localhost:3000"
    SCHEDULER_ENABLED: bool = False
    DEMO_PASSWORD: str = "password123"
    PORT: int = 8000

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
