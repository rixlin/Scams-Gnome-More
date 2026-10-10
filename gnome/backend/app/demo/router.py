"""Browser call simulator: fake a phone call without Twilio, using the real backend pipeline.

The page at /demo plays the part of Twilio: it opens /ws/twilio with the same
Media Streams messages Twilio would send (mic audio as 8 kHz mu-law), and watches
/ws/live/{call_id} exactly like the real frontend would.
"""

from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.config import get_config, is_placeholder
from app.core import lifecycle, registry
from app.db import repo

router = APIRouter(prefix="/demo", tags=["demo"])
_PAGE = Path(__file__).parent / "index.html"


class SayIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


@router.get("", include_in_schema=False)
async def page() -> FileResponse:
    return FileResponse(_PAGE, headers={"Cache-Control": "no-store"})


@router.get("/status")
async def status() -> dict:
    """Which services are configured (never returns secret values)."""
    cfg = get_config()
    return {
        "public_base_url": cfg.public_base_url,
        "phone_number": None if is_placeholder(cfg.twilio_phone_number) else cfg.twilio_phone_number,
        "services": {
            "gemini": {"ok": not is_placeholder(cfg.gemini_api_key),
                       "detail": f"{cfg.gemini_live_model} ({cfg.gemini_live_modality}) / {cfg.gemini_model}"},
            "elevenlabs": {"ok": not is_placeholder(cfg.elevenlabs_api_key) and bool(cfg.elevenlabs_voice_ids),
                           "detail": f"{cfg.elevenlabs_model}, {len(cfg.elevenlabs_voice_ids)} voice(s)"},
            "twilio": {"ok": not any(is_placeholder(v) for v in (cfg.twilio_account_sid, cfg.twilio_auth_token)),
                       "detail": "account SID + auth token (phone number is only used by run.py)"},
            "database": {"ok": repo.pool is not None, "detail": "Tiger Data"},
        },
    }


@router.post("/call")
async def start_simulated_call() -> dict:
    session = lifecycle.start_call(call_sid=None, caller_number="browser-simulator")
    return {"call_id": str(session.id)}


@router.post("/call/{call_id}/say")
async def say(call_id: UUID, body: SayIn) -> dict:
    session = registry.get(call_id)
    if session is None or session.agent is None:
        raise HTTPException(404, "no active simulated call")
    session.agent.say_as_caller(body.text)
    return {"ok": True}
