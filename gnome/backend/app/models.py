"""Pydantic schemas for REST bodies/responses and WebSocket events.

Keep the WS event shapes in sync with the frontend.
"""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Speaker = Literal["caller", "gnome"]
ActiveSpeaker = Literal["caller", "gnome", "none"]
GnomeState = Literal["idle", "listening", "thinking", "speaking"]


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


# ---- REST responses ----


class GnomeOut(BaseModel):
    name: str
    backstory: str | None = None
    personality: dict[str, Any] | None = None


class CallSummary(BaseModel):
    id: UUID
    twilio_call_sid: str | None
    caller_number: str | None
    gnome_name: str | None
    started_at: datetime
    ended_at: datetime | None
    duration_s: int | None
    end_reason: str | None


class CallDetail(CallSummary):
    gnome: GnomeOut | None
    utterances: list[Utterance]
    has_audio: bool


class ActiveCall(BaseModel):
    call_id: UUID
    caller_number: str | None
    gnome: Persona | None
    elapsed_s: float


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
