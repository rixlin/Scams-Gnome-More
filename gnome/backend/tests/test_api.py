import base64
import json
import re
from uuid import UUID

import numpy as np

from app.agent.prompts import FALLBACK_PERSONA, build_system_prompt
from app.core import audio, registry


def _start_call(client) -> str:
    r = client.post("/twilio/voice", data={"CallSid": "CA123", "From": "+15550001111"})
    assert r.status_code == 200
    assert 'url="wss://gnome.test/ws/twilio"' in r.text
    return re.search(r'name="call_id" value="([0-9a-f-]+)"', r.text).group(1)


def test_health(client):
    assert client.get("/health").json()["ok"] is True
    assert client.get("/api/health").json()["ok"] is True


def test_ping_endpoints(client):
    r = client.get("/api/ping")
    assert r.status_code == 200
    assert r.json()["ok"] is True
    assert r.json()["pong"] is True

    with client.websocket_connect("/ws/ping") as ws:
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "pong"
        ws.send_text("ping")
        msg2 = json.loads(ws.receive_text())
        assert msg2["type"] == "pong"
        assert msg2["received"] == "ping"

    with client.websocket_connect("/ws/live/ping") as ws_live:
        msg = json.loads(ws_live.receive_text())
        assert msg["type"] == "pong"


def test_settings_update(client):
    r = client.post("/api/settings", json={"aggression": 5, "max_call_seconds": 600})
    assert r.status_code == 200
    assert r.json()["aggression"] == 5
    assert client.get("/api/settings").json()["max_call_seconds"] == 600
    assert client.post("/api/settings", json={"aggression": 9}).status_code == 422


def test_history_without_db_is_503(client):
    assert client.get("/api/calls").status_code == 503


def test_live_edits_need_active_call(client):
    r = client.post(
        "/api/calls/00000000-0000-0000-0000-000000000000/gnome/feedback", json={"text": "hi"}
    )
    assert r.status_code == 404
    r2 = client.post(
        "/api/calls/00000000-0000-0000-0000-000000000000/gnome/update", json={"feedback": "hi"}
    )
    assert r2.status_code == 404


def test_active_call_detail_and_update(client):
    call_id = _start_call(client)
    # Active call detail returns 200 from memory even without DB
    r = client.get(f"/api/calls/{call_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == call_id
    assert data["status"] == "active"
    assert data["scammer_number"] == "+1 (555) 000-1111"  # formatted from Twilio's +15550001111

    # Combined update works
    up = client.post(f"/api/calls/{call_id}/gnome/update", json={
        "feedback": "ask about the mushrooms",
        "personality": "grouchy dwarf",
    })
    assert up.status_code == 200

    # Verify operator injection is logged in call detail transcript
    r_updated = client.get(f"/api/calls/{call_id}")
    assert r_updated.status_code == 200
    turns = r_updated.json()["transcript"]
    assert any(t["speaker"] == "operator" and "mushrooms" in t["text"] for t in turns)

    # Delete active call is forbidden
    del_res = client.delete(f"/api/calls/{call_id}")
    assert del_res.status_code == 400

    client.post(f"/api/calls/{call_id}/terminate")


def test_full_call_flow(client):
    call_id = _start_call(client)

    with client.websocket_connect("/ws/live/active") as active:
        assert json.loads(active.receive_text())["type"] == "call.started"

    with client.websocket_connect("/ws/twilio") as tw:
        tw.send_text(json.dumps({"event": "connected"}))
        tw.send_text(json.dumps({"event": "start", "start": {
            "streamSid": "MZ1", "callSid": "CA123", "customParameters": {"call_id": call_id},
        }}))
        frame = base64.b64encode(audio.pcm16_to_ulaw(np.zeros(160, np.int16))).decode()
        for _ in range(10):
            tw.send_text(json.dumps({"event": "media", "media": {"payload": frame}}))

        with client.websocket_connect(f"/ws/live/{call_id}") as live:
            first = json.loads(live.receive_text())
            assert first["type"] == "call.started"
            assert first["data"]["gnome"]["name"] == FALLBACK_PERSONA.name

            r = client.post(f"/api/calls/{call_id}/gnome/feedback", json={"text": "talk about turnips"})
            assert r.status_code == 200
            session = registry.get(UUID(call_id))
            assert "turnips" in session.operator_notes.get_nowait()

            r = client.post(f"/api/calls/{call_id}/gnome/personality",
                            json={"personality": "grumpy pirate"})
            assert r.status_code == 200
            assert session.personality_override == "grumpy pirate"

            active_calls = client.get("/api/calls/active").json()
            assert active_calls[0]["call_id"] == call_id

            assert client.post(f"/api/calls/{call_id}/terminate").status_code == 200
            types = set()
            while "call.ended" not in types:
                types.add(json.loads(live.receive_text())["type"])

    assert session.hung_up and session.ended and session.end_reason == "terminated"
    assert session.has_audio
    assert registry.get(session.id) is None


def test_system_prompt_includes_operator_notes_and_history():
    from app.models import Utterance
    from datetime import datetime, timezone

    hist = [Utterance(seq=0, ts=datetime.now(timezone.utc), speaker="caller", text="Your car warranty")]
    p = build_system_prompt(FALLBACK_PERSONA, aggression=4, personality_override="pirate", history=hist)
    assert FALLBACK_PERSONA.name in p and "pirate" in p and "CALLER: Your car warranty" in p


def test_signed_twilio_webhook_picks_up(client, monkeypatch):
    """A request signed exactly like Twilio's is answered with a media stream to the gnome."""
    from twilio.request_validator import RequestValidator

    from app.config import get_config

    cfg = get_config()
    monkeypatch.setattr(cfg, "twilio_validate_signature", True)
    monkeypatch.setattr(cfg, "twilio_auth_token", "test-auth-token")
    form = {"CallSid": "CA999", "From": "+15550002222", "To": "+15550003333", "CallStatus": "ringing"}
    signature = RequestValidator("test-auth-token").compute_signature("https://gnome.test/twilio/voice", form)

    r = client.post("/twilio/voice", data=form, headers={"X-Twilio-Signature": signature})
    assert r.status_code == 200
    assert "<Connect><Stream url=\"wss://gnome.test/ws/twilio\">" in r.text
    assert registry.get_by_sid("CA999") is not None

    forged = client.post("/twilio/voice", data={**form, "CallSid": "CA666"}, headers={"X-Twilio-Signature": signature})
    assert forged.status_code == 403
    assert registry.get_by_sid("CA666") is None


def test_each_call_gets_a_random_voice(client, monkeypatch):
    from app.config import get_config

    monkeypatch.setattr(type(get_config()), "elevenlabs_voice_ids", property(lambda self: ["voiceA", "voiceB", "voiceC"]))
    voices = set()
    for i in range(40):
        r = client.post("/twilio/voice", data={"CallSid": f"CAv{i}", "From": "+15550001111"})
        assert r.status_code == 200
        voices.add(registry.get_by_sid(f"CAv{i}").voice_id)
    assert voices == {"voiceA", "voiceB", "voiceC"}

    # A voice pinned in settings overrides the random pick
    client.post("/api/settings", json={"voice_id": "pinned"})
    client.post("/twilio/voice", data={"CallSid": "CApin", "From": "+15550001111"})
    assert registry.get_by_sid("CApin").voice_id == "pinned"
    client.post("/api/settings", json={"voice_id": None})
