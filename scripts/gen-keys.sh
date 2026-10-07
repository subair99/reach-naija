#!/usr/bin/env bash
# Creates the demo signing key pair. Delete keys/*.pem first to rotate.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run keys
