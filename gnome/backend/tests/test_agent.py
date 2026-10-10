"""Drive GnomeAgent turn handling with a scripted Gemini Live session and fake TTS."""

import asyncio

import numpy as np
import pytest
from google.genai import types

from app.agent import gnome as gnome_mod
from app.agent.gnome import GnomeAgent, StageDirectionFilter
from app.agent.prompts import FALLBACK_PERSONA
from app.core import audio
from app.core.session import CallSession


class FakeTTS:
    def __init__(self, voice_id=None):
        self.text = ""

    async def open(self): pass
    async def send_text(self, t): self.text += t
    async def finish(self): pass
    async def close(self): pass

    async def audio(self):
        yield audio.pcm16_to_ulaw(np.full(160, 1000, np.int16))


def _msg(**content) -> types.LiveServerMessage:
    return types.LiveServerMessage(server_content=types.LiveServerContent(**content))


class FakeLive:
    def __init__(self, turns):
        self.turns = list(turns)

    async def receive(self):
        for m in self.turns.pop(0) if self.turns else []:
            yield m


@pytest.mark.parametrize("modality", ["TEXT", "AUDIO"])
def test_turn_produces_transcript_audio_and_mark(monkeypatch, modality):
    monkeypatch.setattr(gnome_mod, "TTSStream", FakeTTS)
    cfg = gnome_mod.get_config()
    monkeypatch.setattr(cfg, "gemini_live_modality", modality)
    monkeypatch.setattr(cfg, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(cfg, "elevenlabs_voice_id", "test-voice")

    def gnome_text(t, **kw):
        if modality == "TEXT":
            return _msg(model_turn=types.Content(role="model", parts=[types.Part(text=t)]), **kw)
        return _msg(output_transcription=types.Transcription(text=t), **kw)

    turn = [
        _msg(input_transcription=types.Transcription(text="Hello, this is")),
        _msg(input_transcription=types.Transcription(text=" your bank.")),
        gnome_text("*clears thr"),
        gnome_text("oat* Oh hello!"),
        gnome_text(" *ceramic clank* Which bank?", turn_complete=True),
    ]

    async def scenario():
        session = CallSession(call_sid="CA1", caller_number=None)
        session.persona = FALLBACK_PERSONA
        sent: list[dict] = []

        async def send(msg):
            sent.append(msg)

        session.stream_sid, session.send_to_twilio = "MZ1", send
        agent = GnomeAgent(session)
        with pytest.raises(ConnectionError):  # second receive() is empty -> connection closed
            await agent._receive(FakeLive([turn]))
        await asyncio.sleep(0.05)  # let the utterance task stream its audio
        return session, agent, sent

    session, agent, sent = asyncio.run(scenario())
    assert [(u.speaker, u.text) for u in session.transcript] == [
        ("caller", "Hello, this is your bank."),
        ("gnome", "Oh hello! Which bank?"),
    ]
    assert [m["event"] for m in sent] == ["media", "mark"]
    assert all(m["streamSid"] == "MZ1" for m in sent)
    assert session.gnome_speaking and session.gnome_state == "speaking"

    agent.on_mark(sent[-1]["mark"]["name"])
    assert not session.gnome_speaking and session.gnome_state == "listening"


def test_stage_direction_filter_handles_split_spans():
    f = StageDirectionFilter()
    chunks = ["*Hollow cer", "amic thud* Hello, ", "*clears", " throat* friend!"]
    assert "".join(f.feed(c) for c in chunks) == " Hello,  friend!"
