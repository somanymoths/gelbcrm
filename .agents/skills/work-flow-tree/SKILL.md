---
name: work-flow-tree
description: Use when the user wants to set up or reuse a markdown-based development workflow in a project (plan.md-driven flow), scaffold a .workflow folder, collect project context, and automate routine updates like section status, progress logging, sections sync, and quality gates.
---

# Work Flow Tree

Используй этот skill, когда нужно быстро внедрить единый workflow в любой проект и автоматизировать рутину вокруг `plan.md`.

## Главные правила

- Не кодить без контекста.
- Не делать большие куски без промежуточной проверки.
- Не переходить дальше без тестов критичных сценариев.
- Не хранить знания только в голове или чате.
- Не релизить без ручной продуктовой проверки.
- Всегда работать через итерации.
- Относиться к агенту как к усилителю, а не как к автопилоту.

## Что делает skill

1. Разворачивает в проекте папку `.workflow` с шаблонами файлов.
2. Помогает собрать и проверить контекст проекта перед началом реализации.
3. Дает CLI для автоматизации:
- `init` — создать/обновить `.workflow`
- `sync-from-source` — синхронизировать шаблоны скилла из source-of-truth (`/Users/mxrxzxw/Desktop/moths/workflow`)
- `context-init` — создать/обновить контекстные файлы
- `context-check` — проверить, что контекст заполнен
- `start` — перевести секцию в `in_progress`
- `finish` — завершить секцию (`done` или `blocked`)
- `log` — добавить запись в `progress.md`
- `pr` — добавить ссылку на Pull Request в `progress.md`
- `sync-sections` — синхронизировать `plan.md` и `.workflow/sections`
- `gates` — запустить quality gates

## Команды

```bash
# 1) Инициализация workflow в проекте
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh init /abs/path/to/project

# 1.0) Принудительно обновить шаблоны скилла из source-of-truth
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh sync-from-source

# 1.1) Инициализация без удаления старого workflow
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh init /abs/path/to/project --keep-existing

# 2) Инициализация контекста
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh context-init /abs/path/to/project

# 3) Проверка контекста
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh context-check /abs/path/to/project

# 4) Старт секции (по номеру или заголовку)
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh start /abs/path/to/project 1.2

# 5) Завершение секции
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh finish /abs/path/to/project 1.2 done

# 6) Лог прогресса
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh log /abs/path/to/project "Сделан login/logout, тесты зеленые"

# 7) Записать PR-ссылку
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh pr /abs/path/to/project "https://github.com/org/repo/pull/123"

# 8) Синхронизировать секции
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh sync-sections /abs/path/to/project

# 9) Предпросмотр sync без записи
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh sync-sections /abs/path/to/project --dry-run

# 10) Запуск quality gates
bash /Users/mxrxzxw/Desktop/moths/skills/work-flow-tree/scripts/workflow-cli.sh gates /abs/path/to/project
```

## Важно

- Источник управления задачами: `plan.md`.
- Source-of-truth шаблонов: `/Users/mxrxzxw/Desktop/moths/workflow`.
- `init` автоматически пытается подтянуть свежие шаблоны из source-of-truth перед установкой в проект.
- `init` по умолчанию удаляет предыдущие workflow-артефакты проекта (`.workflow` и legacy-файлы workflow в корне проекта), затем разворачивает чистую структуру.
- Если нужно сохранить старые файлы, используй `init --keep-existing`.
- Перед `start/finish` выполняется валидация структуры `plan.md`.
- Перед `start` обязателен успешно заполненный контекст (`context-check`).
- `sync-sections` создает недостающие section-файлы и чинит ссылки в `plan.md`.
- `--dry-run` показывает изменения без записи в файлы.
- Перед `gates` заполни команды в `.workflow/gates.sh` под конкретный проект.
- Прогресс-блок по этапам (`✅ Старт`, `2️⃣ Декомпозиция`, и т.д.) выводится только после команды `start` и только в рамках выполнения активной секции. В обсуждениях настройки/дизайна процесса прогресс-блок не выводится.

## Этап: Декомпозиция через чат

Обязательная хронология этапа:

1. После старта секции агент сначала сам заполняет в `section-*.md` ответы на вопросы:
   - Какие есть 3-5 подходов к реализации этой идеи?
   - Какие пользовательские сценарии здесь основные?
   - Какие риски у такого функционала на первом релизе?
   - Что стоит делать в MVP, а что вынести за рамки?
   - Какие аналоги и UX-паттерны стоит посмотреть?
2. После этого чат задает уточняющие вопросы по одному в формате:
   - `Вопрос N`
   - `1. ...`
   - `2. ...`
   - `3. ...`
3. Во время вопросов агент параллельно обновляет блоки секции:
   - цель
   - задачи
   - acceptance criteria
   - техподход
   - риски
   - ограничения
4. После завершения вопросов агент формирует итог, добавляет ТЗ на реализацию в файл секции и дает ссылку на итоговый файл.

Результат этапа должен включать:

- список сценариев
- список рисков
- список гипотез
- понимание рамок MVP
- техническое задание для реализации
