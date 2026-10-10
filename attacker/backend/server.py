"""
Telephony Webhook Server — FastAPI service for Twilio voice call handling.

Exposes endpoints that Twilio hits during an outbound call lifecycle.
"""

from __future__ import annotations

import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Form, Request
from fastapi.responses import PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles

from .agent import AttackAgent
from .voice import VoiceSynth
from .interpreter import Interpreter, CallRecord, Behavior

# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

load_dotenv()

app = FastAPI(title="AttackAgent Telephony Server")

# Serve cached audio files so Twilio can fetch them
_AUDIO_DIR = Path(__file__).resolve().parent.parent / "audio_cache"
_AUDIO_DIR.mkdir(exist_ok=True)
app.mount("/audio", StaticFiles(directory=str(_AUDIO_DIR)), name="audio")

# ---------------------------------------------------------------------------
# In-memory state (sufficient for a hackathon demo)
# ---------------------------------------------------------------------------

_agents: dict[str, AttackAgent] = {}      # call_sid -> agent
_records: dict[str, CallRecord] = {}      # call_sid -> CallRecord
_interpreter = Interpreter()
_voice: VoiceSynth | None = None


def _get_voice() -> VoiceSynth:
    global _voice
    if _voice is None:
        _voice = VoiceSynth()
    return _voice


def _base_url() -> str:
    return os.getenv("BASE_WEBHOOK_URL", "http://localhost:8000")


# ---------------------------------------------------------------------------
# Helper: build TwiML by hand (avoid pulling in a heavy XML lib)
# ---------------------------------------------------------------------------

def _twiml_play_and_gather(audio_url: str, action_path: str) -> str:
    """Return TwiML that plays an audio file then gathers speech input."""
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f'<Gather input="speech" action="{action_path}" '
        'speechTimeout="auto" method="POST">'
        f"<Play>{audio_url}</Play>"
        "</Gather>"
        "</Response>"
    )


def _twiml_play(audio_url: str) -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        f"<Response><Play>{audio_url}</Play></Response>"
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/voice/outgoing")
async def voice_outgoing(
    request: Request,
    CallSid: str = Form(""),
):
    """
    Called by Twilio when the outbound call connects.
    Plays the opening greeting and starts gathering speech.
    """
    call_sid = CallSid or str(uuid.uuid4())

    # Read difficulty from query params (set when initiating the call)
    difficulty = int(request.query_params.get("difficulty", "3"))

    # Spin up a fresh agent for this call
    agent = AttackAgent(difficulty=difficulty)
    _agents[call_sid] = agent
    _records[call_sid] = CallRecord(
        call_sid=call_sid,
        phone_number=request.query_params.get("to", "unknown"),
        difficulty=difficulty,
    )

    greeting = agent.opening_line
    _records[call_sid].add_turn("agent", greeting)

    # Synthesize greeting audio
    voice = _get_voice()
    audio_url = voice.synthesize_url(greeting, f"{call_sid}_greeting.mp3", _base_url())

    twiml = _twiml_play_and_gather(audio_url, f"{_base_url()}/voice/respond?call_sid={call_sid}")
    return Response(content=twiml, media_type="application/xml")


@app.post("/voice/respond")
async def voice_respond(
    request: Request,
    SpeechResult: str = Form(""),
    CallSid: str = Form(""),
):
    """
    Called by Twilio after speech is gathered.
    Feeds transcription to the agent, gets a reply, synthesizes audio.
    """
    call_sid = request.query_params.get("call_sid") or CallSid
    agent = _agents.get(call_sid)
    record = _records.get(call_sid)

    if agent is None or record is None:
        return Response(
            content='<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, something went wrong.</Say></Response>',
            media_type="application/xml",
        )

    caller_text = SpeechResult.strip()
    if not caller_text:
        # No speech detected — re-prompt
        twiml = _twiml_play_and_gather(
            f"{_base_url()}/audio/{call_sid}_greeting.mp3",
            f"{_base_url()}/voice/respond?call_sid={call_sid}",
        )
        return Response(content=twiml, media_type="application/xml")

    try:
        # Classify & log the target's turn
        behavior = _interpreter.classify_turn(caller_text)
        record.add_turn("target", caller_text, behavior)

        # Agent processes input and generates response
        agent.take_input(caller_text)
        agent_reply = agent.give_output()
        record.add_turn("agent", agent_reply)

        # Synthesize agent response
        voice = _get_voice()
        turn_idx = len(record.turns)
        audio_url = voice.synthesize_url(agent_reply, f"{call_sid}_turn{turn_idx}.mp3", _base_url())

        twiml = _twiml_play_and_gather(audio_url, f"{_base_url()}/voice/respond?call_sid={call_sid}")
        return Response(content=twiml, media_type="application/xml")
    except Exception as exc:
        print(f"[Error in voice_respond]: {exc}")
        fallback_twiml = (
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Response>'
            f'<Gather input="speech" action="{_base_url()}/voice/respond?call_sid={call_sid}" speechTimeout="auto" method="POST">'
            '<Say>Sorry, could you repeat that again?</Say>'
            '</Gather>'
            '</Response>'
        )
        return Response(content=fallback_twiml, media_type="application/xml")



@app.post("/voice/status")
async def voice_status(
    CallSid: str = Form(""),
    CallStatus: str = Form(""),
    CallDuration: str = Form("0"),
):
    """
    Twilio status callback — fires on status transitions.
    """
    record = _records.get(CallSid)
    if record:
        record.complete(status=CallStatus)
        _interpreter.log_call(record)

    return PlainTextResponse("OK")


# ---------------------------------------------------------------------------
# Utility endpoints for the Streamlit frontend
# ---------------------------------------------------------------------------

@app.get("/calls/{call_sid}/transcript")
async def get_transcript(call_sid: str):
    """Return the live transcript for a given call."""
    record = _records.get(call_sid)
    if record is None:
        return {"error": "call not found"}
    return record.to_dict()


@app.get("/calls")
async def list_calls():
    """Return all active/completed call records."""
    return {sid: r.to_dict() for sid, r in _records.items()}


@app.post("/calls/initiate")
async def initiate_call(
    request: Request,
):
    """
    Trigger an outbound call via the Twilio REST API.
    Body JSON: {"to": "+1...", "difficulty": 3}
    """
    from twilio.rest import Client as TwilioClient

    body = await request.json()
    to_number = body["to"]
    difficulty = body.get("difficulty", 3)

    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")

    try:
        client = TwilioClient(account_sid, auth_token)
        call = client.calls.create(
            to=to_number,
            from_=from_number,
            url=f"{_base_url()}/voice/outgoing?difficulty={difficulty}&to={to_number}",
            status_callback=f"{_base_url()}/voice/status",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
        )
        return {"call_sid": call.sid, "status": call.status}
    except Exception as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=str(exc))


