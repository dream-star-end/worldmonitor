#!/usr/bin/env bash
# ============================================
# World Monitor — Local Relay + Cloudflare Tunnel
# ============================================
# Usage: ./start-relay.sh
# Starts the AIS relay server and cloudflared tunnel.
# The tunnel URL is printed and can be set in Vercel env vars.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RELAY_PORT="${PORT:-3004}"
TUNNEL_LOG="/tmp/cloudflared-worldmonitor.log"
RELAY_LOG="/tmp/worldmonitor-relay.log"

# Load .env.local if exists
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

if [ -z "${AISSTREAM_API_KEY:-}" ]; then
  echo "⚠️  AISSTREAM_API_KEY not set — AIS ship tracking disabled"
  echo "   Other features (RSS, OpenSky, Telegram, OREF) still work"
fi

cleanup() {
  echo ""
  echo "🛑 Shutting down..."
  [ -n "${RELAY_PID:-}" ] && kill "$RELAY_PID" 2>/dev/null
  [ -n "${TUNNEL_PID:-}" ] && kill "$TUNNEL_PID" 2>/dev/null
  wait 2>/dev/null
  echo "✅ All processes stopped."
}
trap cleanup EXIT INT TERM

echo "🚀 Starting World Monitor Local Relay..."
echo "   Port: $RELAY_PORT"
echo ""

PORT=$RELAY_PORT node scripts/ais-relay.cjs > "$RELAY_LOG" 2>&1 &
RELAY_PID=$!
echo "✅ Relay server started (PID: $RELAY_PID)"
echo "   Log: $RELAY_LOG"

sleep 2
if ! kill -0 "$RELAY_PID" 2>/dev/null; then
  echo "❌ Relay server failed to start. Check log:"
  tail -20 "$RELAY_LOG"
  exit 1
fi

echo ""
echo "🌐 Starting Cloudflare Tunnel..."
cloudflared tunnel --url "http://localhost:$RELAY_PORT" > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

sleep 5
TUNNEL_URL=""
for i in {1..10}; do
  TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | head -1 || true)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

if [ -z "$TUNNEL_URL" ]; then
  echo "❌ Could not detect tunnel URL. Check log:"
  tail -20 "$TUNNEL_LOG"
  echo ""
  echo "You may need to manually check: cat $TUNNEL_LOG"
  echo "Relay is still running on localhost:$RELAY_PORT"
  wait
  exit 1
fi

echo "✅ Cloudflare Tunnel active!"
echo ""
echo "================================================"
echo "  📋 Copy these to Vercel Environment Variables:"
echo "================================================"
echo ""
echo "  WS_RELAY_URL=$TUNNEL_URL"
echo "  VITE_WS_RELAY_URL=wss://${TUNNEL_URL#https://}"
echo "  RELAY_SHARED_SECRET=${RELAY_SHARED_SECRET:-3ba5b62ff447591725e64f80e4a9bfeb9537acd0f7b20fb5cff7da572c8602ad}"
echo "  RELAY_AUTH_HEADER=${RELAY_AUTH_HEADER:-x-relay-key}"
echo ""
echo "  Or run this command to update Vercel env vars:"
echo "  vercel env add WS_RELAY_URL"
echo ""
echo "================================================"
echo "  Relay running at:  http://localhost:$RELAY_PORT"
echo "  Tunnel URL:        $TUNNEL_URL"
echo "  Relay log:         $RELAY_LOG"
echo "  Tunnel log:        $TUNNEL_LOG"
echo "================================================"
echo ""
echo "Press Ctrl+C to stop both services."
echo ""

wait
