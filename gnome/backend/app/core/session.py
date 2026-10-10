"""CallSession: all per-call state, kept in memory until the call ends."""

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable

import numpy as np

from app.core import audio
from app.core.hub import hub
from app.models import ActiveSpeaker, GnomeState, Persona, Speaker, Utterance

SAMPLE_RATE = 8000  # Twilio media streams are 8 kHz mono mu-law
CALLER_SPEECH_RMS = 500.0  # PCM16 RMS above which we treat a caller frame as speech
CALLER_ACTIVE_HOLD_S = 0.4


@dataclass
class CallSession:
    call_sid: str | None
    caller_number: str | None
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    _started_mono: float = field(default_factory=time.monotonic)

    # Gnome identity
    persona: Persona | None = None
    persona_ready: asyncio.Event = field(default_factory=asyncio.Event)
    personality_override: str | None = None
    voice_id: str | None = None

    # Live edits waiting to be handed to the agent
    operator_notes: asyncio.Queue[str] = field(default_factory=asyncio.Queue)

    transcript: list[Utterance] = field(default_factory=list)

    # Twilio stream
    stream_sid: str | None = None
    send_to_twilio: Callable[[dict[str, Any]], Awaitable[None]] | None = None
    agent: Any = None  # GnomeAgent, attached once the media stream starts

    # Telemetry
    gnome_state: GnomeState = "idle"
    gnome_speaking: bool = False
    _last_caller_voice: float = 0.0

    # Recording: caller track is continuous; gnome track is (offset, samples) chunks
    _caller_chunks: list[np.ndarray] = field(default_factory=list)
    _caller_samples: int = 0
    _gnome_chunks: list[tuple[int, np.ndarray]] = field(default_factory=list)
    _gnome_write_pos: int = 0

    tasks: list[asyncio.Task] = field(default_factory=list)
    ended: bool = False
    end_reason: str | None = None
    ended_at: datetime | None = None
    end_lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    # ---- timing / telemetry ----

    def elapsed(self) -> float:
        return time.monotonic() - self._started_mono

    def seconds_since_caller_voice(self) -> float:
        return time.monotonic() - self._last_caller_voice

    @property
    def active_speaker(self) -> ActiveSpeaker:
        if self.gnome_speaking:
            return "gnome"
        if time.monotonic() - self._last_caller_voice < CALLER_ACTIVE_HOLD_S:
            return "caller"
        return "none"

    def telemetry(self) -> dict[str, Any]:
        return {
            "elapsed_s": round(self.elapsed(), 1),
            "active_speaker": self.active_speaker,
            "gnome_state": self.gnome_state,
        }

    def publish(self, type_, data: dict[str, Any]) -> None:
        hub.publish(self.id, type_, data)

    def set_state(self, state: GnomeState) -> None:
        if state != self.gnome_state:
            self.gnome_state = state
            self.publish("telemetry", self.telemetry())

    def set_gnome_speaking(self, speaking: bool) -> None:
        if speaking != self.gnome_speaking:
            self.gnome_speaking = speaking
            self.publish("telemetry", self.telemetry())

    def started_payload(self) -> dict[str, Any]:
        return {
            "call_id": str(self.id),
            "caller_number": self.caller_number,
            "started_at": self.started_at.isoformat(),
            "gnome": self.persona.model_dump() if self.persona else None,
            "personality_override": self.personality_override,
            "voice_id": self.voice_id,
        }

    # ---- transcript ----

    def add_utterance(self, speaker: Speaker, text: str) -> Utterance | None:
        text = text.strip()
        if not text:
            return None
        u = Utterance(seq=len(self.transcript), ts=datetime.now(timezone.utc), speaker=speaker, text=text)
        self.transcript.append(u)
        self.publish("transcript", {"speaker": speaker, "text": text, "final": True, "seq": u.seq})
        return u

    # ---- recording ----

    def add_caller_audio(self, pcm: np.ndarray) -> None:
        self._caller_chunks.append(pcm)
        self._caller_samples += pcm.size
        if audio.rms(pcm) > CALLER_SPEECH_RMS:
            was_none = self.active_speaker == "none"
            self._last_caller_voice = time.monotonic()
            if was_none:
                self.publish("telemetry", self.telemetry())

    def add_gnome_audio(self, pcm: np.ndarray) -> None:
        # TTS arrives faster than real time; queue it after whatever is still "playing"
        pos = max(self._gnome_write_pos, self._caller_samples)
        self._gnome_chunks.append((pos, pcm))
        self._gnome_write_pos = pos + pcm.size

    def truncate_gnome_audio(self) -> None:
        """Barge-in: drop gnome audio that was queued but never played."""
        cut = self._caller_samples
        kept: list[tuple[int, np.ndarray]] = []
        for offset, pcm in self._gnome_chunks:
            if offset >= cut:
                continue
            kept.append((offset, pcm[: cut - offset]))
        self._gnome_chunks = kept
        self._gnome_write_pos = min(self._gnome_write_pos, cut)

    def recording_wav(self) -> bytes:
        caller = np.concatenate(self._caller_chunks) if self._caller_chunks else np.zeros(0, np.int16)
        length = max([caller.size] + [o + p.size for o, p in self._gnome_chunks])
        gnome = np.zeros(length, dtype=np.int16)
        for offset, pcm in self._gnome_chunks:
            gnome[offset : offset + pcm.size] = pcm
        return audio.stereo_wav(caller, gnome, SAMPLE_RATE)

    @property
    def has_audio(self) -> bool:
        return self._caller_samples > 0 or bool(self._gnome_chunks)
