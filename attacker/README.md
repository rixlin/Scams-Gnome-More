# 🎭 Attack Agent — Adversarial Caller AI

An adversarial phone-call agent for testing scam-defense systems.
Built for HackRU Fall 2026.

## Architecture

```
attacker/
├── backend/
│   ├── agent.py         # Gemini-powered adversarial brain
│   ├── voice.py         # ElevenLabs TTS for phone audio
│   ├── server.py        # FastAPI + Twilio webhook server
│   └── interpreter.py   # Turn classifier & call logger
├── frontend/
│   └── app.py           # Streamlit control panel
├── tests/
│   └── test_agent.py    # Mock end-to-end tests
├── .env.example
├── requirements.txt
├── run_tunnel.sh
└── tunnel_guide.md
```

## Quick Start

### Option A: One-Command Launcher (Recommended)
Starts the Cloudflare tunnel, auto-updates `BASE_WEBHOOK_URL` in `.env`, starts the FastAPI backend, and launches the Streamlit frontend all together:

```bash
cd attacker
./run.sh
```
Press `Ctrl+C` to stop all services simultaneously.

---

### Option B: Manual (Separate Terminals)

```bash
# 1 — Start the webhook server
uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload

# 2 — Start the Cloudflare tunnel
./run_tunnel.sh
# copy generated trycloudflare.com URL into .env as BASE_WEBHOOK_URL

# 3 — Launch the Streamlit dashboard
streamlit run frontend/app.py
```

## Testing

```bash
pytest tests/ -v
```

## Difficulty Levels

| Level | Behavior |
|-------|----------|
| 1 (Low) | Mildly insistent, easily sidetracked |
| 3 (Medium) | Standard persistence, redirects stalls |
| 5 (High) | Aggressive urgency, emotional pressure |
