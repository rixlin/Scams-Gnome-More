"""Start the Cloudflare tunnel + the backend, and point Twilio at it.

    .venv\\Scripts\\python run.py      (Windows)
    .venv/bin/python run.py          (macOS / Linux)

Named tunnel (CLOUDFLARE_TUNNEL set in .env): runs that tunnel, which serves the fixed hostname in
PUBLIC_BASE_URL, so the address never changes.
Quick tunnel (no CLOUDFLARE_TUNNEL): starts a throwaway *.trycloudflare.com tunnel and writes its new
URL to PUBLIC_BASE_URL in .env.

Either way it then points your Twilio number's webhooks at PUBLIC_BASE_URL (if Twilio keys are set)
and starts the FastAPI server. Ctrl+C stops both.
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
# Common install locations, checked when cloudflared isn't on PATH
if sys.platform == "win32":
    INSTALL_PATHS = [
        r"C:\Program Files (x86)\cloudflared\cloudflared.exe",
        r"C:\Program Files\cloudflared\cloudflared.exe",
    ]
else:
    INSTALL_PATHS = [
        "/opt/homebrew/bin/cloudflared",  # Homebrew on Apple Silicon
        "/usr/local/bin/cloudflared",     # Homebrew on Intel macs, manual installs
        "/usr/bin/cloudflared",           # .deb / .rpm packages
        str(Path.home() / ".local/bin/cloudflared"),
    ]


def find_cloudflared() -> str:
    found = shutil.which("cloudflared") or next(
        (p for p in INSTALL_PATHS if Path(p).is_file() and os.access(p, os.X_OK)), None
    )
    if not found:
        sys.exit("cloudflared not found; install it or add it to PATH "
                 "(macOS: brew install cloudflared, Linux: see "
                 "https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)")
    return found


def load_config():
    sys.path.insert(0, str(BACKEND_DIR))
    from app.config import Config

    return Config()


def start_named_tunnel(name: str) -> subprocess.Popen:
    """Run an existing named tunnel; returns once Cloudflare has registered a connection."""
    proc = subprocess.Popen(
        [find_cloudflared(), "tunnel", "--no-autoupdate", "run", "--url", f"http://localhost:{PORT}", name],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1,
    )
    output = []
    for line in proc.stdout:
        output.append(line.rstrip())
        if "Registered tunnel connection" in line:
            threading.Thread(target=lambda: [None for _ in proc.stdout], daemon=True).start()
            return proc
    sys.exit(f"cloudflared tunnel '{name}' exited before connecting:\n" + "\n".join(output[-15:]))


def start_quick_tunnel() -> tuple[subprocess.Popen, str]:
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
    venv_python = r".venv\Scripts\python" if sys.platform == "win32" else ".venv/bin/python"
    fix_script = r"scripts\live_call.py" if sys.platform == "win32" else "scripts/live_call.py"
    print(f"\n{bar}\n"
          f"  CALLS WILL FAIL: could not point {cfg.twilio_phone_number} at the new tunnel.\n"
          f"  Reason: {last_error}\n"
          f"  Fix: in the Twilio console set the number's 'A call comes in' webhook to\n"
          f"       {want_voice}\n"
          f"  or run: {venv_python} {fix_script} --fix\n"
          f"{bar}\n")
    return False


def port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0


def main() -> None:
    if port_in_use(PORT):
        sys.exit(f"Port {PORT} is already in use. Stop the other backend (or set PORT=...) and run again.")
    cfg = load_config()
    if cfg.cloudflare_tunnel:
        url = cfg.public_base_url.rstrip("/")
        if "trycloudflare.com" in url or not url.startswith("https://"):
            sys.exit(f"CLOUDFLARE_TUNNEL is set, but PUBLIC_BASE_URL is {url!r}. Set it to your tunnel's "
                     "hostname in .env, e.g. PUBLIC_BASE_URL=https://api.gnomegrove.tech")
        print(f"Starting named Cloudflare tunnel '{cfg.cloudflare_tunnel}' for {url} ...")
        tunnel = start_named_tunnel(cfg.cloudflare_tunnel)
        print("  Tunnel connected")
    else:
        print("Starting Cloudflare quick tunnel...")
        tunnel, url = start_quick_tunnel()
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
