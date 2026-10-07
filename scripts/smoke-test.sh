#!/usr/bin/env bash
# End-to-end check against a running server. Usage: BASE=http://localhost:3000 scripts/smoke-test.sh
set -euo pipefail
cd "$(dirname "$0")/.."
node --disable-warning=ExperimentalWarning scripts/smoke-test.ts
