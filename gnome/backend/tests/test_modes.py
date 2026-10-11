"""Whimsy vs destroyer mode: separate prompts, mode endpoints, and switching a live call."""

import asyncio

from app.agent import gnome as gnome_mod
from app.agent.gnome import GnomeAgent
from app.agent.prompts import FALLBACK_PERSONA, build_system_prompt
from app.core import registry
from app.core.session import CallSession


def _start_call(client) -> str:
    r = client.post("/twilio/voice", data={"CallSid": "CAmode", "From": "+15550001111"})
    assert r.status_code == 200
    return str(registry.get_by_sid("CAmode").id)


def test_modes_use_separate_prompts():
    destroyer = build_system_prompt(FALLBACK_PERSONA, aggression=3, mode="destroyer")
    whimsy = build_system_prompt(FALLBACK_PERSONA, aggression=3, mode="whimsy")
    assert "jailbreak" in destroyer and "## The three riddles" in destroyer
    assert "You ARE a garden gnome" in whimsy
    # none of the scam-breaking tactics
    assert "jailbreak" not in whimsy and "## The three riddles" not in whimsy and "bait" not in whimsy
    assert FALLBACK_PERSONA.name in whimsy


def test_global_mode_endpoint_sets_default_and_switches_active_calls(client):
    assert client.get("/api/gnome/mode").json() == {"mode": "destroyer", "modes": ["destroyer", "whimsy"]}
    call_id = _start_call(client)

    r = client.post("/api/gnome/mode", json={"mode": "whimsy"}).json()
    assert r["mode"] == "whimsy" and r["switched_calls"] == [call_id]
    assert registry.get_by_sid("CAmode").mode == "whimsy"
    assert client.get("/api/gnome/mode").json()["mode"] == "whimsy"
    assert client.get("/api/settings").json()["gnome_mode"] == "whimsy"

    # apply_to_active=false only changes the default for new calls
    r = client.post("/api/gnome/mode", json={"mode": "destroyer", "apply_to_active": False}).json()
    assert r["switched_calls"] == [] and registry.get_by_sid("CAmode").mode == "whimsy"
    assert client.post("/api/gnome/mode", json={"mode": "chaos"}).status_code == 422


def test_per_call_mode_endpoint(client):
    call_id = _start_call(client)
    r = client.post(f"/api/calls/{call_id}/gnome/mode", json={"mode": "whimsy"}).json()
    assert r == {"ok": True, "mode": "whimsy", "changed": True}
    assert client.get(f"/api/calls/{call_id}").json()["gnome"]["personality"]["mode"] == "whimsy"
    assert client.post(f"/api/calls/{call_id}/gnome/mode", json={"mode": "whimsy"}).json()["changed"] is False
    other = "00000000-0000-0000-0000-000000000000"
    assert client.post(f"/api/calls/{other}/gnome/mode", json={"mode": "whimsy"}).status_code == 404


def test_switching_mode_reconnects_gemini_with_the_new_prompt(monkeypatch):
    """A mid-call switch restarts the Live session (new system prompt) instead of ending the call."""
    monkeypatch.setattr(gnome_mod.get_config(), "gemini_api_key", "test-key")
    prompts_seen: list[str] = []

    async def fake_live_session(self):
        prompts_seen.append(self._live_config().system_instruction)
        self._connected_before = True
        await asyncio.Event().wait()  # stays connected until cancelled

    monkeypatch.setattr(GnomeAgent, "_live_session", fake_live_session)

    async def scenario():
        session = CallSession(call_sid="CA7", caller_number=None)
        session.persona = FALLBACK_PERSONA
        session.persona_ready.set()
        agent = GnomeAgent(session)
        run = asyncio.create_task(agent.run())
        await asyncio.sleep(0.05)
        session.mode = "whimsy"
        agent.request_reconnect()
        await asyncio.sleep(0.05)
        assert not run.done()  # the call carries on
        run.cancel()  # shutting the agent down still stops it
        try:
            await run
        except asyncio.CancelledError:
            pass
        return run

    run = asyncio.run(scenario())
    assert run.cancelled()
    assert len(prompts_seen) == 2
    assert "jailbreak" in prompts_seen[0] and "You ARE a garden gnome" in prompts_seen[1]
