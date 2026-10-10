# Gnome backend

FastAPI server connecting Twilio phone calls to the Gnome agent (Gemini + ElevenLabs), with a live
WebSocket feed for the frontend and call history in Tiger Data. See `AGENTS.md` for the full design.

## Run

```sh
python -m venv .venv
.venv/Scripts/pip install --only-binary=:all: -r requirements.txt
cp .env.example .env            # then fill in the PLACEHOLDER values
.venv/Scripts/python -m uvicorn app.main:app --port 8000
cloudflared tunnel --url http://localhost:8000   # set PUBLIC_BASE_URL to the tunnel hostname
```

In the Twilio console, for your number:
- **A call comes in** → Webhook `POST https://<tunnel>/twilio/voice`
- **Call status changes** → `POST https://<tunnel>/twilio/status`

Then forward spam calls from your phone to the Twilio number.

## Test

```sh
.venv/Scripts/python -m pytest
```
