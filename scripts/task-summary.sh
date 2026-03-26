#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/lib/ops.sh"
init_ops "$ROOT_DIR"

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
  exit "$EXIT_USAGE"
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
      log_error "Unknown argument: $1"
      usage
      exit "$EXIT_USAGE"
      ;;
  esac
done

if [ -z "$BRANCH_NAME" ]; then
  fail "$EXIT_USAGE" "Could not determine git branch. Pass --branch explicitly."
fi

if [ -z "$MESSAGE" ]; then
  if [ -t 0 ]; then
    log_error "Summary text is required."
    usage
    exit "$EXIT_USAGE"
  fi
  MESSAGE="$(cat)"
fi

MESSAGE="$(printf '%s' "$MESSAGE" | sed 's/[[:space:]]*$//')"
if [ -z "$MESSAGE" ]; then
  fail "$EXIT_USAGE" "Summary text is empty."
fi

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

log_info "Updated summary: $SUMMARY_FILE"
