"""
Call Interpretation & Logging — post-turn and post-call analysis.

Classifies caller (target) behavior and records per-call metrics.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Optional


# ---------------------------------------------------------------------------
# Behavior labels
# ---------------------------------------------------------------------------

class Behavior(str, Enum):
    COMPLIANCE = "compliance"          # target is cooperating
    STALLING = "stalling"              # target is buying time
    DEFLECTION = "deflection"          # target changes subject
    DETECTION = "detection"            # target calls out the scam
    REFUSAL = "refusal"                # target flatly refuses
    UNKNOWN = "unknown"


# ---------------------------------------------------------------------------
# Turn record
# ---------------------------------------------------------------------------

@dataclass
class Turn:
    index: int
    speaker: str  # "agent" or "target"
    text: str
    timestamp: float = field(default_factory=time.time)
    behavior: Optional[Behavior] = None


# ---------------------------------------------------------------------------
# CallRecord
# ---------------------------------------------------------------------------

@dataclass
class CallRecord:
    call_sid: str
    phone_number: str
    difficulty: int
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    status: str = "in-progress"
    turns: list[Turn] = field(default_factory=list)

    # -- helpers -------------------------------------------------------------

    def add_turn(self, speaker: str, text: str, behavior: Optional[Behavior] = None) -> Turn:
        turn = Turn(
            index=len(self.turns),
            speaker=speaker,
            text=text,
            behavior=behavior,
        )
        self.turns.append(turn)
        return turn

    def complete(self, status: str = "completed") -> None:
        self.end_time = time.time()
        self.status = status

    @property
    def duration(self) -> float:
        end = self.end_time or time.time()
        return end - self.start_time

    def to_dict(self) -> dict:
        d = asdict(self)
        # Convert Behavior enums to strings for JSON serialization
        for t in d["turns"]:
            if t["behavior"] is not None:
                t["behavior"] = t["behavior"].value if isinstance(t["behavior"], Behavior) else t["behavior"]
        return d


# ---------------------------------------------------------------------------
# Interpreter
# ---------------------------------------------------------------------------

_LOG_DIR = Path(__file__).resolve().parent.parent / "call_logs"
_LOG_DIR.mkdir(exist_ok=True)


class Interpreter:
    """Lightweight turn classifier and call logger."""

    # Simple keyword heuristics — intentionally not ML-based for a hackathon.
    _KEYWORDS: dict[Behavior, list[str]] = {
        Behavior.DETECTION: ["scam", "fraud", "you're not real", "bot", "fake", "reported", "police"],
        Behavior.REFUSAL: ["no", "don't", "won't", "not giving", "stop calling", "take me off", "hang up"],
        Behavior.STALLING: ["hold on", "wait", "one moment", "let me think", "hmm", "uh"],
        Behavior.DEFLECTION: ["what's your name", "where are you calling from", "what company", "send me an email", "call me back"],
        Behavior.COMPLIANCE: ["sure", "okay", "my name is", "date of birth", "social", "last four"],
    }

    def classify_turn(self, text: str) -> Behavior:
        """Return the most likely Behavior for a target utterance."""
        lower = text.lower()
        for behavior, keywords in self._KEYWORDS.items():
            for kw in keywords:
                if kw in lower:
                    return behavior
        return Behavior.UNKNOWN

    def log_call(self, record: CallRecord) -> Path:
        """Persist a completed CallRecord to disk as JSON."""
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        path = _LOG_DIR / f"{record.call_sid}_{ts}.json"
        path.write_text(json.dumps(record.to_dict(), indent=2, default=str))
        return path

