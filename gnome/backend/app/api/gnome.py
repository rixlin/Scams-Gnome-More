"""Live edits to the gnome during an active call."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.agent import prompts
from app.core import registry, settings_store
from app.core.session import CallSession
from app.models import FeedbackIn, GnomeMode, GnomeModeIn, GnomeUpdateIn, PersonalityIn, SettingsUpdate

router = APIRouter(prefix="/api/calls/{call_id}/gnome", tags=["gnome"])
# Gnome mode for all calls: "destroyer" (break the scam caller) or "whimsy" (a sincerely whimsical gnome)
mode_router = APIRouter(prefix="/api/gnome/mode", tags=["gnome"])
MODES: list[GnomeMode] = ["destroyer", "whimsy"]


def _live_session(call_id: UUID) -> CallSession:
    session = registry.get(call_id)
    if session is None:
        raise HTTPException(404, "no active call with that id")
    return session


@router.post("/feedback")
async def feedback(call_id: UUID, body: FeedbackIn) -> dict:
    session = _live_session(call_id)
    session.add_utterance("operator", body.text)
    session.operator_notes.put_nowait(prompts.operator_note(body.text))
    session.publish("gnome.updated", {"kind": "feedback", "text": body.text})
    return {"ok": True}


@router.post("/personality")
async def personality(call_id: UUID, body: PersonalityIn) -> dict:
    session = _live_session(call_id)
    session.personality_override = body.personality
    if body.voice_id:
        session.voice_id = body.voice_id
    session.operator_notes.put_nowait(prompts.personality_note(body.personality))
    session.publish("gnome.updated", {
        "kind": "personality", "personality": body.personality, "voice_id": session.voice_id,
    })
    return {"ok": True}


@router.post("/update")
async def update_gnome(call_id: UUID, body: GnomeUpdateIn) -> dict:
    session = _live_session(call_id)
    text = body.feedback or body.instruction
    if text:
        session.add_utterance("operator", text)
        session.operator_notes.put_nowait(prompts.operator_note(text))
        session.publish("gnome.updated", {"kind": "feedback", "text": text})
    if body.personality:
        session.personality_override = body.personality
        if body.voice_id:
            session.voice_id = body.voice_id
        session.operator_notes.put_nowait(prompts.personality_note(body.personality))
        session.publish("gnome.updated", {
            "kind": "personality", "personality": body.personality, "voice_id": session.voice_id,
        })
    return {"ok": True, "success": True}


def _switch_mode(session: CallSession, mode: GnomeMode) -> bool:
    """Put a live call on the given mode's prompt. Returns False if it was already on it."""
    if session.mode == mode:
        return False
    session.mode = mode
    if session.agent is not None:
        session.agent.request_reconnect()  # Gemini Live picks up the new system prompt on reconnect
    session.publish("gnome.updated", {"kind": "mode", "mode": mode})
    return True


@router.post("/mode")
async def set_call_mode(call_id: UUID, body: GnomeModeIn) -> dict:
    """Switch one active call between destroyer and whimsy mode (same gnome, new behaviour)."""
    session = _live_session(call_id)
    changed = _switch_mode(session, body.mode)
    return {"ok": True, "mode": session.mode, "changed": changed}


@mode_router.get("")
async def get_mode() -> dict:
    return {"mode": settings_store.get()["gnome_mode"], "modes": MODES}


@mode_router.post("")
async def set_mode(body: GnomeModeIn) -> dict:
    """Set the mode new calls start in, and (by default) switch calls already in progress too."""
    await settings_store.update(SettingsUpdate(gnome_mode=body.mode))
    switched = []
    if body.apply_to_active:
        switched = [str(s.id) for s in registry.active() if _switch_mode(s, body.mode)]
    return {"ok": True, "mode": body.mode, "modes": MODES, "switched_calls": switched}
