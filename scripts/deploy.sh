#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-85.117.235.173}"
USER="${DEPLOY_USER:-root}"
TARGET_DIR="${DEPLOY_PATH:-/var/www/gelbcrm}"
SSH_TARGET="${USER}@${HOST}"

echo "[deploy] Syncing files to ${SSH_TARGET}:${TARGET_DIR}"
ssh "$SSH_TARGET" "mkdir -p '$TARGET_DIR'"

rsync -az --delete \
  --exclude '.git' \
  --exclude '.github' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env*' \
  --exclude '.DS_Store' \
  ./ "$SSH_TARGET:$TARGET_DIR/"

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
