#!/usr/bin/env bash
# Opens a public HTTPS URL to your local server. Copy the https://....trycloudflare.com URL into
# PUBLIC_URL in .env (then restart the server) and into your Meta webhook / Africa's Talking callback.
set -euo pipefail
PORT="${PORT:-3000}"
command -v cloudflared >/dev/null || { echo "cloudflared not found. Run scripts/setup-wsl.sh"; exit 1; }
cloudflared tunnel --url "http://localhost:${PORT}"
