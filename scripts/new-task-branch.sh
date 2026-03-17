#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage:
  scripts/new-task-branch.sh "<task text>" [--type feat|fix|chore|hotfix] [--issue GELB-123] [--base main] [--push]

Examples:
  scripts/new-task-branch.sh "Новая задача: исправить дубли платежей в воронке"
  scripts/new-task-branch.sh "Добавить фильтр по преподавателю" --type feat --issue GELB-412 --push
HELP
}

if [ "${1:-}" = "" ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 1
fi

TASK_TEXT="$1"
shift || true

TYPE=""
ISSUE=""
BASE_BRANCH="main"
PUSH_BRANCH=0

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

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Run this script from inside a git repository."
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
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
if [ "$CURRENT_BRANCH" != "$BASE_BRANCH" ]; then
  git checkout "$BASE_BRANCH"
fi

git pull --ff-only
git checkout -b "$TARGET_BRANCH"

if [ "$PUSH_BRANCH" -eq 1 ]; then
  git push -u origin "$TARGET_BRANCH"
fi

printf 'Created branch: %s\n' "$TARGET_BRANCH"
printf 'From base: %s\n' "$BASE_BRANCH"
