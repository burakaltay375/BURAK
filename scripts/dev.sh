#!/usr/bin/env bash
# Start MongoDB, FastAPI, and both web surfaces.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MONGO_BIN="${MONGO_BIN:-$HOME/mongodb/bin/mongod}"
MONGO_DATA="${MONGO_DATA:-/tmp/panter-mongo-data}"
MONGO_LOG="${MONGO_LOG:-/tmp/panter-mongo.log}"
BACKEND_PORT="${BACKEND_PORT:-18080}"
WEB_PORT="${WEB_PORT:-14321}"

mkdir -p "$MONGO_DATA"
if ! pgrep -f "mongod --dbpath $MONGO_DATA" >/dev/null 2>&1; then
  "$MONGO_BIN" --dbpath "$MONGO_DATA" --bind_ip 127.0.0.1 --port 27017 --fork --logpath "$MONGO_LOG"
fi

cd "$ROOT/backend"
.venv/bin/uvicorn server:app --host 0.0.0.0 --port "$BACKEND_PORT" &
BACKEND_PID=$!

cd "$ROOT/security-website"
npx next dev --hostname 0.0.0.0 --port "$WEB_PORT" &
WEB_PID=$!

cleanup() {
  kill "$BACKEND_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "Kurumsal site:  http://127.0.0.1:${WEB_PORT}"
echo "Hospira:         http://127.0.0.1:${WEB_PORT}/operasyon"
echo "Admin:           http://127.0.0.1:${WEB_PORT}/admin"
echo "API:             http://127.0.0.1:${BACKEND_PORT}/api"
wait
