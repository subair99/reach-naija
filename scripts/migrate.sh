#!/usr/bin/env bash
# Creates the database tables. Needs STORE=postgres and the database running (docker compose up -d).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run migrate
