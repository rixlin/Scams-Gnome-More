"""
Mock end-to-end tests for the Attack Agent.

These tests verify agent logic, interpreter classification, voice stub,
and server endpoint wiring WITHOUT requiring real API keys.
"""

from __future__ import annotations

import json
import os
import types as builtin_types
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Ensure dummy keys so modules can import without raising
# ---------------------------------------------------------------------------
os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("ELEVENLABS_API_KEY", "test-key")
os.environ.setdefault("TWILIO_ACCOUNT_SID", "ACtest")
os.environ.setdefault("TWILIO_AUTH_TOKEN", "test-token")
os.environ.setdefault("TWILIO_PHONE_NUMBER", "+10000000000")
os.environ.setdefault("BASE_WEBHOOK_URL", "http://localhost:8000")


# ===================================================================
# Agent tests
# ===================================================================

class TestAttackAgent:
    """Unit tests for AttackAgent brain logic."""

    @patch("backend.agent.genai")
    def test_opening_line_low(self, mock_genai):
        from backend.agent import AttackAgent, Difficulty
        agent = AttackAgent(difficulty=1)
        assert "Mike" in agent.opening_line
        assert agent._difficulty == Difficulty.LOW

    @patch("backend.agent.genai")
    def test_opening_line_high(self, mock_genai):
        from backend.agent import AttackAgent, Difficulty
        agent = AttackAgent(difficulty=5)
        assert "urgent" in agent.opening_line.lower()
        assert agent._difficulty == Difficulty.HIGH

    @patch("backend.agent.genai")
    def test_take_input_appends_history(self, mock_genai):
        from backend.agent import AttackAgent
        agent = AttackAgent(difficulty=3)
        agent.take_input("Hello, who is this?")
        assert len(agent._history) == 1
        assert agent._history[0].role == "user"

    @patch("backend.agent.genai")
    def test_give_output_calls_gemini(self, mock_genai):
        from backend.agent import AttackAgent

        # Mock the Gemini client response
        mock_response = MagicMock()
        mock_response.text = "Hi, I just need to verify your account real quick."
        mock_genai.Client.return_value.models.generate_content.return_value = mock_response

        agent = AttackAgent(difficulty=3)
        agent.take_input("Yeah, what do you want?")
        reply = agent.give_output()

        assert reply == "Hi, I just need to verify your account real quick."
        assert len(agent._history) == 2  # user + model
        assert agent._history[1].role == "model"

    @patch("backend.agent.genai")
    def test_reset_clears_history(self, mock_genai):
        from backend.agent import AttackAgent
        agent = AttackAgent(difficulty=2)
        agent.take_input("test")
        assert len(agent._history) == 1
        agent.reset()
        assert len(agent._history) == 0

    def test_difficulty_clamping(self):
        from backend.agent import Difficulty
        assert Difficulty.from_value(0) == Difficulty.LOW
        assert Difficulty.from_value(1) == Difficulty.LOW
        assert Difficulty.from_value(2) == Difficulty.MEDIUM
        assert Difficulty.from_value(3) == Difficulty.MEDIUM
        assert Difficulty.from_value(4) == Difficulty.HIGH
        assert Difficulty.from_value(5) == Difficulty.HIGH
        assert Difficulty.from_value(99) == Difficulty.HIGH


# ===================================================================
# Interpreter tests
# ===================================================================

class TestInterpreter:
    """Unit tests for turn classification and call logging."""

    def test_classify_detection(self):
        from backend.interpreter import Interpreter, Behavior
        interp = Interpreter()
        assert interp.classify_turn("This is a scam, I'm calling the police") == Behavior.DETECTION

    def test_classify_compliance(self):
        from backend.interpreter import Interpreter, Behavior
        interp = Interpreter()
        assert interp.classify_turn("Sure, my name is John Smith") == Behavior.COMPLIANCE

    def test_classify_stalling(self):
        from backend.interpreter import Interpreter, Behavior
        interp = Interpreter()
        assert interp.classify_turn("Hmm, hold on a second") == Behavior.STALLING

    def test_classify_deflection(self):
        from backend.interpreter import Interpreter, Behavior
        interp = Interpreter()
        assert interp.classify_turn("What company did you say you're from?") == Behavior.DEFLECTION

    def test_classify_refusal(self):
        from backend.interpreter import Interpreter, Behavior
        interp = Interpreter()
        assert interp.classify_turn("No, I won't give you that") == Behavior.REFUSAL

    def test_classify_unknown(self):
        from backend.interpreter import Interpreter, Behavior
        interp = Interpreter()
        assert interp.classify_turn("The weather is nice today") == Behavior.UNKNOWN

    def test_call_record_lifecycle(self, tmp_path):
        from backend.interpreter import Interpreter, CallRecord, Behavior
        import backend.interpreter as interp_module

        # Redirect log dir to tmp
        original_log_dir = interp_module._LOG_DIR
        interp_module._LOG_DIR = tmp_path

        try:
            interp = Interpreter()
            record = CallRecord(call_sid="test-123", phone_number="+1555", difficulty=3)
            record.add_turn("agent", "Hi there")
            record.add_turn("target", "Who is this?", Behavior.DEFLECTION)
            record.complete("completed")

            assert record.duration > 0
            assert len(record.turns) == 2

            path = interp.log_call(record)
            assert path.exists()

            data = json.loads(path.read_text())
            assert data["call_sid"] == "test-123"
            assert len(data["turns"]) == 2
        finally:
            interp_module._LOG_DIR = original_log_dir


# ===================================================================
# Server tests (using FastAPI TestClient)
# ===================================================================

class TestServer:
    """Integration tests for the FastAPI webhook endpoints."""

    @patch("backend.server._get_voice")
    @patch("backend.agent.genai")
    def test_voice_outgoing_returns_twiml(self, mock_genai, mock_voice_fn):
        from fastapi.testclient import TestClient
        from backend.server import app

        # Mock voice synth
        mock_voice = MagicMock()
        mock_voice.synthesize_url.return_value = "http://localhost:8000/audio/test.mp3"
        mock_voice_fn.return_value = mock_voice

        client = TestClient(app)
        resp = client.post(
            "/voice/outgoing?difficulty=3&to=%2B15551234567",
            data={"CallSid": "CA_test_001"},
        )
        assert resp.status_code == 200
        assert "<Response>" in resp.text
        assert "<Gather" in resp.text
        assert "<Play>" in resp.text

    @patch("backend.server._get_voice")
    @patch("backend.agent.genai")
    def test_voice_respond_processes_speech(self, mock_genai, mock_voice_fn):
        from fastapi.testclient import TestClient
        from backend.server import app, _agents, _records
        from backend.agent import AttackAgent
        from backend.interpreter import CallRecord

        # Set up mock agent in state
        mock_response = MagicMock()
        mock_response.text = "I just need your full name to proceed."
        mock_genai.Client.return_value.models.generate_content.return_value = mock_response

        agent = AttackAgent(difficulty=3)
        _agents["CA_test_002"] = agent
        _records["CA_test_002"] = CallRecord(
            call_sid="CA_test_002", phone_number="+15551234567", difficulty=3
        )

        mock_voice = MagicMock()
        mock_voice.synthesize_url.return_value = "http://localhost:8000/audio/test.mp3"
        mock_voice_fn.return_value = mock_voice

        client = TestClient(app)
        resp = client.post(
            "/voice/respond?call_sid=CA_test_002",
            data={"SpeechResult": "Who is this calling?", "CallSid": "CA_test_002"},
        )
        assert resp.status_code == 200
        assert "<Response>" in resp.text
        assert "<Gather" in resp.text

    def test_voice_status_ok(self):
        from fastapi.testclient import TestClient
        from backend.server import app

        client = TestClient(app)
        resp = client.post(
            "/voice/status",
            data={"CallSid": "CA_unknown", "CallStatus": "completed", "CallDuration": "30"},
        )
        assert resp.status_code == 200
        assert resp.text == "OK"

    def test_list_calls_empty(self):
        from fastapi.testclient import TestClient
        from backend.server import app

        client = TestClient(app)
        resp = client.get("/calls")
        assert resp.status_code == 200


# ===================================================================
# Streamlit smoke test
# ===================================================================

class TestStreamlitImport:
    """Verify the Streamlit app module can be imported without crashing."""

    def test_frontend_module_importable(self):
        """Just verify the module parses without syntax errors."""
        import importlib
        import importlib.util
        spec = importlib.util.find_spec("frontend.app")
        # Streamlit apps can't be naively imported (they run immediately),
        # so we just verify the spec is found.
        assert spec is not None, "frontend.app module should be discoverable"
