# GELB CRM (MVP Scaffold)

Каркас проекта CRM для языковой онлайн-школы.

## Быстрый старт

1. Установить зависимости:
   npm install
2. Создать `.env.local` из примера:
   cp .env.example .env.local
3. Заполнить MySQL-настройки Beget (`DB_HOST`, `DB_PORT`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`).
4. Применить миграции:
   npm run db:migrate
5. Создать администратора:
   ADMIN_LOGIN=admin ADMIN_PASSWORD=admin123 npm run db:seed:admin
6. Запустить dev-сервер:
   npm run dev
7. Открыть:
   http://localhost:3000

Важно:
- Перед `dev/build` выполняется preflight обязательных переменных окружения (`DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`, `SESSION_SECRET`).
- Канонический файл журнала: `src/components/journal/journal-section.tsx` (без fallback-алиасов).

Для старта новой задачи используйте bootstrap-скрипт:

```bash
npm run task:start -- "Добавить фильтр по преподавателю" --type fix --push
```

Скрипт:
- синхронизирует `main` из `origin/main`;
- создаёт ветку `codex/<type>/<slug>`;
- инициализирует task-файлы в `.codex/tasks/<branch>/` (`TASK.md`, `SUMMARY.md`);
- при наличии токена создаёт страницу в Notion;
- запускает локальный dev-сервер.
- проверяет готовность dev-сервера через `GET /api/health`.

## Workflow задачи

1. Инициация: `npm run task:start -- "<текст задачи>" --type fix --push`
2. Заполнить ТЗ/план и edge cases в `.codex/tasks/<branch>/TASK.md`
3. Реализация малыми шагами, периодический контроль: `npm run task:checkpoint`
4. После каждого логического этапа: `npm run task:summary -- "<краткий итог>"`
5. Перед PR: `npm run task:review` (прогон проверок + файл финального ревью)
6. После merge в `main`: `npm run deploy` (деплоит именно `origin/main`)

Подробный процесс: `docs/WORKFLOW_RU.md`.

## Изолированное тестовое пространство (Sandbox)

Если нужно тестировать весь функционал без путаницы с серверными данными, используйте sandbox:

1. Поднять локальную изолированную БД + миграции + тестового админа:
   `npm run sandbox:up`
2. Запустить приложение в sandbox-режиме:
   `npm run dev:sandbox`
3. Войти в CRM под тестовым пользователем:
   `admin / admin123`

Что изолировано:
- Используется отдельная локальная БД (Docker MySQL на `127.0.0.1:3307`).
- Данные не попадают в продовую БД на сервере.
- Платежи в sandbox работают в mock-режиме (`PAYMENTS_MOCK_MODE=1`) и не отправляются в YooKassa.

Остановить и удалить sandbox-БД:
- `npm run sandbox:down`

## Аутентификация

- Вход: `POST /api/v1/auth/login`
- Текущий пользователь: `GET /api/v1/auth/me`
- Выход: `POST /api/v1/auth/logout`
- Сессия хранится в `HttpOnly` cookie `gelb_session`.

## RBAC (MVP)

- `admin`: полный доступ к `Воронка`, `Преподаватели`, `Оплаты`, `Журнал`.
- `teacher`: только `Журнал`.
- Роутинг по ролям проверяется в `middleware`.

## Важно для Beget

- В Beget MySQL часто доступен как `DB_HOST=localhost` только внутри хостинга.
- Для локальной разработки с ноутбука может потребоваться отдельный внешний MySQL-хост или SSH-туннель.

## Важные файлы

- `db/migrations/0001_init.mysql.sql` — начальная схема БД (MySQL)
- `docs/openapi.yaml` — API контракт MVP
- `docs/MVP_TECH_SPEC_RU.md` — полное ТЗ
- `scripts/migrate.cjs` — runner миграций
- `scripts/seed-admin.cjs` — seed администратора
