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
    async def send_text(self, t, flush=False): self.text += t
    async def flush(self): pass
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
        session.voice_id = "test-voice"
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


def test_gnome_waits_for_caller_silence_before_speaking(monkeypatch):
    """The gnome's first audio is held until the caller has been quiet for CALLER_SILENCE_MS."""
    import time

    monkeypatch.setattr(gnome_mod, "TTSStream", FakeTTS)
    cfg = gnome_mod.get_config()
    monkeypatch.setattr(cfg, "elevenlabs_api_key", "test-key")
    monkeypatch.setattr(cfg, "caller_silence_ms", 400)

    async def scenario():
        session = CallSession(call_sid="CA2", caller_number=None)
        session.persona, session.voice_id = FALLBACK_PERSONA, "test-voice"
        sent: list[tuple[float, dict]] = []

        async def send(msg):
            sent.append((time.monotonic(), msg))

        session.stream_sid, session.send_to_twilio = "MZ2", send
        agent = GnomeAgent(session)
        loud = np.full(160, 4000, np.int16)
        session.add_caller_audio(loud)          # caller is talking right now
        t0 = time.monotonic()
        agent._on_gnome_text("Oh hello!")
        agent._end_gnome_turn()
        await asyncio.sleep(0.2)
        session.add_caller_audio(loud)          # ...and keeps talking 200 ms later
        await asyncio.sleep(0.8)
        return t0, sent

    t0, sent = asyncio.run(scenario())
    first_media = next(t for t, m in sent if m["event"] == "media")
    # last caller sound was at ~0.2 s, so the gnome may not start before ~0.6 s
    assert first_media - t0 >= 0.55, first_media - t0


def test_tts_is_flushed_at_clause_ends_and_when_text_stalls(monkeypatch):
    """Buffered text must not sit unspoken in ElevenLabs while Gemini is slow to end its turn."""
    calls: list[tuple[str, object]] = []

    class RecordingTTS(FakeTTS):
        async def send_text(self, t, flush=False):
            calls.append(("text", (t, flush)))

        async def flush(self):
            calls.append(("flush", None))

    monkeypatch.setattr(gnome_mod, "TTSStream", RecordingTTS)
    monkeypatch.setattr(gnome_mod.get_config(), "elevenlabs_api_key", "test-key")

    async def scenario():
        session = CallSession(call_sid="CA3", caller_number=None)
        session.persona, session.voice_id = FALLBACK_PERSONA, "test-voice"
        agent = GnomeAgent(session)
        agent._on_gnome_text("My knees have been concrete,")   # clause end -> flushed with the text
        agent._on_gnome_text(" so I never drove")               # no clause end...
        await asyncio.sleep(gnome_mod._TTS_IDLE_FLUSH_S + 0.2)  # ...and nothing more arrives -> idle flush
        agent._end_gnome_turn()
        await asyncio.sleep(0.1)

    asyncio.run(scenario())
    assert calls[0] == ("text", ("My knees have been concrete,", True))
    assert calls[1] == ("text", (" so I never drove", False))
    assert calls[2] == ("flush", None)


def test_playback_gets_a_head_start_so_the_line_never_goes_quiet(monkeypatch):
    """Nothing is sent to the call until 1 s of audio is ready; then it all goes out together."""
    import time

    class SlowTTS(FakeTTS):
        async def audio(self):
            for _ in range(4):  # four 0.4 s chunks, produced 0.1 s apart
                await asyncio.sleep(0.1)
                yield audio.pcm16_to_ulaw(np.full(3200, 1000, np.int16))

    monkeypatch.setattr(gnome_mod, "TTSStream", SlowTTS)
    monkeypatch.setattr(gnome_mod.get_config(), "elevenlabs_api_key", "test-key")

    async def scenario():
        session = CallSession(call_sid="CA4", caller_number=None)
        session.persona, session.voice_id = FALLBACK_PERSONA, "test-voice"
        sent: list[tuple[float, dict]] = []

        async def send(msg):
            sent.append((time.monotonic(), msg))

        session.stream_sid, session.send_to_twilio = "MZ4", send
        agent = GnomeAgent(session)
        agent._on_gnome_text("Well hello there, giant.")
        agent._end_gnome_turn()
        await asyncio.sleep(0.8)
        return sent

    sent = asyncio.run(scenario())
    media = [t for t, m in sent if m["event"] == "media"]
    assert len(media) == 4
    # the first three chunks (1.2 s >= 1 s head start) are released together, not one by one
    assert media[2] - media[0] < 0.02
