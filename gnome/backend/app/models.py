"""Pydantic schemas for REST bodies/responses and WebSocket events.

Keep the WS event shapes in sync with the frontend.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Speaker = Literal["caller", "gnome", "user", "operator"]
ActiveSpeaker = Literal["caller", "gnome", "user", "none"]
GnomeState = Literal[
    "listening",
    "analyzing",
    "crafting",
    "brewing",
    "responding",
    "idle",
    "thinking",
    "speaking",
]


class Persona(BaseModel):
    name: str
    backstory: str
    personality_traits: list[str] = Field(default_factory=list)
    speaking_quirks: list[str] = Field(default_factory=list)


class Utterance(BaseModel):
    seq: int
    ts: datetime
    speaker: Speaker
    text: str
    turn_id: str | None = None  # ties live in-progress transcript events to this utterance


# ---- REST bodies ----


class SettingsUpdate(BaseModel):
    default_personality: str | None = None
    voice_id: str | None = None
    max_call_seconds: int | None = Field(default=None, ge=30, le=7200)
    generate_new_gnome_per_call: bool | None = None
    fixed_gnome: Persona | None = None
    aggression: int | None = Field(default=None, ge=1, le=5)


class FeedbackIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class PersonalityIn(BaseModel):
    personality: str = Field(min_length=1, max_length=2000)
    voice_id: str | None = None


class GnomeUpdateIn(BaseModel):
    personality: str | None = None
    feedback: str | None = None
    instruction: str | None = None
    voice_id: str | None = None


# ---- REST responses ----


class GnomeOut(BaseModel):
    name: str
    backstory: str | None = None
    personality: dict[str, Any] | None = None


class CallSummary(BaseModel):
    id: UUID
    twilio_call_sid: str | None = None
    caller_number: str | None = None
    scammer_number: str | None = None
    region: str | None = None
    country: str | None = None
    gnome_number: str | None = None
    gnome_name: str | None = None
    started_at: datetime
    ended_at: datetime | None = None
    duration_s: int | None = None
    duration_seconds: int | None = None
    status: Literal["active", "ended"] = "ended"
    end_reason: str | None = None
    recording_url: str | None = None
    recording_status: Literal["available", "unavailable"] = "unavailable"


class CallDetail(CallSummary):
    gnome: GnomeOut | None = None
    utterances: list[Utterance] = Field(default_factory=list)
    transcript: list[Utterance] = Field(default_factory=list)
    has_audio: bool = False


class ActiveCall(BaseModel):
    id: UUID
    call_id: UUID
    caller_number: str | None = None
    scammer_number: str | None = None
    region: str | None = None
    country: str | None = None
    gnome_number: str | None = None
    gnome_name: str | None = None
    gnome: Persona | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    elapsed_s: float = 0.0
    duration_seconds: int = 0
    status: Literal["active", "ended"] = "active"


# ---- WS events (server -> frontend) ----

LiveEventType = Literal[
    "call.started",
    "call.ended",
    "audio.caller",
    "audio.gnome",
    "transcript",
    "gnome.response",
    "gnome.updated",
    "telemetry",
    "error",
]


class LiveEvent(BaseModel):
    type: LiveEventType
    ts: datetime
    call_id: UUID
    data: dict[str, Any]
