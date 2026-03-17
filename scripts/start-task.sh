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
  exit 1
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

BRANCH_OUTPUT="$("${SCRIPT_DIR}/new-task-branch.sh" "$TASK_TEXT" "${BRANCH_ARGS[@]}" 2>&1)"
printf '%s\n' "$BRANCH_OUTPUT"

BRANCH_NAME="$(printf '%s\n' "$BRANCH_OUTPUT" | sed -n 's/^Created branch: //p' | tail -n1)"

if [ -z "$BRANCH_NAME" ]; then
  echo "Could not determine created branch name."
  exit 1
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
    echo "Creating Notion page..."
    NOTION_URL="$(node "${SCRIPT_DIR}/notion-create-page.mjs" --title "$TASK_TEXT" --database-id "$NOTION_DB_ID" --branch "$BRANCH_NAME" --body "Repository: gelbcrm")"
    printf 'Notion page: %s\n' "$NOTION_URL"
  else
    echo "Skipping Notion page creation: set NOTION_TOKEN and ${NOTION_DB_ENV}."
  fi
fi

if [ "$START_DEV" -eq 1 ] && [ -f "${ROOT_DIR}/package.json" ]; then
  mkdir -p "${ROOT_DIR}/.codex/logs"
  DEV_LOG="${ROOT_DIR}/.codex/logs/dev-${PORT}.log"
  DEV_PID_FILE="${ROOT_DIR}/.codex/dev-${PORT}.pid"

  if lsof -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Dev server is already listening on port ${PORT}."
  else
    echo "Starting dev server on port ${PORT}..."
    (
      cd "${ROOT_DIR}"
      PORT="${PORT}" nohup npm run dev >"${DEV_LOG}" 2>&1 &
      echo $! >"${DEV_PID_FILE}"
    )

    for _ in $(seq 1 30); do
      if curl -fsS "http://localhost:${PORT}" >/dev/null 2>&1; then
        break
      fi
      sleep 1
    done

    if curl -fsS "http://localhost:${PORT}" >/dev/null 2>&1; then
      printf 'Dev server: http://localhost:%s\n' "$PORT"
      printf 'Dev log: %s\n' "$DEV_LOG"
    else
      echo "Dev server did not become ready in time. Check ${DEV_LOG}."
    fi
  fi

  if [ "$OPEN_BROWSER" -eq 1 ] && [ "$(uname -s)" = "Darwin" ]; then
    open "http://localhost:${PORT}"
  fi
fi
