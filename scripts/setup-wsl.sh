#!/usr/bin/env bash
# One-time setup inside WSL (Ubuntu). Installs Node (via nvm), ffmpeg and cloudflared.
set -euo pipefail

echo "==> System packages"
sudo apt-get update -y
sudo apt-get install -y git build-essential ffmpeg jq curl ca-certificates

echo "==> Node.js LTS via nvm"
if [ ! -d "$HOME/.nvm" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"
nvm install --lts
nvm use --lts
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (a<22||(a===22&&b<18)) { console.error("Need Node 22.18+ (got "+process.versions.node+")"); process.exit(1) }'

echo "==> cloudflared (public HTTPS tunnel for webhooks and phone testing)"
if ! command -v cloudflared >/dev/null; then
  curl -fsSL -o /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
  sudo dpkg -i /tmp/cloudflared.deb
fi

echo "==> Project"
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
npm install

echo
echo "Done. Next:"
echo "  source ~/.bashrc"
echo "  npm run dev      (then open http://localhost:3000)"
