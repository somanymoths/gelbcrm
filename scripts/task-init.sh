#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'HELP'
Usage:
  scripts/task-init.sh "<task title>" [--branch <branch>] [--base <base-ref>] [--overwrite]

Examples:
  scripts/task-init.sh "Исправить deprecated props antd"
  scripts/task-init.sh "Добавить фильтр по преподавателю" --branch codex/feat/add-teacher-filter
HELP
}

if [ "${1:-}" = "" ] || [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 1
fi

TASK_TITLE="$1"
shift || true

BRANCH_NAME="$(git branch --show-current 2>/dev/null || true)"
BASE_REF="origin/main"
OVERWRITE=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --branch)
      BRANCH_NAME="${2:-}"
      shift 2
      ;;
    --base)
      BASE_REF="${2:-}"
      shift 2
      ;;
    --overwrite)
      OVERWRITE=1
      shift
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

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TASK_DIR="${ROOT_DIR}/.codex/tasks/${BRANCH_NAME}"
TASK_FILE="${TASK_DIR}/TASK.md"
SUMMARY_FILE="${TASK_DIR}/SUMMARY.md"
CREATED_AT="$(date '+%Y-%m-%d %H:%M %Z')"

mkdir -p "$TASK_DIR"

if [ -f "$TASK_FILE" ] && [ "$OVERWRITE" -ne 1 ]; then
  echo "Task spec already exists: $TASK_FILE"
else
  cat > "$TASK_FILE" <<SPEC
# Задача: ${TASK_TITLE}

- Ветка: ${BRANCH_NAME}
- База сравнения: ${BASE_REF}
- Дата старта: ${CREATED_AT}

## 1. Контекст
- 

## 2. Подробное ТЗ
- Цель:
- Что входит:
- Что не входит:
- Ограничения (RBAC/БД/API/UI):

## 3. План реализации (3-7 шагов)
1. 
2. 
3. 

## 4. Edge cases (минимум 3)
1. 
2. 
3. 

## 5. Проверка и валидация
- [ ] npm run typecheck
- [ ] npm run lint
- [ ] npm run build
- [ ] Smoke-тест ключевого пользовательского сценария

## 6. Definition of Done
- [ ] ТЗ покрыто полностью
- [ ] Нет явных регрессий в затронутых модулях
- [ ] Обновлены связанные docs/notes (если нужно)
SPEC
fi

if [ ! -f "$SUMMARY_FILE" ] || [ "$OVERWRITE" -eq 1 ]; then
  cat > "$SUMMARY_FILE" <<SUMMARY
# Резюме по задаче

- Ветка: ${BRANCH_NAME}
- Дата старта: ${CREATED_AT}

## Записи
SUMMARY
fi

echo "Task docs directory: $TASK_DIR"
echo "Spec: $TASK_FILE"
echo "Summary: $SUMMARY_FILE"
