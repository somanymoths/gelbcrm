# GELB CRM: Project Context

Этот файл — единая краткая карта проекта для старта новых задач в отдельных чатах.

## 1) Технологический стек

- Frontend/Backend: Next.js App Router + TypeScript (`src/app/**`, `src/components/**`)
- DB: MySQL (`mysql2`)
- Auth/Session: cookie-сессия (`gelb_session`), role-based доступ
- Роли:
  - `admin`: полный доступ
  - `teacher`: ограниченный доступ

## 2) Ключевые домены

- `funnel`: карточки, стадии, причины потерь, аудит
- `payments`: тарифы, ссылки, история, webhook
- `teachers`: карточки, архив, зависимости
- `students`: базовые операции и привязки

## 3) Критичные инварианты

1. `teacher` не должен получать `admin`-доступ к закрытым разделам/эндпоинтам.
2. Переходы статусов в payment/funnel должны быть явными и идемпотентными.
3. Изменения схемы БД только через новые миграции в `db/migrations`.
4. Без явной задачи не ломать API-контракты.

## 4) Основные источники контекста

- `docs/openapi.yaml`
- `docs/funnel.md`
- `docs/teachers.md`
- `docs/MVP_TECH_SPEC_RU.md`
- `db/migrations/*.mysql.sql`

## 5) Обязательные проверки перед PR

```bash
npm run typecheck
npm run lint
npm run build
```

## 6) Быстрый автозапуск ветки из текста задачи

```bash
scripts/new-task-branch.sh "Новая задача: <текст задачи>"
```

Опции:
- `--type feat|fix|chore|hotfix`
- `--issue GELB-123`
- `--push`
- `--no-bootstrap`
- `--no-check`

Пример:

```bash
scripts/new-task-branch.sh "Исправить дубли платежей в воронке" --type fix --issue GELB-412 --push
```

По умолчанию скрипт после создания ветки проверяет зависимости в текущем worktree и при необходимости запускает `npm ci` (или `npm install`, если lockfile отсутствует), а затем выполняет `npm run typecheck` и `npm run lint`. Это нужно, чтобы новая ветка сразу была готова к текущему `pre-push` hook и `push`. Если нужен только быстрый checkout без подготовки, используй `--no-bootstrap` и/или `--no-check`.

## 7) Правило контекста

Контекст проекта хранится в документах `docs/*`, PR-описаниях, миграциях и коде. Чат — рабочая сессия под одну задачу.
