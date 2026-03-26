# Операционный Runbook

Короткий справочник для типовых сбоев и предрелизной проверки.

## 1. Быстрый smoke-check

Перед релизом/перед началом большой задачи:

```bash
npm run ops:smoke
```

Проверяет:
- обязательные env (`DB_*`, `SESSION_SECRET`);
- доступность base ref (`origin/main`);
- что есть только канонический `journal-section.tsx` (без legacy `journal-section 4/5.tsx`);
- что лог `.codex/logs/task-tools.log` доступен для записи;
- `GET /api/health` (как warning, если dev-сервер не запущен).

Строгий режим с требованием health:

```bash
npm run ops:smoke -- --require-health
```

## 1.1 Release gate перед релизом

Единая команда предрелизного барьера:

```bash
npm run release:gate
```

Состав проверок:
- `ops:smoke`
- `npm test`
- `npm run typecheck`
- `npm run lint`
- `npm run build`

Флаги:
- `--require-health` — требовать `GET /api/health`;
- `--skip-tests` — пропустить тесты;
- `--skip-build` — пропустить build.

## 2. Типовые сбои и действия

### 2.1 Missing required env vars
Симптом: `SERVER_MISCONFIGURED`, preflight ругается на `DB_*`/`SESSION_SECRET`.

Действия:
1. Проверить `.env.local`.
2. Запустить `node scripts/env-preflight.cjs`.
3. Перезапустить `npm run dev` или `npm run build`.

### 2.2 Base ref not found
Симптом: `Base ref not found: origin/main` в `task:checkpoint`/`task:review`.

Действия:
1. `git fetch --prune origin main`
2. Повторить команду.

Примечание: теперь скрипты по умолчанию уже пробуют fetch автоматически.

### 2.3 Dev не поднимается
Симптом: `Dev server did not become ready in time`.

Действия:
1. Проверить лог `./.codex/logs/dev-<PORT>.log`.
2. Проверить `GET http://localhost:<PORT>/api/health`.
3. Проверить env (`node scripts/env-preflight.cjs`).

### 2.4 Runtime/кэш аномалии
Симптом: подозрение на stale cache или повторные операции.

Действия:
1. Запросить `GET /api/v1/system/runtime-cache` под admin.
2. Проверить метрики `requestCache`/`idempotency`.
3. Сопоставить с логом `.codex/logs/task-tools.log`.
4. При необходимости сбросить:
   - `POST /api/v1/system/runtime-cache?scope=all`
   - `POST /api/v1/system/runtime-cache?scope=request`
   - `POST /api/v1/system/runtime-cache?scope=idempotency`

### 2.6 Трассировка запроса по request id
Симптом: трудно сопоставить ошибку API и конкретный запрос.

Действия:
1. Проверить заголовок ответа `x-request-id`.
2. Использовать этот id при поиске JSON-логов backend (см. поля `requestId`, `event`, `route`).
3. Для infra-ошибок (env/db) смотреть события:
   - `infra.server_misconfigured`
   - `infra.db_unreachable`
   - `infra.db_auth_failed`

### 2.5 Ошибки localStorage в оплатах
Симптом: пропажа/повреждение локальных данных в UI оплат.

Действия:
1. Открыть страницу оплат заново.
2. Проверить консоль браузера на ошибки доступа к storage.
3. При необходимости очистить ключи `gelbcrm:tariffs` и `gelbcrm:payments`.

## 3. Полезные команды

```bash
npm run task:checkpoint
npm run task:review
npm run ops:smoke -- --require-health
npm run release:gate -- --require-health
```
