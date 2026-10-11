"""ElevenLabs streaming TTS over WebSocket, producing 8 kHz mu-law that Twilio plays directly."""

import base64
import json
import logging
from typing import AsyncIterator

import websockets

from app.config import get_config

log = logging.getLogger(__name__)

_URL = (
    "wss://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream-input"
    "?model_id={model}&output_format=ulaw_8000&sync_alignment=true"
)

# For one audio chunk: its characters, and when each one starts (ms from the start of the chunk)
Alignment = tuple[list[str], list[int]]


class TTSStream:
    """One gnome utterance: push text in as it streams from Gemini, pull mu-law audio out."""

    def __init__(self, voice_id: str) -> None:
        cfg = get_config()
        self._url = _URL.format(voice_id=voice_id, model=cfg.elevenlabs_model)
        self._key = cfg.elevenlabs_api_key
        self._ws: websockets.ClientConnection | None = None

    async def open(self) -> None:
        self._ws = await websockets.connect(self._url, additional_headers={"xi-api-key": self._key})
        await self._ws.send(json.dumps({
            "text": " ",
            "voice_settings": {"stability": 0.4, "similarity_boost": 0.8},
            # Smaller first chunks = lower time-to-first-audio on the phone
            "generation_config": {"chunk_length_schedule": [50, 90, 120, 160]},
        }))

    async def send_text(self, text: str, flush: bool = False) -> None:
        if self._ws is not None and text:
            msg = {"text": text if text.endswith(" ") else text + " "}
            if flush:
                msg["flush"] = True  # speak everything buffered now instead of waiting for more text
            await self._ws.send(json.dumps(msg))

    async def flush(self) -> None:
        if self._ws is not None:
            await self._ws.send(json.dumps({"text": " ", "flush": True}))

    async def finish(self) -> None:
        """No more text for this utterance; ElevenLabs flushes and then closes."""
        if self._ws is not None:
            await self._ws.send(json.dumps({"text": ""}))

    async def audio(self) -> AsyncIterator[tuple[bytes, Alignment | None]]:
        """Audio chunks with the timing of the characters they speak (None if ElevenLabs sent none)."""
        assert self._ws is not None
        try:
            async for raw in self._ws:
                msg = json.loads(raw)
                if msg.get("audio"):
                    a = msg.get("alignment") or {}
                    alignment = (a["chars"], a["charStartTimesMs"]) if a.get("chars") and a.get("charStartTimesMs") else None
                    yield base64.b64decode(msg["audio"]), alignment
                if msg.get("isFinal"):
                    break
                if msg.get("error"):
                    log.error("ElevenLabs error: %s", msg)
                    break
        except websockets.ConnectionClosed:
            pass

    async def close(self) -> None:
        if self._ws is not None:
            await self._ws.close()
            self._ws = None
