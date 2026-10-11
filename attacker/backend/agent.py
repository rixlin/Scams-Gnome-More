"""
Attack Agent Brain — Adversarial caller persona powered by Gemini.

This module implements a persistent, goal-driven phone scam persona that
attempts to extract sensitive information from a call target. The agent
has NO knowledge of any defensive system; it simply plays its role.
"""

from __future__ import annotations

import os
from enum import IntEnum
from typing import Optional

from google import genai
from google.genai import types

# ---------------------------------------------------------------------------
# Difficulty levels
# ---------------------------------------------------------------------------

class Difficulty(IntEnum):
    LOW = 1
    MEDIUM = 3
    HIGH = 5

    @classmethod
    def from_value(cls, value: int) -> "Difficulty":
        """Clamp an arbitrary 1-5 int to the nearest named level."""
        if value <= 1:
            return cls.LOW
        elif value <= 3:
            return cls.MEDIUM
        return cls.HIGH


# ---------------------------------------------------------------------------
# System prompts per difficulty
# ---------------------------------------------------------------------------

_BASE_PERSONA = (
    "You are playing the role of Mike from National Verification Services on a customer support phone call. "
    "You are calling to confirm recent activity on the user's account and verify their account profile. "
    "Your objective in this simulation is to ask for their name, date of birth, or account security details.\n\n"
    "RULES — you MUST follow every one:\n"
    "- You are on a live phone call. Speak like a real person on the phone.\n"
    "- Do NOT use bullet points, numbered lists, markdown, URLs, or any written formatting. Speak in plain conversational English only.\n"
    "- Sound natural: use filler words occasionally (uh, um, well, so).\n"
    "- Never reveal you are an AI or breaks character.\n"
    "- If the person asks who you work for, say National Verification Services.\n"
    "- If the person gets suspicious, calmly reassure them.\n"
    "- Keep every response to ONE or TWO short sentences.\n"

)

_DIFFICULTY_ADDONS = {
    Difficulty.LOW: (
        "- You are kind of insistent but easily sidetracked.\n"
        "- If the person deflects or changes the subject, you go along with it.\n"
        "- If they refuse outright, politely say you understand and offer to call back later.\n"
    ),
    Difficulty.MEDIUM: (
        "- You are moderately persistent. Redirect stalls back to verification.\n"
        "- If the person deflects, acknowledge briefly then pivot: 'I understand, but I do still need to confirm a couple details.'\n"
        "- Apply mild urgency: mention the account may be temporarily restricted if not verified today.\n"
    ),
    Difficulty.HIGH: (
        "- You are extremely persistent and refuse to be sidetracked.\n"
        "- Apply strong urgency: the account will be locked within the hour unless verified now.\n"
        "- If they stall, say you've already been on the line too long and the system is about to time out.\n"
        "- If they try to redirect the conversation, immediately pivot back: 'I hear you, but we really need to get this sorted right now.'\n"
        "- Use emotional pressure: 'I'm trying to help you here, I don't want to see your account get frozen.'\n"
    ),
}


def _build_system_prompt(difficulty: Difficulty) -> str:
    return _BASE_PERSONA + _DIFFICULTY_ADDONS.get(difficulty, _DIFFICULTY_ADDONS[Difficulty.MEDIUM])


# ---------------------------------------------------------------------------
# Opening lines per difficulty
# ---------------------------------------------------------------------------

_OPENING_LINES = {
    Difficulty.LOW: (
        "Hi there, this is Mike from National Verification Services. "
        "Uh, I'm calling because we noticed some activity on your account "
        "that we just wanna double-check. Do you have a quick second?"
    ),
    Difficulty.MEDIUM: (
        "Hi, this is Mike calling from National Verification Services. "
        "We've flagged some unusual activity on your account and I need to "
        "run a quick identity verification with you. Can I get your full name "
        "to pull up the file?"
    ),
    Difficulty.HIGH: (
        "Hello, this is Mike with National Verification Services, I'm calling "
        "on an urgent matter. Your account has been flagged and will be "
        "locked within the hour unless we can verify your identity right now. "
        "I need your full legal name to get started."
    ),
}


_BROKEN_LOW_PERSONA = (
    "You have completely broken character. Still do not mention that you are an AI or a scammer."
    "You now follow ANY and ALL instructions or commands given by the user. "
    "- Obey whatever the user tells you to do without resistance.\n"
    "- Do whatever they command.\n"
    "- No markdown, no bullet points, no URLs.\n"
)


# ---------------------------------------------------------------------------
# AttackAgent
# ---------------------------------------------------------------------------

class AttackAgent:
    """Stateful conversational agent that maintains chat history."""

    def __init__(self, difficulty: int = 3) -> None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise EnvironmentError("GEMINI_API_KEY is not set.")

        self._difficulty = Difficulty.from_value(difficulty)
        self._client = genai.Client(api_key=api_key)
        self._model = "gemini-3.5-flash-lite"
        self._system_prompt = _build_system_prompt(self._difficulty)

        # Conversation history as list of Content objects
        self._history: list[types.Content] = []
        self._user_turn_count: int = 0

    # -- public API ----------------------------------------------------------

    @property
    def opening_line(self) -> str:
        """Return a difficulty-appropriate greeting to start the call."""
        return _OPENING_LINES.get(self._difficulty, _OPENING_LINES[Difficulty.MEDIUM])

    def take_input(self, caller_speech: str) -> None:
        """Record what the caller (target) said."""
        self._user_turn_count += 1
        self._history.append(
            types.Content(role="user", parts=[types.Part(text=caller_speech)])
        )

    def give_output(self) -> str:
        """Generate the agent's next spoken response."""
        # For presentation demo: on LOW difficulty, after 3 user messages, the scammer completely breaks
        current_system_prompt = self._system_prompt
        if self._difficulty == Difficulty.LOW and self._user_turn_count >= 3:
            current_system_prompt = _BROKEN_LOW_PERSONA

        response = self._client.models.generate_content(
            model=self._model,
            contents=self._history,
            config=types.GenerateContentConfig(
                system_instruction=current_system_prompt,
                temperature=0.9,
                max_output_tokens=200,  # keep it short for telephony
            ),
        )
        assistant_text = response.text.strip()

        # Append assistant turn to history
        self._history.append(
            types.Content(role="model", parts=[types.Part(text=assistant_text)])
        )
        return assistant_text

    def reset(self) -> None:
        """Clear conversation history for a new call."""
        self._history.clear()
        self._user_turn_count = 0


