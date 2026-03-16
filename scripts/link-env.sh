#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_FILE="${ROOT_DIR}/.env.local"
SOURCE_FILE="${GELBCRM_SHARED_ENV_FILE:-$HOME/.config/gelbcrm/.env.local}"

if [ -L "${DEST_FILE}" ] || [ -f "${DEST_FILE}" ]; then
  exit 0
fi

if [ ! -f "${SOURCE_FILE}" ]; then
  cat <<EOF
Shared env file not found: ${SOURCE_FILE}
Create it once (outside repo) and re-run:
  mkdir -p "$(dirname "${SOURCE_FILE}")"
  cp "${ROOT_DIR}/.env.example" "${SOURCE_FILE}"
EOF
  exit 1
fi

ln -s "${SOURCE_FILE}" "${DEST_FILE}"
echo "Linked ${DEST_FILE} -> ${SOURCE_FILE}"
