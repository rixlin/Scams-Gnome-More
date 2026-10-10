import io
import wave

import numpy as np

from app.core import audio
from app.core.session import CallSession


def test_ulaw_roundtrip_is_close():
    t = np.linspace(0, 1, 8000)
    pcm = (np.sin(2 * np.pi * 440 * t) * 12000).astype(np.int16)
    back = audio.ulaw_to_pcm16(audio.pcm16_to_ulaw(pcm))
    # mu-law is lossy, but error stays within a few percent of full scale
    assert np.max(np.abs(back.astype(np.int32) - pcm)) < 800


def test_ulaw_silence_byte():
    assert audio.pcm16_to_ulaw(np.zeros(1, np.int16)) == b"\xff"
    assert audio.ulaw_to_pcm16(b"\xff")[0] == 0


def test_resample_lengths():
    pcm = np.zeros(160, np.int16)
    assert audio.resample(pcm, 8000, 16000).size == 320
    assert audio.resample(pcm, 8000, 8000).size == 160


def test_stereo_wav():
    data = audio.stereo_wav(np.ones(10, np.int16), np.ones(4, np.int16), 8000)
    with wave.open(io.BytesIO(data)) as w:
        assert (w.getnchannels(), w.getframerate(), w.getnframes()) == (2, 8000, 10)


def test_gnome_track_aligns_and_truncates():
    s = CallSession(call_sid=None, caller_number=None)
    s.add_caller_audio(np.zeros(800, np.int16))         # 100 ms of caller
    s.add_gnome_audio(np.full(1600, 7, np.int16))       # 200 ms of gnome, starts at 100 ms
    s.add_caller_audio(np.zeros(400, np.int16))         # caller barges in at 150 ms
    s.truncate_gnome_audio()
    with wave.open(io.BytesIO(s.recording_wav())) as w:
        frames = np.frombuffer(w.readframes(w.getnframes()), np.int16).reshape(-1, 2)
    gnome = frames[:, 1]
    assert gnome.size == 1200
    assert (gnome[:800] == 0).all() and (gnome[800:1200] == 7).all()
