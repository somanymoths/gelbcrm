#!/usr/bin/env bash
set -euo pipefail

CONTAINER_NAME="${SANDBOX_DB_CONTAINER:-gelbcrm-sandbox-mysql}"

if ! command -v docker >/dev/null 2>&1; then
  echo "[sandbox] docker is required."
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
  echo "[sandbox] Removed container: $CONTAINER_NAME"
else
  echo "[sandbox] Container not found: $CONTAINER_NAME"
fi
