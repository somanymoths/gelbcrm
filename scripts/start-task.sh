#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage:
  scripts/start-task.sh "<task text>" [branch options...] [--port 3000] [--no-dev] [--no-open] [--no-notion] [--notion-db-env NOTION_TASKS_DB_ID]

Examples:
  scripts/start-task.sh "Исправить deprecated props antd" --type fix --push
  scripts/start-task.sh "Добавить фильтр по преподавателю" --type feat --issue GELB-412 --port 3001
HELP
}

if [ "${1:-}" = "" ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 64
fi

TASK_TEXT="$1"
shift || true

PORT=3000
START_DEV=1
OPEN_BROWSER=1
CREATE_NOTION=1
NOTION_DB_ENV="${NOTION_TASKS_DB_ENV:-}"
BRANCH_ARGS=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      PORT="${2:-}"
      shift 2
      ;;
    --no-dev)
      START_DEV=0
      OPEN_BROWSER=0
      shift
      ;;
    --no-open)
      OPEN_BROWSER=0
      shift
      ;;
    --no-notion)
      CREATE_NOTION=0
      shift
      ;;
    --notion-db-env)
      NOTION_DB_ENV="${2:-}"
      shift 2
      ;;
    *)
      BRANCH_ARGS+=("$1")
      shift
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/lib/ops.sh"
init_ops "$ROOT_DIR"

if ! git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "$EXIT_REPO_NOT_FOUND" "Run this script from inside a git repository."
fi

if [ -n "$(git -C "${ROOT_DIR}" status --porcelain)" ]; then
  fail "$EXIT_REPO_DIRTY" "Working tree is not clean. Commit or stash changes first."
fi

log_info "Syncing main from origin/main..."
CURRENT_BRANCH="$(git -C "${ROOT_DIR}" branch --show-current)"
if [ "${CURRENT_BRANCH}" != "main" ]; then
  git -C "${ROOT_DIR}" checkout main
fi
git -C "${ROOT_DIR}" pull --ff-only origin main

BRANCH_OUTPUT="$("${SCRIPT_DIR}/new-task-branch.sh" "$TASK_TEXT" "${BRANCH_ARGS[@]}" 2>&1)"
printf '%s\n' "$BRANCH_OUTPUT"

BRANCH_NAME="$(printf '%s\n' "$BRANCH_OUTPUT" | sed -n 's/^Created branch: //p' | tail -n1)"

if [ -z "$BRANCH_NAME" ]; then
  fail "$EXIT_USAGE" "Could not determine created branch name."
fi

if [ -x "${SCRIPT_DIR}/task-init.sh" ]; then
  log_info "Initializing task docs..."
  "${SCRIPT_DIR}/task-init.sh" "$TASK_TEXT" --branch "$BRANCH_NAME" --base origin/main
fi

if [ "$CREATE_NOTION" -eq 1 ]; then
  if [ -n "$NOTION_DB_ENV" ]; then
    NOTION_DB_ID="${!NOTION_DB_ENV:-}"
  elif [ -n "${NOTION_TASKS_DB_ID:-}" ]; then
    NOTION_DB_ENV="NOTION_TASKS_DB_ID"
    NOTION_DB_ID="${NOTION_TASKS_DB_ID}"
  elif [ -n "${NOTION_DRAFTS_DB_ID:-}" ]; then
    NOTION_DB_ENV="NOTION_DRAFTS_DB_ID"
    NOTION_DB_ID="${NOTION_DRAFTS_DB_ID}"
  else
    NOTION_DB_ID=""
  fi

  if [ -n "$NOTION_DB_ID" ] && [ -n "${NOTION_TOKEN:-}" ]; then
    log_info "Creating Notion page..."
    NOTION_URL="$(node "${SCRIPT_DIR}/notion-create-page.mjs" --title "$TASK_TEXT" --database-id "$NOTION_DB_ID" --branch "$BRANCH_NAME" --body "Repository: gelbcrm")"
    log_info "Notion page: ${NOTION_URL}"
  else
    log_warn "Skipping Notion page creation: set NOTION_TOKEN and ${NOTION_DB_ENV}."
  fi
fi

if [ "$START_DEV" -eq 1 ] && [ -f "${ROOT_DIR}/package.json" ]; then
  mkdir -p "${ROOT_DIR}/.codex/logs"
  DEV_LOG="${ROOT_DIR}/.codex/logs/dev-${PORT}.log"
  DEV_PID_FILE="${ROOT_DIR}/.codex/dev-${PORT}.pid"

  HEALTH_URL="http://localhost:${PORT}/api/health"

  if lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    log_info "Dev server is already listening on port ${PORT}."
  else
    log_info "Starting dev server on port ${PORT}..."
    (
      cd "${ROOT_DIR}"
      PORT="${PORT}" nohup npm run dev >"${DEV_LOG}" 2>&1 &
      echo $! >"${DEV_PID_FILE}"
    )

    for _ in $(seq 1 30); do
      if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if curl -fsS "${HEALTH_URL}" >/dev/null 2>&1; then
      log_info "Dev server: http://localhost:${PORT}"
      log_info "Dev log: ${DEV_LOG}"
    else
      fail "$EXIT_DEV_NOT_READY" "Dev server did not become ready in time. Check ${DEV_LOG}."
    fi
  fi

  if [ "$OPEN_BROWSER" -eq 1 ] && [ "$(uname -s)" = "Darwin" ]; then
    open "http://localhost:${PORT}"
  fi
fi
