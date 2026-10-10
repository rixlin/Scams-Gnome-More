"""/ws/twilio: Twilio Media Streams (bidirectional, 8 kHz mu-law)."""

import asyncio
import base64
import json
import logging
from uuid import UUID

import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.agent.gnome import GnomeAgent
from app.core import audio, lifecycle, registry
from app.core.session import SAMPLE_RATE, CallSession

log = logging.getLogger(__name__)
router = APIRouter()

_FRONTEND_AUDIO_FRAMES = 5  # batch 20 ms frames into 100 ms chunks for the frontend


def _find_session(start: dict) -> CallSession:
    params = start.get("customParameters") or {}
    session = None
    try:
        session = registry.get(UUID(params.get("call_id", "")))
    except ValueError:
        pass
    session = session or registry.get_by_sid(start.get("callSid", ""))
    if session is None:
        # e.g. the server restarted between the webhook and the stream
        log.warning("media stream for unknown call; starting a new session")
        session = lifecycle.start_call(start.get("callSid"), None)
    return session


@router.websocket("/ws/twilio")
async def twilio_stream(ws: WebSocket) -> None:
    await ws.accept()
    send_lock = asyncio.Lock()

    async def send(msg: dict) -> None:
        async with send_lock:
            await ws.send_text(json.dumps(msg))

    session: CallSession | None = None
    agent: GnomeAgent | None = None
    frontend_buf: list[np.ndarray] = []
    end_reason = "stream_closed"

    try:
        while True:
            msg = json.loads(await ws.receive_text())
            event = msg.get("event")

            if event == "media" and session is not None and agent is not None:
                pcm = audio.ulaw_to_pcm16(base64.b64decode(msg["media"]["payload"]))
                session.add_caller_audio(pcm)
                agent.feed_caller_audio(pcm)
                frontend_buf.append(pcm)
                if len(frontend_buf) >= _FRONTEND_AUDIO_FRAMES:
                    chunk = np.concatenate(frontend_buf)
                    frontend_buf.clear()
                    session.publish("audio.caller", {
                        "pcm16": base64.b64encode(chunk.tobytes()).decode(), "sample_rate": SAMPLE_RATE,
                    })

            elif event == "start":
                session = _find_session(msg["start"])
                session.stream_sid = msg["start"]["streamSid"]
                session.send_to_twilio = send
                agent = GnomeAgent(session)
                session.agent = agent
                session.tasks.append(asyncio.create_task(agent.run()))
                log.info("media stream started for call %s", session.id)

            elif event == "mark" and agent is not None:
                agent.on_mark(msg.get("mark", {}).get("name", ""))

            elif event == "stop":
                end_reason = "caller_hangup"
                break
    except WebSocketDisconnect:
        pass
    finally:
        if session is not None:
            session.send_to_twilio = None
            await lifecycle.end_call(session, end_reason)
