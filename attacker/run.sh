#!/usr/bin/env bash
# ==============================================================================
# run.sh — All-in-one launcher for the Attacker module:
#   1. Starts Cloudflare quick tunnel (auto-extracts and updates BASE_WEBHOOK_URL in .env)
#   2. Starts the FastAPI Telephony Webhook Server (port 8000)
#   3. Starts the Streamlit Control Panel (port 8501)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for terminal output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}         🎭 STARTING ATTACK AGENT SYSTEM            ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Check .env file
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo -e "${YELLOW}[!] .env not found. Copying .env.example to .env...${NC}"
    cp .env.example .env
  else
    echo -e "${RED}[X] Error: .env file missing. Please create it.${NC}"
    exit 1
  fi
fi

# 2. Determine cloudflared executable
CLOUDFLARED_CMD=""
if [ -x "./cloudflared" ]; then
  CLOUDFLARED_CMD="./cloudflared"
elif command -v cloudflared &>/dev/null; then
  CLOUDFLARED_CMD="cloudflared"
else
  echo -e "${RED}[X] Error: cloudflared binary not found in current folder or PATH.${NC}"
  echo -e "    Please download it or run the tunnel separately."
  exit 1
fi

# Track background PIDs for cleanup on exit
TUNNEL_PID=""
BACKEND_PID=""
FRONTEND_PID=""
TUNNEL_LOG=$(mktemp)

cleanup() {
  echo ""
  echo -e "${YELLOW}[!] Shutting down all attacker services...${NC}"
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG" 2>/dev/null || true
  echo -e "${GREEN}[✓] All processes stopped.${NC}"
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 3. Start Cloudflare Tunnel
echo -e "\n${YELLOW}[1/3] Starting Cloudflare Tunnel to port 8000...${NC}"
$CLOUDFLARED_CMD tunnel --url http://localhost:8000 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

echo -n "      Waiting for tunnel public URL"
TUNNEL_URL=""
for i in {1..30}; do
  echo -n "."
  sleep 1
  # Search log for trycloudflare.com URL
  FOUND_URL=$(grep -o 'https://[-a-zA-Z0-9\.]*\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)
  if [ -n "$FOUND_URL" ]; then
    TUNNEL_URL="$FOUND_URL"
    break
  fi
done
echo ""

if [ -z "$TUNNEL_URL" ]; then
  echo -e "${RED}[X] Failed to detect Cloudflare tunnel URL within 30 seconds.${NC}"
  echo "    Tunnel log output:"
  cat "$TUNNEL_LOG"
  exit 1
fi

echo -e "${GREEN}[✓] Tunnel connected:${NC} $TUNNEL_URL"

# Automatically update BASE_WEBHOOK_URL in .env
if grep -q "^BASE_WEBHOOK_URL=" .env; then
  # macOS compatible sed replacement
  sed -i '' -e "s|^BASE_WEBHOOK_URL=.*|BASE_WEBHOOK_URL=$TUNNEL_URL|" .env
else
  echo "BASE_WEBHOOK_URL=$TUNNEL_URL" >> .env
fi
echo -e "${GREEN}[✓] Updated .env with BASE_WEBHOOK_URL=$TUNNEL_URL${NC}"

# 4. Start FastAPI Backend Server
echo -e "\n${YELLOW}[2/3] Starting FastAPI Webhook Backend on port 8000...${NC}"
python3 -m uvicorn backend.server:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
sleep 2

# 5. Start Streamlit Frontend
echo -e "\n${YELLOW}[3/3] Starting Streamlit Frontend on port 8501...${NC}"
python3 -m streamlit run frontend/app.py --server.port 8501 --server.headless false &
FRONTEND_PID=$!

echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}  ✓ ALL ATTACKER SERVICES ARE RUNNING!              ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "  🌐 Streamlit UI:        ${BLUE}http://localhost:8501${NC}"
echo -e "  ⚙️  FastAPI Backend:     ${BLUE}http://localhost:8000${NC}"
echo -e "  ☁️  Cloudflare Tunnel:   ${BLUE}$TUNNEL_URL${NC}"
echo -e "----------------------------------------------------"
echo -e "Press ${YELLOW}Ctrl+C${NC} in this window to stop all services.\n"

# Keep the script running and wait for background processes
wait

