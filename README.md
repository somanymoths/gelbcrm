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

## Автоподключение `.env.local` для новых веток/worktree

Чтобы не копировать `.env.local` вручную при каждом новом checkout/worktree:

1. Создайте общий env-файл один раз (вне репозитория):
   mkdir -p ~/.config/gelbcrm
   cp .env.example ~/.config/gelbcrm/.env.local
2. Заполните реальные значения в `~/.config/gelbcrm/.env.local`.
3. Включите локальные git hooks проекта:
   git config core.hooksPath .githooks

После этого при `git checkout`/новой ветке hook автоматически создаст в репозитории symlink `.env.local`.
Если нужен другой путь, задайте `GELBCRM_SHARED_ENV_FILE`.

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
