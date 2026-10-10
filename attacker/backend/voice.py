"""
Voice Synthesis — ElevenLabs TTS integration for telephony audio.

Converts text from the Attack Agent into a natural-sounding audio stream
suitable for Twilio playback.
"""

from __future__ import annotations

import io
import os
from pathlib import Path
from typing import Optional

from elevenlabs.client import ElevenLabs


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio_cache"
_AUDIO_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------------------
# VoiceSynth
# ---------------------------------------------------------------------------

class VoiceSynth:
    """Wrapper around ElevenLabs TTS for phone-quality audio."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        voice_id: Optional[str] = None,
    ) -> None:
        self._api_key = api_key or os.getenv("ELEVENLABS_API_KEY", "")
        self._voice_id = voice_id or os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")  # default: Adam
        if not self._api_key:
            raise EnvironmentError("ELEVENLABS_API_KEY is not set.")

        self._client = ElevenLabs(api_key=self._api_key)

    def synthesize(self, text: str) -> bytes:
        """Convert *text* to raw MP3 bytes using ElevenLabs."""
        audio_iterator = self._client.text_to_speech.convert(
            voice_id=self._voice_id,
            text=text,
            model_id="eleven_turbo_v2",
            output_format="mp3_44100_128",
        )
        # The SDK returns a generator; collect into bytes.
        buf = io.BytesIO()
        for chunk in audio_iterator:
            buf.write(chunk)
        return buf.getvalue()

    def synthesize_to_file(self, text: str, filename: str) -> Path:
        """Synthesize and write to *audio_cache/<filename>*. Returns path."""
        audio_bytes = self.synthesize(text)
        dest = _AUDIO_DIR / filename
        dest.write_bytes(audio_bytes)
        return dest

    def synthesize_url(self, text: str, filename: str, base_url: str) -> str:
        """Synthesize, cache locally, return a public URL for Twilio."""
        self.synthesize_to_file(text, filename)
        return f"{base_url.rstrip('/')}/audio/{filename}"

