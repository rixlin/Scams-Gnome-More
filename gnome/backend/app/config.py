import re
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
PLACEHOLDER_PREFIX = "PLACEHOLDER"


def is_placeholder(value: str | None) -> bool:
    return not value or value.startswith(PLACEHOLDER_PREFIX)


class Config(BaseSettings):
    # extra="allow" keeps unknown .env keys such as ELEVENLABS_VOICE_ID2 in model_extra
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="allow")

    # Public hostname from the Cloudflare tunnel, e.g. https://gnome.example.com
    public_base_url: str = "http://localhost:8000"
    # Name of a named Cloudflare tunnel (fixed hostname). Empty = run.py uses a throwaway quick tunnel
    cloudflare_tunnel: str = ""

    twilio_account_sid: str = "PLACEHOLDER_TWILIO_ACCOUNT_SID"
    twilio_auth_token: str = "PLACEHOLDER_TWILIO_AUTH_TOKEN"
    twilio_phone_number: str = "PLACEHOLDER_TWILIO_PHONE_NUMBER"
    twilio_validate_signature: bool = True

    gemini_api_key: str = "PLACEHOLDER_GEMINI_API_KEY"
    # Model for one-shot calls (persona generation)
    gemini_model: str = "gemini-3.5-flash-lite"
    # Model for the realtime Live API conversation
    gemini_live_model: str = "gemini-3.8-live"
    # "TEXT": Live model returns text directly (half-cascade models).
    # "AUDIO": Live model returns audio; we discard it and voice its transcript (native-audio models).
    gemini_live_modality: str = "AUDIO"

    elevenlabs_api_key: str = "PLACEHOLDER_ELEVENLABS_API_KEY"
    # One voice id or several separated by commas (numbered ELEVENLABS_VOICE_ID1, _ID2, ... also work);
    # each call gets one at random
    elevenlabs_voice_id: str = "PLACEHOLDER_ELEVENLABS_VOICE_ID"
    elevenlabs_model: str = "eleven_flash_v2_5"

    # Serve the browser call simulator at /demo (no auth; disable for anything public-facing)
    enable_demo: bool = True

    # Tiger Data service URL (postgres://...?sslmode=require)
    database_url: str = "PLACEHOLDER_DATABASE_URL"

    @property
    def elevenlabs_voice_ids(self) -> list[str]:
        raw = [self.elevenlabs_voice_id]
        numbered = {k.lower(): v for k, v in (self.model_extra or {}).items()
                    if re.fullmatch(r"elevenlabs_voice_id\d+", k, re.IGNORECASE)}
        raw += [numbered[k] for k in sorted(numbered, key=lambda k: int(k.removeprefix("elevenlabs_voice_id")))]
        ids = (v.strip() for value in raw for v in str(value).split(","))
        return list(dict.fromkeys(v for v in ids if not is_placeholder(v)))

    @property
    def public_ws_base(self) -> str:
        return self.public_base_url.replace("https://", "wss://").replace("http://", "ws://")


@lru_cache
def get_config() -> Config:
    return Config()
