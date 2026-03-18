#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage:
  scripts/task-summary.sh "<short summary>" [--branch <branch>]
  echo "<summary>" | scripts/task-summary.sh [--branch <branch>]

Examples:
  scripts/task-summary.sh "Сделан API endpoint, осталось обновить UI."
  echo "Починил фильтрацию, добавил проверку null." | scripts/task-summary.sh
HELP
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 1
fi

BRANCH_NAME="$(git branch --show-current 2>/dev/null || true)"
MESSAGE=""

if [ "${1:-}" != "" ] && [ "${1:-}" != "--branch" ]; then
  MESSAGE="$1"
  shift
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch)
      BRANCH_NAME="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [ -z "$BRANCH_NAME" ]; then
  echo "Could not determine git branch. Pass --branch explicitly."
  exit 1
fi

if [ -z "$MESSAGE" ]; then
  if [ -t 0 ]; then
    echo "Summary text is required."
    usage
    exit 1
  fi
  MESSAGE="$(cat)"
fi

MESSAGE="$(printf '%s' "$MESSAGE" | sed 's/[[:space:]]*$//')"
if [ -z "$MESSAGE" ]; then
  echo "Summary text is empty."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASK_DIR="${ROOT_DIR}/.codex/tasks/${BRANCH_NAME}"
SUMMARY_FILE="${TASK_DIR}/SUMMARY.md"
TIMESTAMP="$(date '+%Y-%m-%d %H:%M %Z')"
HEAD_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo 'n/a')"

mkdir -p "$TASK_DIR"

if [ ! -f "$SUMMARY_FILE" ]; then
  cat > "$SUMMARY_FILE" <<SUMMARY
# Резюме по задаче

- Ветка: ${BRANCH_NAME}
- Дата старта: ${TIMESTAMP}

## Записи
SUMMARY
fi

cat >> "$SUMMARY_FILE" <<ENTRY

### ${TIMESTAMP}
- Commit: ${HEAD_COMMIT}
- ${MESSAGE}
ENTRY

echo "Updated summary: $SUMMARY_FILE"
