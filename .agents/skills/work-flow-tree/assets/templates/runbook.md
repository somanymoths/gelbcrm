# Операционный регламент (runbook)

Инструкция для локальной разработки, тестов и безопасного отката.

## 1. Локальный запуск

Заполни команды под свой проект:

```bash
# install
...
# run dev server
...
```

## 2. Команды тестирования (quality gates)

Заполни и используй как обязательный минимум перед commit/PR:

```bash
# lint
...
# typecheck
...
# integration tests
...
# e2e smoke (optional)
...
```

## 3. DB / migrations

```bash
# apply migrations
...
# rollback migrations
...
# seed (optional)
...
```

## 4. Безопасное восстановление (вместо импульсивного reset)

```bash
# 1) сохранить текущее состояние
git switch -c checkpoint/$(date +%Y%m%d-%H%M)
git add -A && git commit -m "chore: checkpoint before risky fix"

# 2) вернуться к последнему стабильному commit в рабочей ветке
# (через switch/cherry-pick или revert, а не слепой hard reset)
```

## 5. Релиз / деплой

```bash
# build
...
# deploy
...
```

## 6. Разбор инцидента

* Зафиксировать симптом
* Оценить impact
* Остановить ухудшение
* Сделать минимальный фикс
* Добавить regression test
* Обновить `bugs.md`
