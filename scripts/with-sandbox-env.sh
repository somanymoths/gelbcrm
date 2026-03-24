#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: scripts/with-sandbox-env.sh <command...>"
  exit 1
fi

export DB_HOST="${SANDBOX_DB_HOST:-127.0.0.1}"
export DB_PORT="${SANDBOX_DB_PORT:-3307}"
export DB_DATABASE="${SANDBOX_DB_DATABASE:-gelbcrm_sandbox}"
export DB_USERNAME="${SANDBOX_DB_USERNAME:-gelbcrm}"
export DB_PASSWORD="${SANDBOX_DB_PASSWORD:-gelbcrm}"
export SESSION_SECRET="${SANDBOX_SESSION_SECRET:-sandbox-session-secret-change-me}"
export APP_URL="${SANDBOX_APP_URL:-http://localhost:3000}"

# In sandbox mode, payment creation is mocked to avoid any external provider calls.
export PAYMENTS_MOCK_MODE=1

# Sensible defaults for sandbox admin seed.
export ADMIN_LOGIN="${ADMIN_LOGIN:-admin}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

exec "$@"
