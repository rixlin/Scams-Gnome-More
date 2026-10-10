"""Live phone test: call your Twilio number and watch the gnome pick up.

Run while the backend + tunnel are up (`python run.py` in another terminal):

    .venv\\Scripts\\python scripts\\live_call.py           # you dial the Twilio number from your phone
    .venv\\Scripts\\python scripts\\live_call.py --auto    # Twilio places the call and plays a scripted scammer
    .venv\\Scripts\\python scripts\\live_call.py --fix     # also re-point the number's webhooks at the tunnel

Checks the setup first, then prints the pickup, live transcript and telemetry, and finally
reads the saved call back from the database.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path
from xml.sax.saxutils import escape

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402
import websockets  # noqa: E402
from twilio.rest import Client  # noqa: E402

from app.config import get_config, is_placeholder  # noqa: E402

SCAM_LINES = [
    "Hello, this is Kevin from the vehicle services department, calling about your car's extended warranty.",
    "Your warranty is about to expire. I just need to confirm your full name and date of birth.",
    "Sir, to keep your coverage active I will need your credit card number today.",
]


def ok(msg: str) -> None:
    print(f"  [ok]   {msg}")


def warn(msg: str) -> None:
    print(f"  [warn] {msg}")


def fail(msg: str) -> None:
    print(f"  [FAIL] {msg}")
    sys.exit(1)


def preflight(cfg, fix: bool) -> Client:
    print("Checking setup...")
    base = cfg.public_base_url.rstrip("/")
    if any(is_placeholder(v) for v in (cfg.twilio_account_sid, cfg.twilio_auth_token, cfg.twilio_phone_number)):
        fail("TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER must all be set in .env")
    client = Client(cfg.twilio_account_sid, cfg.twilio_auth_token)
    try:
        account = client.api.v2010.accounts(cfg.twilio_account_sid).fetch()
    except Exception as e:
        fail(f"Twilio rejected the account SID/auth token: {e}")
    ok(f"Twilio account reachable ({account.type})")
    if account.type == "Trial":
        warn("Trial account: callers hear a short Twilio trial message first, and only verified numbers can call in")

    numbers = client.incoming_phone_numbers.list(phone_number=cfg.twilio_phone_number, limit=1)
    if not numbers:
        owned = [n.phone_number for n in client.incoming_phone_numbers.list(limit=20)]
        fail(f"TWILIO_PHONE_NUMBER is not a number on this Twilio account. Numbers on the account: {owned or 'none'}. "
             "Buy/claim one in the Twilio console (Phone Numbers > Buy a number) and put it in .env as +1XXXXXXXXXX.")
    number = numbers[0]
    ok(f"Twilio number {number.phone_number} belongs to this account")

    want_voice, want_status = f"{base}/twilio/voice", f"{base}/twilio/status"
    if number.voice_url != want_voice or number.status_callback != want_status:
        if fix:
            number.update(voice_url=want_voice, voice_method="POST",
                          status_callback=want_status, status_callback_method="POST")
            ok("webhooks updated to point at the tunnel")
        else:
            fail(f"number's voice webhook is {number.voice_url!r}, expected {want_voice!r}. "
                 "Restart with run.py, or rerun this script with --fix.")
    else:
        ok("number's webhooks point at the tunnel")

    try:
        health = httpx.get(f"{base}/health", timeout=10).json()
    except Exception as e:
        fail(f"backend not reachable through the tunnel at {base} ({e}). Is run.py running?")
    ok(f"backend reachable through the tunnel (db connected: {health.get('db')})")

    if is_placeholder(cfg.gemini_api_key):
        fail("GEMINI_API_KEY not set; the gnome has no brain")
    if is_placeholder(cfg.elevenlabs_api_key) or not cfg.elevenlabs_voice_ids:
        warn("ElevenLabs not set: the gnome will pick up and reply in the transcript, but the caller hears silence")
    return client


def scammer_twiml() -> str:
    parts = ['<Response><Pause length="6"/>']
    for line in SCAM_LINES:
        parts.append(f'<Say voice="Polly.Matthew">{escape(line)}</Say><Pause length="12"/>')
    parts.append("<Hangup/></Response>")
    return "".join(parts)


async def watch(cfg, client: Client, auto: bool, timeout_s: int) -> None:
    base = cfg.public_base_url.rstrip("/")
    ws_base = cfg.public_ws_base.rstrip("/")
    async with websockets.connect(f"{ws_base}/ws/live/active") as active:
        if auto:
            call = client.calls.create(to=cfg.twilio_phone_number, from_=cfg.twilio_phone_number, twiml=scammer_twiml())
            print(f"\nPlacing a call to {cfg.twilio_phone_number} (Twilio call {call.sid}); the scammer is Twilio's robot voice...")
        else:
            print(f"\nCall {cfg.twilio_phone_number} from your phone now. Waiting up to {timeout_s}s for the gnome to pick up...")

        call_id = None
        while call_id is None:
            ev = json.loads(await asyncio.wait_for(active.recv(), timeout_s))
            if ev["type"] == "call.started":
                call_id = ev["call_id"]
                g = ev["data"]["gnome"] or {}
                print(f"\nPICKED UP. {g.get('name')} answered (caller {ev['data']['caller_number']}).")
                print(f"  Backstory: {g.get('backstory')}\n")

    last_state = None
    async with websockets.connect(f"{ws_base}/ws/live/{call_id}") as live:
        async for raw in live:
            ev = json.loads(raw)
            t, d = ev["type"], ev["data"]
            if t == "transcript" and d.get("final"):
                who = "GNOME " if d["speaker"] == "gnome" else "CALLER"
                print(f"  {who}: {d['text']}")
            elif t == "telemetry" and d["gnome_state"] != last_state:
                last_state = d["gnome_state"]
                print(f"    ({d['elapsed_s']:.0f}s, gnome is {last_state}, active speaker: {d['active_speaker']})")
            elif t == "error":
                print(f"  ! {d['source']}: {d['message']}")
            elif t == "call.ended":
                print(f"\nCall ended: {d['reason']} after {d['duration_s']:.0f}s")
                break

    await asyncio.sleep(3)
    r = httpx.get(f"{base}/api/calls/{call_id}", timeout=10)
    if r.status_code == 200:
        saved = r.json()
        print(f"Saved to Tiger Data: {len(saved['utterances'])} transcript lines, audio: {saved['has_audio']}")
    else:
        print(f"Saved call not found ({r.status_code}): {r.text[:200]}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--auto", action="store_true", help="have Twilio place the call with a scripted scammer")
    ap.add_argument("--fix", action="store_true", help="re-point the number's webhooks at the current tunnel")
    ap.add_argument("--timeout", type=int, default=120, help="seconds to wait for the call to arrive")
    args = ap.parse_args()

    cfg = get_config()
    client = preflight(cfg, args.fix)
    try:
        asyncio.run(watch(cfg, client, args.auto, args.timeout))
    except asyncio.TimeoutError:
        print("\nNo call reached the backend in time. Check the Twilio console's call logs (Monitor > Logs > Calls).")
        sys.exit(1)


if __name__ == "__main__":
    main()
