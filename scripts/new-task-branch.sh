#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage:
  scripts/new-task-branch.sh "<task text>" [--type feat|fix|chore|hotfix] [--issue GELB-123] [--base main] [--push]
  scripts/new-task-branch.sh "<task text>" --worktree [--port 3000] [--no-open] [--no-dev]

Examples:
  scripts/new-task-branch.sh "Новая задача: исправить дубли платежей в воронке"
  scripts/new-task-branch.sh "Добавить фильтр по преподавателю" --type feat --issue GELB-412 --push
  scripts/new-task-branch.sh "Добавить фильтр по преподавателю" --worktree
HELP
}

find_free_port() {
  local port="$1"

  while lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; do
    port=$((port + 1))
  done

  printf '%s' "$port"
}

wait_for_port() {
  local port="$1"
  local retries=30

  while [ "$retries" -gt 0 ]; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    retries=$((retries - 1))
  done

  return 1
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

if [ "${1:-}" = "" ]; then
  usage
  exit 1
fi

TASK_TEXT="$1"
shift || true

TYPE=""
ISSUE=""
BASE_BRANCH="main"
PUSH_BRANCH=0
USE_WORKTREE=0
START_DEV_SERVER=1
OPEN_BROWSER=1
PORT_HINT=3000

while [ "$#" -gt 0 ]; do
  case "$1" in
    --type)
      TYPE="${2:-}"
      shift 2
      ;;
    --issue)
      ISSUE="${2:-}"
      shift 2
      ;;
    --base)
      BASE_BRANCH="${2:-}"
      shift 2
      ;;
    --push)
      PUSH_BRANCH=1
      shift
      ;;
    --worktree)
      USE_WORKTREE=1
      shift
      ;;
    --port)
      PORT_HINT="${2:-}"
      shift 2
      ;;
    --no-dev)
      START_DEV_SERVER=0
      shift
      ;;
    --no-open)
      OPEN_BROWSER=0
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [ -z "$TYPE" ]; then
  LOWER_TEXT="$(printf '%s' "$TASK_TEXT" | tr '[:upper:]' '[:lower:]')"
  if printf '%s' "$LOWER_TEXT" | rg -q '(fix|bug|ошиб|баг|почин|исправ|hotfix)'; then
    TYPE="fix"
  elif printf '%s' "$LOWER_TEXT" | rg -q '(refactor|cleanup|docs|док|рефактор|чистк|infra|workflow|hook)'; then
    TYPE="chore"
  else
    TYPE="feat"
  fi
fi

if ! printf '%s' "$TYPE" | rg -q '^(feat|fix|chore|hotfix)$'; then
  echo "Invalid --type '$TYPE'. Allowed: feat|fix|chore|hotfix"
  exit 1
fi

if ! printf '%s' "$PORT_HINT" | rg -q '^[0-9]+$'; then
  echo "Invalid --port '$PORT_HINT'. Expected a number."
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script from inside a git repository."
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
REPO_NAME="$(basename "$REPO_ROOT")"

if [ "$USE_WORKTREE" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

SLUG_SOURCE="$TASK_TEXT"
if [ -n "$ISSUE" ]; then
  SLUG_SOURCE="$ISSUE $SLUG_SOURCE"
fi

SLUG="$(printf '%s' "$SLUG_SOURCE" | iconv -f UTF-8 -t ASCII//TRANSLIT 2>/dev/null || printf '%s' "$SLUG_SOURCE")"
SLUG="$(printf '%s' "$SLUG" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-{2,}/-/g')"

if [ -z "$SLUG" ]; then
  SLUG="task"
fi

SLUG="$(printf '%s' "$SLUG" | cut -c1-50)"
TARGET_BRANCH="codex/${TYPE}/${SLUG}"
ORIGINAL_TARGET="$TARGET_BRANCH"
COUNTER=2
while git show-ref --verify --quiet "refs/heads/${TARGET_BRANCH}" || git ls-remote --heads origin "$TARGET_BRANCH" | rg -q .; do
  TARGET_BRANCH="${ORIGINAL_TARGET}-${COUNTER}"
  COUNTER=$((COUNTER + 1))
done

CURRENT_BRANCH="$(git branch --show-current)"
WORKTREE_PATH=""
PORT=""
LOG_FILE=""
PID_FILE=""

if [ "$USE_WORKTREE" -eq 1 ]; then
  WORKTREE_ROOT="${CODEX_TASK_WORKTREE_ROOT:-$HOME/.codex/task-worktrees/$REPO_NAME}"
  WORKTREE_NAME="$(printf '%s' "$TARGET_BRANCH" | tr '/' '-')"
  WORKTREE_PATH="$WORKTREE_ROOT/$WORKTREE_NAME"

  if [ -e "$WORKTREE_PATH" ]; then
    echo "Worktree path already exists: $WORKTREE_PATH"
    exit 1
  fi

  mkdir -p "$WORKTREE_ROOT"
  git fetch origin "$BASE_BRANCH" --quiet || true
  git worktree add -b "$TARGET_BRANCH" "$WORKTREE_PATH" "$BASE_BRANCH"

  # Reuse local dependencies and env config so the new task can boot quickly.
  if [ -d "$REPO_ROOT/node_modules" ] && [ ! -e "$WORKTREE_PATH/node_modules" ]; then
    ln -s "$REPO_ROOT/node_modules" "$WORKTREE_PATH/node_modules"
  fi

  if [ -f "$REPO_ROOT/.env.local" ] && [ ! -e "$WORKTREE_PATH/.env.local" ]; then
    ln -s "$REPO_ROOT/.env.local" "$WORKTREE_PATH/.env.local"
  fi

  if [ "$PUSH_BRANCH" -eq 1 ]; then
    git -C "$WORKTREE_PATH" push -u origin "$TARGET_BRANCH"
  fi

  if [ "$START_DEV_SERVER" -eq 1 ]; then
    PORT="$(find_free_port "$PORT_HINT")"
    LOG_FILE="$WORKTREE_PATH/.codex-dev.log"
    PID_FILE="$WORKTREE_PATH/.codex-dev.pid"

    (
      cd "$WORKTREE_PATH"
      PORT="$PORT" npm run dev >"$LOG_FILE" 2>&1 &
      echo $! >"$PID_FILE"
    )

    if ! wait_for_port "$PORT"; then
      echo "Dev server did not start in time. Check log: $LOG_FILE"
      exit 1
    fi

    if [ "$OPEN_BROWSER" -eq 1 ]; then
      open "http://localhost:$PORT"
    fi
  fi
else
  if [ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]; then
    git checkout "$BASE_BRANCH"
  fi

  git pull --ff-only
  git checkout -b "$TARGET_BRANCH"

  if [ "$PUSH_BRANCH" -eq 1 ]; then
    git push -u origin "$TARGET_BRANCH"
  fi
fi

printf 'Created branch: %s\n' "$TARGET_BRANCH"
printf 'From base: %s\n' "$BASE_BRANCH"
if [ -n "$WORKTREE_PATH" ]; then
  printf 'Worktree: %s\n' "$WORKTREE_PATH"
  printf 'Next chat cwd: %s\n' "$WORKTREE_PATH"
fi
if [ -n "$PORT" ]; then
  printf 'Dev URL: http://localhost:%s\n' "$PORT"
  printf 'Dev log: %s\n' "$LOG_FILE"
fi
