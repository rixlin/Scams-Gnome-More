# Cloudflare Tunnel Setup

This guide explains how to expose the local FastAPI server to the internet
so that Twilio can reach the webhook endpoints.

## Prerequisites

Install `cloudflared`:

```bash
# macOS
brew install cloudflared

# Or download from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
```

## Quick Start

1. Start the FastAPI backend:
   ```bash
   cd attacker
   uvicorn backend.server:app --host 0.0.0.0 --port 8000 --reload
   ```

2. In a separate terminal, start the tunnel:
   ```bash
   ./run_tunnel.sh
   # or manually:
   cloudflared tunnel --url http://localhost:8000
   ```

3. Copy the generated `*.trycloudflare.com` URL.

4. Set `BASE_WEBHOOK_URL` in your `.env` file to that URL (no trailing slash).

5. Restart the FastAPI server so it picks up the new URL.

## Notes

- The free quick-tunnel URL changes every time you restart `cloudflared`.
  Update `.env` → `BASE_WEBHOOK_URL` each time.
- For a persistent subdomain, create a named tunnel via the Cloudflare dashboard.
