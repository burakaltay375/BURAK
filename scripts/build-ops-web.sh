#!/usr/bin/env bash
# Export the Expo app as a static web site and publish it at /operasyon.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"

if [[ ! -d node_modules ]]; then
  npm install --ignore-scripts
fi

npx expo export --platform web --output-dir dist

DEST="$ROOT/security-website/public/operasyon"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -a dist/. "$DEST/"
echo "Published Expo web app to $DEST"
