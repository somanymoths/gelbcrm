#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/ops.sh"
init_ops "$ROOT_DIR"
HOST="${DEPLOY_HOST:-85.117.235.173}"
USER="${DEPLOY_USER:-root}"
TARGET_DIR="${DEPLOY_PATH:-/var/www/gelbcrm}"
SSH_TARGET="${USER}@${HOST}"
REMOTE_REF="origin/main"

if ! git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "$EXIT_REPO_NOT_FOUND" "[deploy] Not a git repository: ${ROOT_DIR}"
fi

log_info "[deploy] Fetching latest ${REMOTE_REF}"
git -C "${ROOT_DIR}" fetch --prune origin main

DEPLOY_COMMIT="$(git -C "${ROOT_DIR}" rev-parse "${REMOTE_REF}")"
log_info "[deploy] Deploying ${REMOTE_REF} at commit ${DEPLOY_COMMIT}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
git -C "${ROOT_DIR}" archive "${REMOTE_REF}" | tar -x -C "${TMP_DIR}"

log_info "[deploy] Syncing files to ${SSH_TARGET}:${TARGET_DIR}"
ssh "$SSH_TARGET" "mkdir -p '$TARGET_DIR'"

rsync -az --delete \
  --exclude '.github' \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.env*' \
  --exclude '.DS_Store' \
  "${TMP_DIR}/" "$SSH_TARGET:$TARGET_DIR/"

log_info "[deploy] Installing and restarting app on server"
ssh "$SSH_TARGET" "TARGET_DIR='$TARGET_DIR' bash -se" <<'REMOTE'
set -euo pipefail
cd "$TARGET_DIR"

rm -rf .next
npm ci --no-audit --no-fund
npm run build
npm run db:migrate

# build-safe writes production artifacts into .next-build.
# next start (without NEXT_DIST_DIR) expects artifacts in .next.
if [ -d ".next-build" ]; then
  rm -rf .next
  cp -a .next-build .next
fi

if [ ! -f ".next/BUILD_ID" ]; then
  echo "[deploy] ERROR: production build is missing (.next/BUILD_ID not found)"
  exit 1
fi

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

log_info "[deploy] Done"
