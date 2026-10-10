import base64
import json
import re
from uuid import UUID

import numpy as np

from app.agent.prompts import FALLBACK_PERSONA, build_system_prompt
from app.core import audio, registry
from tests.conftest import AUTH


def _start_call(client) -> str:
    r = client.post("/twilio/voice", data={"CallSid": "CA123", "From": "+15550001111"})
    assert r.status_code == 200
    assert 'url="wss://gnome.test/ws/twilio"' in r.text
    return re.search(r'name="call_id" value="([0-9a-f-]+)"', r.text).group(1)


def test_health(client):
    assert client.get("/health").json()["ok"] is True


def test_auth_required(client):
    assert client.get("/api/settings").status_code == 401
    assert client.get("/api/settings", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_settings_update(client):
    r = client.post("/api/settings", json={"aggression": 5, "max_call_seconds": 600}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["aggression"] == 5
    assert client.get("/api/settings", headers=AUTH).json()["max_call_seconds"] == 600
    assert client.post("/api/settings", json={"aggression": 9}, headers=AUTH).status_code == 422


def test_history_without_db_is_503(client):
    assert client.get("/api/calls", headers=AUTH).status_code == 503


def test_live_edits_need_active_call(client):
    r = client.post(
        "/api/calls/00000000-0000-0000-0000-000000000000/gnome/feedback", json={"text": "hi"}, headers=AUTH
    )
    assert r.status_code == 404


def test_full_call_flow(client):
    call_id = _start_call(client)

    with client.websocket_connect("/ws/live/active?token=test-token") as active:
        assert json.loads(active.receive_text())["type"] == "call.started"

    with client.websocket_connect("/ws/twilio") as tw:
        tw.send_text(json.dumps({"event": "connected"}))
        tw.send_text(json.dumps({"event": "start", "start": {
            "streamSid": "MZ1", "callSid": "CA123", "customParameters": {"call_id": call_id},
        }}))
        frame = base64.b64encode(audio.pcm16_to_ulaw(np.zeros(160, np.int16))).decode()
        for _ in range(10):
            tw.send_text(json.dumps({"event": "media", "media": {"payload": frame}}))

        with client.websocket_connect(f"/ws/live/{call_id}?token=test-token") as live:
            first = json.loads(live.receive_text())
            assert first["type"] == "call.started"
            assert first["data"]["gnome"]["name"] == FALLBACK_PERSONA.name

            r = client.post(f"/api/calls/{call_id}/gnome/feedback", json={"text": "talk about turnips"},
                            headers=AUTH)
            assert r.status_code == 200
            session = registry.get(UUID(call_id))
            assert "turnips" in session.operator_notes.get_nowait()

            r = client.post(f"/api/calls/{call_id}/gnome/personality",
                            json={"personality": "grumpy pirate"}, headers=AUTH)
            assert r.status_code == 200
            assert session.personality_override == "grumpy pirate"

            active_calls = client.get("/api/calls/active", headers=AUTH).json()
            assert active_calls[0]["call_id"] == call_id

            assert client.post(f"/api/calls/{call_id}/terminate", headers=AUTH).status_code == 200
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
