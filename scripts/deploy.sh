#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${DEPLOY_HOST:-85.117.235.173}"
USER="${DEPLOY_USER:-root}"
TARGET_DIR="${DEPLOY_PATH:-/var/www/gelbcrm}"
SSH_TARGET="${USER}@${HOST}"
REMOTE_REF="origin/main"

if ! git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[deploy] Not a git repository: ${ROOT_DIR}"
  exit 1
fi

echo "[deploy] Fetching latest ${REMOTE_REF}"
git -C "${ROOT_DIR}" fetch --prune origin main

DEPLOY_COMMIT="$(git -C "${ROOT_DIR}" rev-parse "${REMOTE_REF}")"
echo "[deploy] Deploying ${REMOTE_REF} at commit ${DEPLOY_COMMIT}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
git -C "${ROOT_DIR}" archive "${REMOTE_REF}" | tar -x -C "${TMP_DIR}"

echo "[deploy] Syncing files to ${SSH_TARGET}:${TARGET_DIR}"
ssh "$SSH_TARGET" "mkdir -p '$TARGET_DIR'"

rsync -az --delete \
  --exclude '.github' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env*' \
  --exclude '.DS_Store' \
  "${TMP_DIR}/" "$SSH_TARGET:$TARGET_DIR/"

echo "[deploy] Installing and restarting app on server"
ssh "$SSH_TARGET" "TARGET_DIR='$TARGET_DIR' bash -se" <<'REMOTE'
set -euo pipefail
cd "$TARGET_DIR"

rm -rf .next
npm ci --no-audit --no-fund
npm run build
npm run db:migrate

if systemctl cat gelbcrm.service >/dev/null 2>&1; then
  pm2 delete gelbcrm >/dev/null 2>&1 || true
  systemctl restart gelbcrm.service
  systemctl is-active --quiet gelbcrm.service
else
  if ! command -v pm2 >/dev/null 2>&1; then
    npm i -g pm2
  fi
  if pm2 describe gelbcrm >/dev/null 2>&1; then
    pm2 delete gelbcrm
  fi
  pm2 start ecosystem.config.cjs --only gelbcrm --update-env
  pm2 save
fi
REMOTE

echo "[deploy] Done"
