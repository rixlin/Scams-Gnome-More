#!/usr/bin/env bash
# Start a Cloudflare quick-tunnel pointing to the local FastAPI server.
set -euo pipefail

PORT="${1:-8000}"
echo "[tunnel] Exposing localhost:$PORT via Cloudflare quick tunnel…"
cloudflared tunnel --url "http://localhost:$PORT"
