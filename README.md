# 🍄 Scams Gnome More

An AI-powered counter-scam call interception and adversarial testing suite built for HackRU Fall 2026. Forward spam calls to an AI garden gnome that wastes scammers' time, and use the included adversarial attacker agent to benchmark and pressure-test defenses.

---

## 📁 Repository Structure

```text
hackru-f26/
├── gnome/                      # The Defense Suite
│   ├── backend/                # FastAPI server (Twilio Media Streams, Gemini, ElevenLabs, Tiger Data)
│   │   ├── app/                # Application logic, agents, audio pipeline, and WebSockets
│   │   ├── scripts/            # Utility scripts (e.g., live call verification)
│   │   ├── tests/              # Backend test suite
│   │   └── run.py              # Automated runner (Cloudflare tunnel + Twilio hook sync + Uvicorn)
│   └── frontend/               # Next.js web dashboard (live call monitoring, transcripts, audio)
│       ├── app/                # Next.js App Router pages
│       ├── components/         # UI components (transcripts, audio player, telemetry)
│       └── lib/                # API clients, audio streaming helpers, types
└── attacker/                   # The Adversarial Testing Program
    ├── backend/                # FastAPI server & Twilio webhooks for automated outbound scam calls
    ├── frontend/               # Streamlit interactive control dashboard
    └── tests/                  # Attacker agent test suite
```

---

## 🛠️ Technology Synopsis

| Domain | Technologies | Purpose |
| --- | --- | --- |
| **AI & LLMs** | Google Gemini (Live API & Flash) | Real-time conversational agent logic, scam tactics, and adversarial caller brain |
| **Voice & Speech** | ElevenLabs Streaming TTS | Low-latency voice generation (PCM & μ-law 8 kHz audio streaming) |
| **Telephony** | Twilio Voice & Media Streams | PSTN call routing, bi-directional audio WebSockets, and TwiML webhooks |
| **Networking** | Cloudflare Tunnels (`cloudflared`) | Public HTTPS/WSS endpoints exposing local services to Twilio |
| **Database** | Tiger Data / TimescaleDB (PostgreSQL) | Call history, transcripts, telemetry, and settings storage |
| **Gnome Backend** | Python 3.11+, FastAPI, Uvicorn, NumPy | Asynchronous event loop, μ-law/PCM audio conversion, live WebSocket fan-out |
| **Gnome Frontend** | Next.js 16, React 19, Tailwind CSS v4, TypeScript | Real-time call monitoring, transcript stream, audio visualization, settings UI |
| **Attacker Suite** | Python 3.11+, FastAPI, Streamlit, Pytest | Outbound call orchestration, adjustable difficulty jailbreak caller, test dashboard |

---

## 📋 Prerequisites & Accounts

- **Runtimes**:
  - Python 3.11+
  - Node.js 18+ (or 20+) with `npm`, `pnpm`, or `yarn`
- **Tools**:
  - `cloudflared` CLI
- **API Keys & Accounts**:
  - **Twilio**: Account SID, Auth Token, and phone number(s)
  - **Google Gemini**: API key for LLM intelligence
  - **ElevenLabs**: API key and Voice ID(s)
  - **PostgreSQL / Tiger Data:** Backend call logging

---

## 🧝 Gnome Defense Suite

### Gnome Backend

The Gnome backend handles incoming phone calls forwarded to Twilio, connects Twilio Media Streams to Gemini and ElevenLabs, and broadcasts transcripts and telemetry over WebSockets.

#### Gnome Backend Setup

```bash
cd gnome/backend
python -m venv .venv

# Windows
.venv\Scripts\pip install -r requirements.txt
# macOS / Linux
.venv/bin/pip install -r requirements.txt

cp .env.example .env
```

Fill in the credentials in `.env`:

- `PUBLIC_BASE_URL` (or leave empty to let `run.py` generate a quick tunnel)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- `DATABASE_URL` (Tiger Data / Postgres connection string)

#### Gnome Backend Usage

```bash
# Windows
.venv\Scripts\python run.py

# macOS / Linux
.venv/bin/python run.py
```

`run.py` automatically:

1. Spawns or connects a Cloudflare tunnel (quick tunnel or named tunnel).
2. Updates Twilio incoming call and status webhooks to point to the tunnel.
3. Launches the FastAPI server with Uvicorn on port `8000`.

*Alternatively, run manually:*

```bash
uvicorn app.main:app --port 8000
cloudflared tunnel --url http://localhost:8000
```

#### Gnome Backend Testing

```bash
pytest
```

---

### Gnome Frontend

The Gnome frontend is a Next.js application providing real-time live monitoring of ongoing calls, live transcript streaming, audio playback, call history, and persona configuration.

#### Gnome Frontend Setup

```bash
cd gnome/frontend
npm install
```

#### Gnome Frontend Usage

```bash
# Run development server
npm run dev

# Or build and run production
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

#### Gnome Frontend Configuration

By default, the frontend connects to `https://api.gnomegrove.tech` (or falls back to localhost). You can override this:

- Via environment variable: `NEXT_PUBLIC_BACKEND_URL` in `.env.local`
- Directly in the UI: Click the **Settings** gear in the top navigation bar to configure the REST and WebSocket URLs live.

---

## 🎭 Adversarial Test Attacker

The attacker suite is an automated outbound caller agent that calls target numbers (such as the Gnome defense number) to benchmark counter-scam resilience across varying difficulty levels (1: mild to 5: aggressive).

### Attacker

#### Attacker Setup

```bash
cd attacker
pip install -r requirements.txt
cp .env.example .env
```

Fill in credentials in `.env`:

- `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `BASE_WEBHOOK_URL` (Cloudflare tunnel URL from step 2)

#### Attacker Usage

You will need three terminals:

1. **Start the Webhook Server**:

   ```bash
   cd attacker
   uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Expose the Webhook Server via Cloudflare Tunnel**:

   ```bash
   cd attacker
   ./run_tunnel.sh
   # Or manually:
   cloudflared tunnel --url http://localhost:8000
   ```

   *Copy the output `https://<subdomain>.trycloudflare.com` URL into `attacker/.env` as `BASE_WEBHOOK_URL` and restart the webhook server if needed.*

3. **Launch the Streamlit Control Panel**:

   ```bash
   cd attacker
   streamlit run frontend/app.py
   ```

   Open the Streamlit URL (typically `http://localhost:8501`) to input target numbers, configure scam scripts, set difficulty, and trigger test calls.

#### Attacker Testing

```bash
cd attacker
pytest tests/ -v
```
