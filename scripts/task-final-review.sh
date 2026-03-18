#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage:
  scripts/task-final-review.sh [--base origin/main] [--run-checks] [--output <path>]

Creates a review context file to run final review (human or separate model) before PR merge.
HELP
}

BASE_REF="origin/main"
RUN_CHECKS=0
OUTPUT_PATH=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      BASE_REF="${2:-}"
      shift 2
      ;;
    --run-checks)
      RUN_CHECKS=1
      shift
      ;;
    --output)
      OUTPUT_PATH="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if ! git rev-parse --verify "$BASE_REF" >/dev/null 2>&1; then
  echo "Base ref not found: $BASE_REF"
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH_NAME="$(git branch --show-current)"
TASK_DIR="${ROOT_DIR}/.codex/tasks/${BRANCH_NAME}"
SPEC_FILE="${TASK_DIR}/TASK.md"
SUMMARY_FILE="${TASK_DIR}/SUMMARY.md"

mkdir -p "$TASK_DIR"

if [ -z "$OUTPUT_PATH" ]; then
  OUTPUT_PATH="${TASK_DIR}/FINAL_REVIEW.md"
fi

MERGE_BASE="$(git merge-base HEAD "$BASE_REF")"
FILES_CHANGED="$(git diff --name-only "$MERGE_BASE" | sed '/^$/d')"
DIFF_STAT="$(git diff --shortstat "$MERGE_BASE" | sed 's/^ //')"
COMMITS="$(git log --oneline "$MERGE_BASE"..HEAD)"
NOW_TS="$(date '+%Y-%m-%d %H:%M %Z')"
CHECKS_RESULT="Не запускались"

if [ "$RUN_CHECKS" -eq 1 ]; then
  CHECKS_RESULT="Успешно"
  for cmd in "npm run typecheck" "npm run lint" "npm run build"; do
    echo "[review] Running: $cmd"
    if ! eval "$cmd"; then
      CHECKS_RESULT="Есть ошибки (см. вывод команд)"
      break
    fi
  done
fi

cat > "$OUTPUT_PATH" <<REVIEW
# Финальное ревью перед PR

- Дата: ${NOW_TS}
- Ветка: ${BRANCH_NAME}
- База сравнения: ${BASE_REF}
- Diff stat: ${DIFF_STAT:-нет изменений}
- Локальные проверки: ${CHECKS_RESULT}

## 1. Входные материалы для ревью
- План/ТЗ: ${SPEC_FILE}
- Резюме реализации: ${SUMMARY_FILE}

## 2. Список изменённых файлов
$(if [ -n "$FILES_CHANGED" ]; then printf '%s\n' "$FILES_CHANGED" | sed 's/^/- /'; else echo '- Нет изменений'; fi)

## 3. Коммиты в ветке
$(if [ -n "$COMMITS" ]; then printf '%s\n' "$COMMITS" | sed 's/^/- /'; else echo '- Нет коммитов'; fi)

## 4. Чеклист финального ревью (отдельная модель/ревьюер)
- [ ] Изменения соответствуют изначальному ТЗ и плану
- [ ] Проверены edge cases из TASK.md
- [ ] Нет явных регрессий в затронутых модулях
- [ ] Проверены RBAC/доступы и граничные сценарии
- [ ] Зафиксированы риски и план отката
REVIEW

echo "Final review context: $OUTPUT_PATH"
