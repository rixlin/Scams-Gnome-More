"""Start a Cloudflare quick tunnel + the backend, wiring the new tunnel URL in automatically.

    .venv\\Scripts\\python run.py

1. Starts `cloudflared tunnel --url http://localhost:PORT` and waits for its *.trycloudflare.com URL
2. Writes that URL to PUBLIC_BASE_URL in .env
3. Points your Twilio number's voice webhook + status callback at the new URL (if Twilio keys are set)
4. Starts the FastAPI server; Ctrl+C stops both
"""

import os
import re
import shutil
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
ENV_FILE = BACKEND_DIR / ".env"
PORT = int(os.environ.get("PORT", "8000"))
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
WINDOWS_INSTALL_PATHS = [
    r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
    r"C:\Program Files\cloudflared\cloudflared.exe",
]


def find_cloudflared() -> str:
    found = shutil.which("cloudflared") or next((p for p in WINDOWS_INSTALL_PATHS if Path(p).exists()), None)
    if not found:
        sys.exit("cloudflared not found; install it or add it to PATH")
    return found


def start_tunnel() -> tuple[subprocess.Popen, str]:
    proc = subprocess.Popen(
        [find_cloudflared(), "tunnel", "--url", f"http://localhost:{PORT}"],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    url = None
    for line in proc.stdout:
        if match := URL_RE.search(line):
            url = match.group(0)
            break
    if url is None:
        sys.exit("cloudflared exited before printing a tunnel URL")
    # Keep draining cloudflared's output, otherwise the pipe fills up and it stalls
    threading.Thread(target=lambda: [None for _ in proc.stdout], daemon=True).start()
    return proc, url


def write_env(url: str) -> None:
    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    line = f"PUBLIC_BASE_URL={url}"
    if re.search(r"(?m)^PUBLIC_BASE_URL=.*$", text):
        text = re.sub(r"(?m)^PUBLIC_BASE_URL=.*$", line, text)
    else:
        text = line + "\n" + text
    ENV_FILE.write_text(text, encoding="utf-8")


def update_twilio(url: str) -> bool:
    """Point the Twilio number's webhooks at the tunnel, read them back to confirm. True on success."""
    sys.path.insert(0, str(BACKEND_DIR))
    from app.config import Config, is_placeholder

    cfg = Config()
    if any(is_placeholder(v) for v in (cfg.twilio_account_sid, cfg.twilio_auth_token, cfg.twilio_phone_number)):
        print("  Twilio keys not set; skipping webhook update")
        return True
    from twilio.rest import Client

    client = Client(cfg.twilio_account_sid, cfg.twilio_auth_token)
    want_voice, want_status = f"{url}/twilio/voice", f"{url}/twilio/status"
    last_error = None
    for attempt in range(1, 4):
        try:
            numbers = client.incoming_phone_numbers.list(phone_number=cfg.twilio_phone_number, limit=1)
            if not numbers:
                last_error = f"number {cfg.twilio_phone_number} not found on this Twilio account"
                break
            numbers[0].update(
                voice_url=want_voice, voice_method="POST",
                status_callback=want_status, status_callback_method="POST",
            )
            check = client.incoming_phone_numbers(numbers[0].sid).fetch()
            if check.voice_url == want_voice and check.status_callback == want_status:
                print(f"  Twilio webhooks for {cfg.twilio_phone_number} now point at the tunnel (verified)")
                return True
            last_error = f"Twilio still reports voice_url={check.voice_url}"
        except Exception as e:
            last_error = f"{type(e).__name__}: {e}"
        print(f"  Twilio webhook update attempt {attempt} failed: {last_error}")
        time.sleep(2)

    bar = "!" * 78
    print(f"\n{bar}\n"
          f"  CALLS WILL FAIL: could not point {cfg.twilio_phone_number} at the new tunnel.\n"
          f"  Reason: {last_error}\n"
          f"  Fix: in the Twilio console set the number's 'A call comes in' webhook to\n"
          f"       {want_voice}\n"
          f"  or run: .venv\\Scripts\\python scripts\\live_call.py --fix\n"
          f"{bar}\n")
    return False


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main() -> None:
    if port_in_use(PORT):
        sys.exit(f"Port {PORT} is already in use. Stop the other backend (or set PORT=...) and run again.")
    print("Starting Cloudflare tunnel...")
    tunnel, url = start_tunnel()
    print(f"  Tunnel URL: {url}")
    write_env(url)
    print("  Wrote PUBLIC_BASE_URL to .env")
    update_twilio(url)

    print(f"Starting backend on port {PORT} (Ctrl+C to stop)...")
    server = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=BACKEND_DIR,
    )
    try:
        server.wait()
    except KeyboardInterrupt:
        pass
    finally:
        server.terminate()
        tunnel.terminate()


if __name__ == "__main__":
    main()
