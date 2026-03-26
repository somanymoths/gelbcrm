#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/lib/ops.sh"
init_ops "$ROOT_DIR"

BASE_REF="origin/main"
PORT="${PORT:-3000}"
SHOULD_FETCH=1
REQUIRE_HEALTH=0

usage() {
  cat <<'HELP'
Usage:
  scripts/ops-smoke.sh [--base origin/main] [--port 3000] [--no-fetch] [--require-health]

Checks:
- required env vars via scripts/env-preflight.cjs
- base git ref availability
- canonical journal entrypoint state
- task-tools log directory write access
- optional dev health check (GET /api/health)
HELP
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      BASE_REF="${2:-}"
      shift 2
      ;;
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --no-fetch)
      SHOULD_FETCH=0
      shift
      ;;
    --require-health)
      REQUIRE_HEALTH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "$EXIT_USAGE" "Unknown argument: $1"
      ;;
  esac
done

if ! git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "$EXIT_REPO_NOT_FOUND" "Run this script from inside a git repository."
fi

log_info "[ops-smoke] Running env preflight"
node "${SCRIPT_DIR}/env-preflight.cjs"

if [ "$SHOULD_FETCH" -eq 1 ] && [ "$BASE_REF" = "origin/main" ]; then
  log_info "[ops-smoke] Fetching base ref ${BASE_REF}"
  git -C "${ROOT_DIR}" fetch --prune origin main >/dev/null 2>&1 || true
fi

if ! git -C "${ROOT_DIR}" rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  fail "$EXIT_BASE_REF_NOT_FOUND" "Base ref not found: $BASE_REF"
fi
log_info "[ops-smoke] Base ref exists: ${BASE_REF}"

JOURNAL_FILE="${ROOT_DIR}/src/components/journal/journal-section.tsx"
LEGACY_FILE_4="${ROOT_DIR}/src/components/journal/journal-section 4.tsx"
LEGACY_FILE_5="${ROOT_DIR}/src/components/journal/journal-section 5.tsx"

if [ ! -f "$JOURNAL_FILE" ]; then
  fail "$EXIT_REPO_NOT_FOUND" "Missing canonical journal file: ${JOURNAL_FILE}"
fi

if [ -f "$LEGACY_FILE_4" ] || [ -f "$LEGACY_FILE_5" ]; then
  fail "$EXIT_REPO_DIRTY" "Legacy journal aliases detected. Remove journal-section 4/5.tsx files."
fi
log_info "[ops-smoke] Journal entrypoint structure is valid"

if [ ! -w "${ROOT_DIR}/.codex/logs" ]; then
  mkdir -p "${ROOT_DIR}/.codex/logs"
fi
touch "${ROOT_DIR}/.codex/logs/task-tools.log"
log_info "[ops-smoke] task-tools log is writable"

HEALTH_URL="http://localhost:${PORT}/api/health"
if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
  log_info "[ops-smoke] Health endpoint is reachable: ${HEALTH_URL}"
else
  if [ "$REQUIRE_HEALTH" -eq 1 ]; then
    fail "$EXIT_DEV_NOT_READY" "Health endpoint is not reachable: ${HEALTH_URL}"
  fi
  log_warn "[ops-smoke] Health endpoint is not reachable: ${HEALTH_URL} (skipped)"
fi

log_info "[ops-smoke] All checks passed"
