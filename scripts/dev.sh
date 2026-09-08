#!/usr/bin/env bash
# Start MongoDB, FastAPI, and the Next.js site for local preview.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MONGO_BIN="${MONGO_BIN:-$HOME/mongodb/bin/mongod}"
MONGO_DATA="${MONGO_DATA:-/tmp/panter-mongo-data}"
MONGO_LOG="${MONGO_LOG:-/tmp/panter-mongo.log}"
BACKEND_PORT="${BACKEND_PORT:-18080}"
WEB_PORT="${WEB_PORT:-14321}"

mkdir -p "$MONGO_DATA"

if ! pgrep -f "mongod --dbpath $MONGO_DATA" >/dev/null 2>&1; then
  if [[ ! -x "$MONGO_BIN" ]]; then
    echo "MongoDB binary not found at $MONGO_BIN" >&2
    echo "Install MongoDB or set MONGO_BIN." >&2
    exit 1
  fi
  "$MONGO_BIN" --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port 27017 --fork --logpath "$MONGO_LOG"
fi

cd "$ROOT/backend"
if [[ ! -x .venv/bin/uvicorn ]]; then
  echo "Backend virtualenv missing. Run: python3 -m venv backend/.venv && backend/.venv/bin/pip install -r backend/requirements-local.txt" >&2
  exit 1
fi
.venv/bin/uvicorn server:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

cd "$ROOT/security-website"
if [[ ! -d node_modules ]]; then
  echo "Website dependencies missing. Run: npm install --prefix security-website" >&2
  kill "$BACKEND_PID" 2>/dev/null || true
  exit 1
fi
npx next dev --hostname 0.0.0.0 --port "$WEB_PORT" &
WEB_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Panter API:         http://127.0.0.1:${BACKEND_PORT}/api"
echo "Güvenlik sitesi:    http://127.0.0.1:${WEB_PORT}"
echo "Admin:              http://127.0.0.1:${WEB_PORT}/admin"
echo "Operasyon merkezi:  http://127.0.0.1:${WEB_PORT}/operasyon"
wait
