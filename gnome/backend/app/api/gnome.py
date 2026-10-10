"""Live edits to the gnome during an active call."""

from uuid import UUID

from fastapi import APIRouter, HTTPException

from app.agent import prompts
from app.core import registry
from app.core.session import CallSession
from app.models import FeedbackIn, PersonalityIn

router = APIRouter(prefix="/api/calls/{call_id}/gnome", tags=["gnome"])


def _live_session(call_id: UUID) -> CallSession:
    session = registry.get(call_id)
    if session is None:
        raise HTTPException(404, "no active call with that id")
    return session


@router.post("/feedback")
async def feedback(call_id: UUID, body: FeedbackIn) -> dict:
    session = _live_session(call_id)
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
