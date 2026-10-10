from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PLACEHOLDER_PREFIX = "PLACEHOLDER"


def is_placeholder(value: str | None) -> bool:
    return not value or value.startswith(PLACEHOLDER_PREFIX)


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Public hostname from the Cloudflare tunnel, e.g. https://gnome.example.com
    public_base_url: str = "http://localhost:8000"

    twilio_account_sid: str = "PLACEHOLDER_TWILIO_ACCOUNT_SID"
    twilio_auth_token: str = "PLACEHOLDER_TWILIO_AUTH_TOKEN"
    twilio_phone_number: str = "PLACEHOLDER_TWILIO_PHONE_NUMBER"
    twilio_validate_signature: bool = True

    gemini_api_key: str = "PLACEHOLDER_GEMINI_API_KEY"
    # Model for one-shot calls (persona generation)
    gemini_model: str = "gemini-2.5-flash"
    # Model for the realtime Live API conversation
    gemini_live_model: str = "gemini-live-2.5-flash-preview"
    # "TEXT": Live model returns text directly (half-cascade models).
    # "AUDIO": Live model returns audio; we discard it and voice its transcript (native-audio models).
    gemini_live_modality: str = "TEXT"

    elevenlabs_api_key: str = "PLACEHOLDER_ELEVENLABS_API_KEY"
    elevenlabs_voice_id: str = "PLACEHOLDER_ELEVENLABS_VOICE_ID"
    elevenlabs_model: str = "eleven_flash_v2_5"

    # Tiger Data service URL (postgres://...?sslmode=require)
    database_url: str = "PLACEHOLDER_DATABASE_URL"

    @property
    def public_ws_base(self) -> str:
        return self.public_base_url.replace("https://", "wss://").replace("http://", "ws://")


@lru_cache
def get_config() -> Config:
    return Config()
