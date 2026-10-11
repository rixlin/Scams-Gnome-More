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
from app.agent.voice import Alignment, TTSStream
from app.config import get_config, is_placeholder
from app.core import audio, settings_store
from app.core.session import SAMPLE_RATE, CallSession
from app.models import Utterance

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
    """One gnome reply: text streams in, audio streams out to the call.

    When the reply is voiced, its words reach the live transcript as the call plays them (timed with
    ElevenLabs' character alignment), not as Gemini writes them, which is seconds earlier.
    """

    def __init__(self, agent: "GnomeAgent", n: int) -> None:
        self.agent = agent
        self.mark = f"gnome-{n}"
        self.turn_id = self.mark
        self.text_parts: list[str] = []
        self._text_q: asyncio.Queue[str | None] = asyncio.Queue()
        cfg = get_config()
        self.voiced = not is_placeholder(cfg.elevenlabs_api_key) and bool(agent.session.voice_id)
        self._play_end = 0.0  # monotonic time when the audio sent so far finishes playing on the call
        self._spoken = ""  # characters of audio sent so far, in order
        self._reveals: list[asyncio.TimerHandle] = []
        self._record: Utterance | None = None  # this reply's entry in session.transcript
        self._played = not self.voiced  # all audio has finished playing on the call
        self._final_sent = False
        self.task = asyncio.create_task(self._run())

    def push(self, text: str) -> None:
        self.text_parts.append(text)
        self._text_q.put_nowait(text)

    def end(self) -> None:
        self._text_q.put_nowait(None)

    @property
    def text(self) -> str:
        return re.sub(r"\s+", " ", "".join(self.text_parts)).strip()

    def record(self, text: str | None = None) -> None:
        """Add the reply to the transcript. Its final live event waits until the audio has played."""
        self._record = self.agent.session.add_utterance(
            "gnome", text if text is not None else self.text, turn_id=self.turn_id, publish=False
        )
        self._publish_final_if_done()

    def interrupt(self) -> None:
        """Barge-in: stop speaking now; the transcript keeps what was written."""
        self.task.cancel()
        self._mark_played()

    def _mark_played(self) -> None:
        self._played = True
        self._publish_final_if_done()

    def _publish_final_if_done(self) -> None:
        if self._record is None or not self._played or self._final_sent:
            return
        self._final_sent = True
        for h in self._reveals:
            h.cancel()
        u = self._record
        self.agent.session.publish("transcript", {
            "speaker": "gnome", "text": u.text, "final": True, "seq": u.seq, "turn_id": self.turn_id,
        })

    def publish_partial(self, text: str) -> None:
        text = re.sub(r"\s+", " ", text).strip()
        if text and not self._final_sent:
            self.agent.session.publish("transcript", {
                "speaker": "gnome", "text": text, "final": False, "turn_id": self.turn_id,
            })

    def _schedule_reveal(self, starts_at: float, alignment: Alignment | None) -> None:
        """Publish this chunk's words at the moments the call plays them."""
        loop = asyncio.get_running_loop()
        now = time.monotonic()
        if alignment is None:
            # No timing for this chunk: show what Gemini has written so far once the chunk starts playing
            self._reveals.append(loop.call_later(max(0.0, starts_at - now), self.publish_partial, self.text))
            return
        chars, starts_ms = alignment
        base = self._spoken
        for i, ch in enumerate(chars):
            if ch.isspace() or i == len(chars) - 1:  # word by word
                at = starts_at + starts_ms[i] / 1000
                self._reveals.append(
                    loop.call_later(max(0.0, at - now), self.publish_partial, base + "".join(chars[: i + 1]))
                )
        self._spoken = base + "".join(chars)

    async def _run(self) -> None:
        session = self.agent.session
        if not self.voiced:
            # No voice configured: the reply still shows up in the transcript, it just isn't spoken
            self.agent.warn_once("tts", "ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID not set; the gnome can't speak yet")
            session.set_state("listening")
            return
        tts = TTSStream(session.voice_id)
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
            self._mark_played()
        finally:
            if pump is not None:
                pump.cancel()
            await tts.close()

    async def _pump_audio(self, tts: TTSStream) -> None:
        session = self.agent.session
        sent_any = False
        # Head start: hold the first audio until _PREBUFFER_S is ready (or the reply is shorter than that),
        # so playback never starts on a tiny chunk and then stalls while the next one is generated.
        held: list[tuple[bytes, Alignment | None]] = []
        async for ulaw, alignment in tts.audio():
            if not sent_any:
                held.append((ulaw, alignment))
                if sum(len(c) for c, _ in held) < _PREBUFFER_S * SAMPLE_RATE:
                    session.set_state("brewing")
                    continue
                await self._start_speaking()
                sent_any = True
                for chunk, al in held:
                    await self._send_audio(chunk, al)
                held.clear()
                continue
            if time.monotonic() > self._play_end and len(ulaw) < _LATE_SCRAP_S * SAMPLE_RATE:
                continue
            await self._send_audio(ulaw, alignment)
        if held:  # the whole reply was shorter than the head start
            await self._start_speaking()
            sent_any = True
            for chunk, al in held:
                await self._send_audio(chunk, al)
        if sent_any:
            # Twilio echoes this mark back once playback reaches it
            self.agent.pending_mark = self.mark
            await self.agent.send_twilio({"event": "mark", "mark": {"name": self.mark}})
        else:
            session.set_state("listening")
        # The final transcript event goes out once the last word has actually played
        asyncio.get_running_loop().call_later(max(0.0, self._play_end - time.monotonic()), self._mark_played)

    async def _start_speaking(self) -> None:
        await self.agent.wait_for_caller_silence()
        self.agent.session.set_state("responding")
        self.agent.session.set_gnome_speaking(True)

    async def _send_audio(self, ulaw: bytes, alignment: Alignment | None = None) -> None:
        session = self.agent.session
        starts_at = max(self._play_end, time.monotonic())
        self._play_end = starts_at + len(ulaw) / SAMPLE_RATE
        self._schedule_reveal(starts_at, alignment)
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
        self._last_utterance: _Utterance | None = None  # may still be playing after its turn ended
        self._caller_buf = ""
        self._caller_counter = itertools.count(1)
        self._caller_turn_id: str | None = None  # live transcript id of the caller line in progress
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
        if self._caller_turn_id is None:
            self._caller_turn_id = f"caller-{next(self._caller_counter)}"
        self._caller_buf += text
        if not self.session.gnome_speaking:
            self.session.set_state("analyzing")
        self.session.publish("transcript", {
            "speaker": "caller", "text": self._caller_buf.strip(), "final": False, "turn_id": self._caller_turn_id,
        })

    def _flush_caller(self) -> None:
        if self._caller_buf.strip():
            self.session.add_utterance("caller", self._caller_buf, turn_id=self._caller_turn_id)
        self._caller_buf = ""
        self._caller_turn_id = None

    def _new_utterance(self) -> "_Utterance":
        self._last_utterance = _Utterance(self, next(self._utt_counter))
        return self._last_utterance

    def _on_gnome_text(self, text: str) -> None:
        text = self._stage_filter.feed(text)
        if not text or (self._utterance is None and not text.strip()):
            return
        if self._utterance is None:
            self._flush_caller()
            self.session.set_state("crafting")
            self._utterance = self._new_utterance()
        self._utterance.push(text)
        if not self._utterance.voiced:
            # Nothing will be spoken, so show the text as Gemini writes it. Voiced replies are revealed
            # word by word as the call plays them (see _Utterance._schedule_reveal).
            self._utterance.publish_partial(self._utterance.text)

    def _end_gnome_turn(self) -> None:
        self._flush_caller()
        self._stage_filter.reset()
        utt, self._utterance = self._utterance, None
        if utt is None:
            return
        utt.end()
        if utt.text:
            utt.record()
            self.session.publish("gnome.response", {"text": utt.text})

    async def _barge_in(self) -> None:
        """Caller talked over the gnome: stop TTS and flush audio Twilio hasn't played yet."""
        self._stage_filter.reset()
        utt, self._utterance = self._utterance, None
        if utt is not None:
            utt.interrupt()
            if utt.text:
                utt.record(utt.text + " -")
        if self._last_utterance is not None and self._last_utterance is not utt:
            self._last_utterance.interrupt()  # an earlier reply still playing out
        self.pending_mark = None
        await self.send_twilio({"event": "clear"})
        self.session.truncate_gnome_audio()
        self.session.set_gnome_speaking(False)
        self.session.set_state("listening")

    async def _speak_stall_line(self) -> None:
        if self._utterance is not None or self.session.ended:
            return
        line = random.choice(prompts.STALL_LINES)
        utt = self._new_utterance()
        utt.push(line)
        utt.end()
        utt.record(line)
        try:
            await utt.task
        except Exception:
            log.exception("stall line TTS failed")
