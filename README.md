# GELB CRM (MVP Scaffold)

Каркас проекта CRM для языковой онлайн-школы.

## Быстрый старт

1. Установить зависимости:
   npm install
2. Запустить dev-сервер:
   npm run dev
3. Открыть:
   http://localhost:3000

## Демо ролей

Временно роль берется из cookie `role`:
- `admin` (по умолчанию)
- `teacher`

Для проверки teacher можно вручную установить cookie в браузере.

## Важные файлы

- `db/migrations/0001_init.sql` — начальная схема БД
- `docs/openapi.yaml` — API контракт MVP
- `docs/MVP_TECH_SPEC_RU.md` — полное ТЗ
