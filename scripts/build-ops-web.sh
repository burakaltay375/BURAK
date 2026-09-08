#!/usr/bin/env bash
# Export Hospira as a static web app and publish it at /operasyon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

if [[ ! -d node_modules ]]; then
  npm install --ignore-scripts
fi

CI=1 EXPO_NO_TELEMETRY=1 npx expo export --platform web --output-dir dist

DEST="$ROOT/security-website/public/operasyon"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a dist/. "$DEST/"
echo "Published Hospira web app to $DEST"
