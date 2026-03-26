#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
source "${SCRIPT_DIR}/lib/ops.sh"
init_ops "$ROOT_DIR"

usage() {
  cat <<'HELP'
Usage:
  scripts/task-checkpoint.sh [--base origin/main] [--max-files 4] [--max-lines 150] [--fetch]

Exit codes:
  0 - within limits
  2 - checkpoint required (limits exceeded)
HELP
}

BASE_REF="origin/main"
MAX_FILES="${TASK_MAX_FILES:-4}"
MAX_LINES="${TASK_MAX_LINES:-150}"
SHOULD_FETCH=1

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      BASE_REF="${2:-}"
      shift 2
      ;;
    --max-files)
      MAX_FILES="${2:-}"
      shift 2
      ;;
    --max-lines)
      MAX_LINES="${2:-}"
      shift 2
      ;;
    --fetch)
      SHOULD_FETCH=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      log_error "Unknown argument: $1"
      usage
      exit "$EXIT_USAGE"
      ;;
  esac
done

if [ "$SHOULD_FETCH" -eq 1 ] && [ "$BASE_REF" = "origin/main" ]; then
  git fetch --prune origin main >/dev/null 2>&1 || true
fi

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  fail "$EXIT_BASE_REF_NOT_FOUND" "Base ref not found: $BASE_REF"
fi

PROTECTED_JOURNAL_PATH="src/components/journal/journal-section.tsx"
if [ ! -f "$PROTECTED_JOURNAL_PATH" ]; then
  echo "Checkpoint blocked: required file is missing: $PROTECTED_JOURNAL_PATH"
  echo "This usually means accidental rename or move."
  exit 2
fi

JOURNAL_DUPLICATES="$(find src/components/journal -maxdepth 1 -type f -name 'journal-section *.tsx' 2>/dev/null | sed '/^$/d')"
if [ -n "$JOURNAL_DUPLICATES" ]; then
  echo "Checkpoint blocked: suspicious duplicate journal files detected:"
  printf '%s\n' "$JOURNAL_DUPLICATES"
  echo "Keep only src/components/journal/journal-section.tsx"
  exit 2
fi

MERGE_BASE="$(git merge-base HEAD "$BASE_REF")"
# Compare working tree (committed + staged + unstaged) against merge-base.
CHANGED_FILES="$(git diff --name-only "$MERGE_BASE" | sed '/^$/d')"

if [ -z "$CHANGED_FILES" ]; then
  FILES_COUNT=0
else
  FILES_COUNT="$(printf '%s\n' "$CHANGED_FILES" | wc -l | tr -d ' ')"
fi

TOTAL_LINES="$(git diff --numstat "$MERGE_BASE" | awk '{a += ($1 ~ /^[0-9]+$/ ? $1 : 0); d += ($2 ~ /^[0-9]+$/ ? $2 : 0)} END {print a+d+0}')"

echo "Checkpoint diff vs ${BASE_REF}"
echo "- Changed files: ${FILES_COUNT} (limit: ${MAX_FILES})"
echo "- Changed lines: ${TOTAL_LINES} (limit: ${MAX_LINES})"

if [ "$FILES_COUNT" -gt "$MAX_FILES" ] || [ "$TOTAL_LINES" -gt "$MAX_LINES" ]; then
  echo
echo "Checkpoint required: report progress before continuing."
  if [ -n "$CHANGED_FILES" ]; then
    echo "Changed files:"
    printf '%s\n' "$CHANGED_FILES"
  fi
  exit 2
fi

echo "Within checkpoint limits."
