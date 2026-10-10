"""LiveHub: in-memory pub/sub fan-out of live call events to frontend sockets.

Each subscriber gets its own bounded queue; when a slow client's queue is full
we drop events for that client instead of blocking the audio path.
"""

import asyncio
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from app.models import LiveEvent, LiveEventType

log = logging.getLogger(__name__)

# Lifecycle events that are also broadcast on the "active" channel
_LIFECYCLE = {"call.started", "call.ended"}
ACTIVE_CHANNEL = "active"


class LiveHub:
    def __init__(self, queue_size: int = 500) -> None:
        self._subs: dict[str, set[asyncio.Queue[str]]] = defaultdict(set)
        self._queue_size = queue_size

    def subscribe(self, channel: str) -> asyncio.Queue[str]:
        q: asyncio.Queue[str] = asyncio.Queue(self._queue_size)
        self._subs[channel].add(q)
        return q

    def unsubscribe(self, channel: str, q: asyncio.Queue[str]) -> None:
        subs = self._subs.get(channel)
        if subs is not None:
            subs.discard(q)
            if not subs:
                del self._subs[channel]

    def publish(self, call_id: UUID, type_: LiveEventType, data: dict[str, Any]) -> None:
        event = LiveEvent(type=type_, ts=datetime.now(timezone.utc), call_id=call_id, data=data)
        payload = event.model_dump_json()
        channels = [str(call_id)]
        if type_ in _LIFECYCLE:
            channels.append(ACTIVE_CHANNEL)
        for channel in channels:
            for q in self._subs.get(channel, ()):
                try:
                    q.put_nowait(payload)
                except asyncio.QueueFull:
                    log.debug("dropping %s event for slow subscriber on %s", type_, channel)


hub = LiveHub()
