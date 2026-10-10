"""/ws/live/{call_id}: live feed for the frontend (server -> client).

/ws/live/active streams call.started / call.ended for every call so the
frontend can discover the current live session(s).
"""

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.core import registry
from app.core.hub import ACTIVE_CHANNEL, hub
from app.core.session import CallSession
from app.models import LiveEvent

router = APIRouter()


def _event(session: CallSession, type_: str, data: dict) -> str:
    return LiveEvent(type=type_, ts=datetime.now(timezone.utc), call_id=session.id, data=data).model_dump_json()


async def _pump(ws: WebSocket, channel: str, snapshot: list[str]) -> None:
    q = hub.subscribe(channel)
    try:
        for payload in snapshot:
            await ws.send_text(payload)

        async def forward() -> None:
            while True:
                await ws.send_text(await q.get())

        async def drain_client() -> None:
            # Detect disconnects; the client isn't expected to send anything
            while True:
                await ws.receive_text()

        done, pending = await asyncio.wait(
            [asyncio.create_task(forward()), asyncio.create_task(drain_client())],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in pending:
            t.cancel()
        for t in done:
            t.exception()  # retrieve (usually WebSocketDisconnect) so it isn't logged as unhandled
    except WebSocketDisconnect:
        pass
    finally:
        hub.unsubscribe(channel, q)


@router.websocket("/ws/live/{channel}")
async def live(ws: WebSocket, channel: str) -> None:
    if channel == ACTIVE_CHANNEL:
        await ws.accept()
        snapshot = [
            _event(s, "call.started", s.started_payload()) for s in registry.active() if s.persona_ready.is_set()
        ]
        await _pump(ws, ACTIVE_CHANNEL, snapshot)
        return

    try:
        session = registry.get(UUID(channel))
    except ValueError:
        session = None
    if session is None:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="no active call with that id")
        return

    await ws.accept()
    # Late joiners get the gnome identity, the transcript so far, and current telemetry
    snapshot = []
    if session.persona_ready.is_set():
        snapshot.append(_event(session, "call.started", session.started_payload()))
    snapshot += [_event(session, "transcript", {**u.model_dump(mode="json"), "final": True}) for u in session.transcript]
    snapshot.append(_event(session, "telemetry", session.telemetry()))
    await _pump(ws, str(session.id), snapshot)
