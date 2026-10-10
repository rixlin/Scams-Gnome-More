"""Audio helpers: G.711 mu-law <-> PCM16, resampling, energy, WAV packing.

Implemented with numpy because the stdlib `audioop` module is gone in Python 3.13+.
"""

import io
import wave

import numpy as np

_BIAS = 0x84
_CLIP = 32635


def _build_decode_table() -> np.ndarray:
    u = ~np.arange(256, dtype=np.int32) & 0xFF
    sign = u & 0x80
    exponent = (u >> 4) & 0x07
    mantissa = u & 0x0F
    sample = (((mantissa << 3) + _BIAS) << exponent) - _BIAS
    return np.where(sign != 0, -sample, sample).astype(np.int16)


_DECODE = _build_decode_table()


def ulaw_to_pcm16(data: bytes) -> np.ndarray:
    return _DECODE[np.frombuffer(data, dtype=np.uint8)]


def pcm16_to_ulaw(samples: np.ndarray) -> bytes:
    s = samples.astype(np.int32)
    sign = np.where(s < 0, 0x80, 0)
    s = np.minimum(np.abs(s), _CLIP) + _BIAS
    exponent = np.floor(np.log2(s)).astype(np.int32) - 7
    exponent = np.clip(exponent, 0, 7)
    mantissa = (s >> (exponent + 3)) & 0x0F
    return (~(sign | (exponent << 4) | mantissa) & 0xFF).astype(np.uint8).tobytes()


def resample(samples: np.ndarray, src_rate: int, dst_rate: int) -> np.ndarray:
    if src_rate == dst_rate or samples.size == 0:
        return samples.astype(np.int16)
    n_out = int(round(samples.size * dst_rate / src_rate))
    x_old = np.arange(samples.size)
    x_new = np.linspace(0, samples.size - 1, n_out)
    return np.interp(x_new, x_old, samples.astype(np.float32)).astype(np.int16)


def rms(samples: np.ndarray) -> float:
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(samples.astype(np.float32) ** 2)))


def stereo_wav(left: np.ndarray, right: np.ndarray, rate: int) -> bytes:
    n = max(left.size, right.size)
    frames = np.zeros((n, 2), dtype=np.int16)
    frames[: left.size, 0] = left
    frames[: right.size, 1] = right
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames.tobytes())
    return buf.getvalue()


def stereo_to_mono_wav(data: bytes) -> bytes:
    with wave.open(io.BytesIO(data)) as w:
        rate, channels = w.getframerate(), w.getnchannels()
        frames = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    if channels == 2:
        frames = frames.reshape(-1, 2).astype(np.int32).sum(axis=1).clip(-32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(frames.tobytes())
    return buf.getvalue()
