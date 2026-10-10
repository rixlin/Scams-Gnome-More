"""GnomeAgent: caller audio -> Gemini Live (brain) -> ElevenLabs (voice) -> Twilio.

Gemini handles turn-taking and speech recognition; its text reply is streamed into
ElevenLabs TTS, and the resulting mu-law audio is sent straight back to the call.
"""

import asyncio
import base64
import itertools
import logging
import random
import re
import time

import numpy as np
from google.genai import types

from app.agent import llm, prompts
from app.agent.voice import TTSStream
from app.config import get_config, is_placeholder
from app.core import audio, settings_store
from app.core.session import SAMPLE_RATE, CallSession

log = logging.getLogger(__name__)

GEMINI_INPUT_RATE = 16000
_FRAMES_PER_SEND = 5  # 5 x 20 ms Twilio frames = 100 ms per Gemini audio message
_RECONNECT_BACKOFF_S = (1, 2, 5, 10)
# ElevenLabs holds text until it has a batch of characters. Gemini's end-of-turn can come many seconds
# after its last words, so without flushing, the tail of a sentence sits unspoken and the caller hears a
# long silence mid-reply. Flush at clause ends, and whenever no new text has arrived for a moment.
_CLAUSE_END = re.compile(r"[.!?,;:\u2014\u2026]\s*$")
_TTS_IDLE_FLUSH_S = 0.35
# Seconds of gnome audio buffered before playback starts, so the line never goes quiet mid-sentence
_PREBUFFER_S = 1.0
# A scrap of audio this short that arrives after the gnome already went quiet is dropped, so the caller
# doesn't hear a stray blip once they have started talking
_LATE_SCRAP_S = 0.15


class StageDirectionFilter:
    """Drops *stage directions* from streamed text, even when a span is split across chunks."""

    def __init__(self) -> None:
        self.inside = False

    def feed(self, chunk: str) -> str:
        out = []
        for ch in chunk:
            if ch == "*":
                self.inside = not self.inside
            elif not self.inside:
                out.append(ch)
        return "".join(out)

    def reset(self) -> None:
        self.inside = False


class _Utterance:
    """One gnome reply: text streams in, audio streams out to the call."""

    def __init__(self, agent: "GnomeAgent", n: int) -> None:
        self.agent = agent
        self.mark = f"gnome-{n}"
        self.text_parts: list[str] = []
        self._text_q: asyncio.Queue[str | None] = asyncio.Queue()
        self.task = asyncio.create_task(self._run())

    def push(self, text: str) -> None:
        self.text_parts.append(text)
        self._text_q.put_nowait(text)

    def end(self) -> None:
        self._text_q.put_nowait(None)

    @property
    def text(self) -> str:
        return re.sub(r"\s+", " ", "".join(self.text_parts)).strip()

    async def _run(self) -> None:
        session = self.agent.session
        cfg = get_config()
        voice_id = session.voice_id
        if is_placeholder(cfg.elevenlabs_api_key) or not voice_id:
            # No voice configured: the reply still shows up in the transcript, it just isn't spoken
            self.agent.warn_once("tts", "ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not set; the gnome can't speak yet")
            session.set_state("listening")
            return
        tts = TTSStream(voice_id)
        pump: asyncio.Task | None = None
        try:
            await tts.open()
            pump = asyncio.create_task(self._pump_audio(tts))
            pending = False  # text sent to ElevenLabs but not flushed yet
            while True:
                try:
                    chunk = await asyncio.wait_for(self._text_q.get(), _TTS_IDLE_FLUSH_S if pending else None)
                except TimeoutError:
                    await tts.flush()
                    pending = False
                    continue
                if chunk is None:
                    break
                flush = bool(_CLAUSE_END.search(chunk))
                await tts.send_text(chunk, flush=flush)
                pending = not flush
            await tts.finish()
            await pump
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.exception("TTS failed for call %s", session.id)
            session.publish("error", {"source": "tts", "message": str(e)})
            session.set_state("listening")
        finally:
            if pump is not None:
                pump.cancel()
            await tts.close()

    async def _pump_audio(self, tts: TTSStream) -> None:
        session = self.agent.session
        sent_any = False
        # Head start: hold the first audio until _PREBUFFER_S is ready (or the reply is shorter than that),
        # so playback never starts on a tiny chunk and then stalls while the next one is generated.
        held: list[bytes] = []
        self._play_end = 0.0  # monotonic time when the audio sent so far finishes playing on the call
        async for ulaw in tts.audio():
            if not sent_any:
                held.append(ulaw)
                if sum(map(len, held)) < _PREBUFFER_S * SAMPLE_RATE:
                    continue
                await self._start_speaking()
                sent_any = True
                for chunk in held:
                    await self._send_audio(chunk)
                held.clear()
                continue
            if time.monotonic() > self._play_end and len(ulaw) < _LATE_SCRAP_S * SAMPLE_RATE:
                continue
            await self._send_audio(ulaw)
        if held:  # the whole reply was shorter than the head start
            await self._start_speaking()
            sent_any = True
            for chunk in held:
                await self._send_audio(chunk)
        if sent_any:
            # Twilio echoes this mark back once playback reaches it
            self.agent.pending_mark = self.mark
            await self.agent.send_twilio({"event": "mark", "mark": {"name": self.mark}})
        else:
            session.set_state("listening")

    async def _start_speaking(self) -> None:
        await self.agent.wait_for_caller_silence()
        self.agent.session.set_state("speaking")
        self.agent.session.set_gnome_speaking(True)

    async def _send_audio(self, ulaw: bytes) -> None:
        session = self.agent.session
        self._play_end = max(self._play_end, time.monotonic()) + len(ulaw) / SAMPLE_RATE
        pcm = audio.ulaw_to_pcm16(ulaw)
        session.add_gnome_audio(pcm)
        await self.agent.send_twilio({"event": "media", "media": {"payload": base64.b64encode(ulaw).decode()}})
        session.publish("audio.gnome", {
            "pcm16": base64.b64encode(pcm.tobytes()).decode(), "sample_rate": SAMPLE_RATE,
        })


class GnomeAgent:
    def __init__(self, session: CallSession) -> None:
        self.session = session
        self.pending_mark: str | None = None
        self._audio_q: asyncio.Queue[bytes] = asyncio.Queue(maxsize=50)
        self._caller_text_q: asyncio.Queue[str] = asyncio.Queue()
        self._warned: set[str] = set()
        self._frame_buf: list[np.ndarray] = []
        self._utterance: _Utterance | None = None
        self._utt_counter = itertools.count(1)
        self._caller_buf = ""
        self._connected_before = False  # reconnects carry the transcript so far
        self._stage_filter = StageDirectionFilter()

    # ---- inputs from the Twilio socket ----

    def feed_caller_audio(self, pcm8k: np.ndarray) -> None:
        self._frame_buf.append(pcm8k)
        if len(self._frame_buf) < _FRAMES_PER_SEND:
            return
        chunk = audio.resample(np.concatenate(self._frame_buf), SAMPLE_RATE, GEMINI_INPUT_RATE)
        self._frame_buf.clear()
        try:
            self._audio_q.put_nowait(chunk.tobytes())
        except asyncio.QueueFull:
            pass  # Gemini is disconnected/reconnecting; drop audio rather than lag behind

    def say_as_caller(self, text: str) -> None:
        """Typed caller input (call simulator), used instead of speech."""
        self._caller_text_q.put_nowait(text)

    def warn_once(self, source: str, message: str) -> None:
        if source not in self._warned:
            self._warned.add(source)
            log.warning("call %s: %s", self.session.id, message)
            self.session.publish("error", {"source": source, "message": message})

    async def wait_for_caller_silence(self) -> None:
        """Hold the gnome's reply until the caller has been quiet for CALLER_SILENCE_MS.

        Gemini's own turn detection is set to the same silence, but it sometimes decides the caller is done
        early; this checks the caller's actual audio level before the gnome makes a sound.
        """
        need = get_config().caller_silence_ms / 1000
        while (quiet := self.session.seconds_since_caller_voice()) < need:
            await asyncio.sleep(need - quiet)

    def on_mark(self, name: str) -> None:
        if name == self.pending_mark:
            self.pending_mark = None
            self.session.set_gnome_speaking(False)
            if self._utterance is None:
                self.session.set_state("listening")

    async def send_twilio(self, msg: dict) -> None:
        s = self.session
        if s.send_to_twilio is not None and s.stream_sid is not None:
            await s.send_to_twilio({**msg, "streamSid": s.stream_sid})

    # ---- main loop ----

    async def run(self) -> None:
        await self.session.persona_ready.wait()
        self.session.set_state("listening")
        if is_placeholder(get_config().gemini_api_key):
            self.warn_once("llm", "GEMINI_API_KEY not set; the gnome can't think yet")
            return
        attempt = 0
        while not self.session.ended:
            try:
                await self._live_session()
                attempt = 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                log.exception("Gemini Live session failed for call %s", self.session.id)
                self.session.publish("error", {"source": "llm", "message": str(e)})
                await self._speak_stall_line()
                await asyncio.sleep(_RECONNECT_BACKOFF_S[min(attempt, len(_RECONNECT_BACKOFF_S) - 1)])
                attempt += 1

    async def close(self) -> None:
        if self._utterance is not None:
            self._utterance.task.cancel()

    def _live_config(self) -> types.LiveConnectConfig:
        cfg = get_config()
        st = settings_store.get()
        s = self.session
        system = prompts.build_system_prompt(
            s.persona,
            aggression=st["aggression"],
            default_personality=st["default_personality"],
            personality_override=s.personality_override,
            history=s.transcript if self._connected_before else None,
        )
        modality = cfg.gemini_live_modality.upper()
        return types.LiveConnectConfig(
            response_modalities=[types.Modality(modality)],
            system_instruction=system,
            input_audio_transcription=types.AudioTranscriptionConfig(),
            output_audio_transcription=types.AudioTranscriptionConfig() if modality == "AUDIO" else None,
            realtime_input_config=types.RealtimeInputConfig(
                # Only treat the caller's turn as over after this much silence
                automatic_activity_detection=types.AutomaticActivityDetection(
                    silence_duration_ms=cfg.caller_silence_ms,
                ),
                # The caller talking over the gnome doesn't cut him off; he finishes his thought first
                activity_handling=types.ActivityHandling.NO_INTERRUPTION,
            ),
        )

    async def _live_session(self) -> None:
        cfg = get_config()
        async with llm.client().aio.live.connect(model=cfg.gemini_live_model, config=self._live_config()) as live:
            log.info("Gemini Live connected for call %s", self.session.id)
            # No greeting: the gnome stays quiet until the caller has spoken and finished their thought
            self._connected_before = True
            async with asyncio.TaskGroup() as tg:
                tg.create_task(self._send_audio(live))
                tg.create_task(self._send_caller_text(live))
                tg.create_task(self._send_operator_notes(live))
                tg.create_task(self._receive(live))

    async def _send_audio(self, live) -> None:
        while True:
            data = await self._audio_q.get()
            await live.send_realtime_input(
                audio=types.Blob(data=data, mime_type=f"audio/pcm;rate={GEMINI_INPUT_RATE}")
            )

    async def _send_caller_text(self, live) -> None:
        while True:
            text = await self._caller_text_q.get()
            self._flush_caller()
            self.session.add_utterance("caller", text)
            await live.send_realtime_input(text=text)

    async def _send_operator_notes(self, live) -> None:
        while True:
            note = await self.session.operator_notes.get()
            await live.send_client_content(
                turns=types.Content(role="user", parts=[types.Part(text=note)]), turn_complete=False
            )

    async def _receive(self, live) -> None:
        text_mode = get_config().gemini_live_modality.upper() == "TEXT"
        while True:
            got_any = False
            async for msg in live.receive():
                got_any = True
                sc = msg.server_content
                if msg.go_away is not None:
                    log.info("Gemini go_away for call %s; will reconnect", self.session.id)
                if sc is None:
                    continue
                if sc.input_transcription and sc.input_transcription.text:
                    self._on_caller_text(sc.input_transcription.text)
                if sc.interrupted:
                    await self._barge_in()
                if text_mode:
                    if sc.model_turn and sc.model_turn.parts:
                        for part in sc.model_turn.parts:
                            if part.text and not part.thought:
                                self._on_gnome_text(part.text)
                elif sc.output_transcription and sc.output_transcription.text:
                    self._on_gnome_text(sc.output_transcription.text)
                if sc.turn_complete:
                    self._end_gnome_turn()
            if not got_any:
                raise ConnectionError("Gemini Live connection closed")

    # ---- turn handling ----

    def _on_caller_text(self, text: str) -> None:
        self._caller_buf += text
        if not self.session.gnome_speaking:
            self.session.set_state("listening")
        self.session.publish("transcript", {"speaker": "caller", "text": self._caller_buf.strip(), "final": False})

    def _flush_caller(self) -> None:
        if self._caller_buf.strip():
            self.session.add_utterance("caller", self._caller_buf)
        self._caller_buf = ""

    def _on_gnome_text(self, text: str) -> None:
        text = self._stage_filter.feed(text)
        if not text or (self._utterance is None and not text.strip()):
            return
        if self._utterance is None:
            self._flush_caller()
            self.session.set_state("thinking")
            self._utterance = _Utterance(self, next(self._utt_counter))
        self._utterance.push(text)
        self.session.publish("transcript", {"speaker": "gnome", "text": self._utterance.text, "final": False})

    def _end_gnome_turn(self) -> None:
        self._flush_caller()
        self._stage_filter.reset()
        utt, self._utterance = self._utterance, None
        if utt is None:
            return
        utt.end()
        if utt.text:
            self.session.add_utterance("gnome", utt.text)
            self.session.publish("gnome.response", {"text": utt.text})

    async def _barge_in(self) -> None:
        """Caller talked over the gnome: stop TTS and flush audio Twilio hasn't played yet."""
        self._stage_filter.reset()
        utt, self._utterance = self._utterance, None
        if utt is not None:
            utt.task.cancel()
            if utt.text:
                self.session.add_utterance("gnome", utt.text + " -")
        self.pending_mark = None
        await self.send_twilio({"event": "clear"})
        self.session.truncate_gnome_audio()
        self.session.set_gnome_speaking(False)
        self.session.set_state("listening")

    async def _speak_stall_line(self) -> None:
        if self._utterance is not None or self.session.ended:
            return
        line = random.choice(prompts.STALL_LINES)
        utt = _Utterance(self, next(self._utt_counter))
        utt.push(line)
        utt.end()
        self.session.add_utterance("gnome", line)
        try:
            await utt.task
        except Exception:
            log.exception("stall line TTS failed")
