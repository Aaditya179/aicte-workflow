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

    # MFA (§15.8). Officer routes need an aal2 token. DEMO_MFA_BYPASS lets demo officers skip it,
    # except the accounts in DEMO_MFA_ENFORCED_EMAILS, which show the full flow. Off in any real deployment.
    DEMO_MFA_BYPASS: bool = False
    DEMO_MFA_ENFORCED_EMAILS: str = "regional@demo.sih"

    # LLM (§10, §15.3)
    LLM_MODEL: str = "claude-opus-5-5"

    # Delivery channels (§15.5). Unset providers are simulated.
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_SMS_FROM: Optional[str] = None
    TWILIO_WHATSAPP_FROM: Optional[str] = None
    RESEND_WEBHOOK_SECRET: Optional[str] = None
    API_PUBLIC_URL: str = "http://localhost:8000"

    # Documents (§15.8)
    STORAGE_BUCKET: str = "documents"
    MAX_UPLOAD_BYTES: int = 10 * 1024 * 1024
    SIGNED_LINK_TTL_SECONDS: int = 300

    # Login lockout (§15.8)
    LOGIN_MAX_FAILURES: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    @property
    def mfa_enforced_emails(self) -> set:
        return {e.strip().lower() for e in self.DEMO_MFA_ENFORCED_EMAILS.split(",") if e.strip()}

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
