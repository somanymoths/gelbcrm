# План миграции UI c Ant Design на shadcn/ui

## Цель
Перевести интерфейс GELB CRM с `antd` на `shadcn/ui` поэтапно, без остановки разработки и без регрессии ключевых пользовательских сценариев.

## Текущее состояние (baseline)
- UI-зависимости: `antd`, `@ant-design/icons`, `@ant-design/nextjs-registry`.
- В проекте пока нет `components.json` и стартовой инициализации shadcn.
- Наиболее нагруженные Ant-экраны:
  - `src/components/funnel-board.tsx`
  - `src/components/teachers/teachers-section.tsx`
  - `src/components/journal/journal-section.tsx`
  - `src/components/payments/tariffs-tab.tsx`
  - `src/components/payments/history-tab.tsx`

## Принципы миграции
- Инкрементально: маленькие PR, один домен за раз.
- Поведенческий паритет: сначала эквивалент UX/функций, затем улучшения.
- Временный coexistence: Ant и shadcn могут жить параллельно до финальной зачистки.
- Контроль качества на каждом шаге: typecheck, lint, smoke по основным сценариям.

## Целевая архитектура
- Базовые UI-примитивы: `src/components/ui/*` (кнопка, инпут, селект, модалка, табы, таблица-обертка, алерт).
- Стилизация: Tailwind + дизайн-токены через CSS variables.
- Формы: `react-hook-form` + `zod` (вместо `antd Form`).
- Таблицы: `@tanstack/react-table` + свои обертки под сортировку/фильтры/пагинацию.
- Иконки: `lucide-react` (поэтапная замена `@ant-design/icons`).

## Поэтапный план

### Этап 0. Подготовка инфраструктуры
- Инициализировать shadcn (`components.json`, базовые alias, tailwind-конфиг).
- Добавить минимальный набор компонентов: `button`, `input`, `label`, `textarea`, `card`, `alert`, `dialog`, `tabs`, `dropdown-menu`, `select`, `table`, `badge`.
- Ввести helper-утилиты (`cn`) и единые переменные темы.
- Зафиксировать правила именования и API оберток в `src/components/ui`.

Критерий выхода:
- Можно собрать экран без импортов из `antd` на базовом наборе shadcn-компонентов.

### Этап 1. Пилотные low-risk экраны
- Мигрировать:
  - `src/app/error.tsx`
  - `src/app/global-error.tsx`
  - `src/app/forbidden/page.tsx`
  - `src/components/runtime-error-boundary.tsx`
  - `src/components/login-form.tsx` (+ `src/app/login/page.tsx`)
- Проверить визуальный паритет и доступность (focus, клавиатурная навигация).

Критерий выхода:
- Авторизация и error flows работают без `antd` компонентов на этих страницах.

### Этап 2. Payments-домен
- Мигрировать `tabs`, `forms`, `table`, `modal`, `dropdown` в `payments/*`.
- Заменить `antd message` на централизованный toast-подход.
- Проверить сценарии: создание тарифа, редактирование, добавление пакета, просмотр истории.

Критерий выхода:
- `src/app/payments/page.tsx` и `src/components/payments/*` не импортируют `antd`.

### Этап 3. Journal-домен
- Мигрировать `journal-section` (фильтры, модалки, actions, статусы).
- Вынести повторяющиеся паттерны в переиспользуемые UI-блоки.

Критерий выхода:
- Журнал работает на shadcn без потери действий по слотам и статусам.

### Этап 4. Teachers-домен
- Самый сложный объем форм + таблиц + модалок.
- Делить на несколько PR:
  - список/таблица;
  - модалка деталей и редактирование;
  - создание преподавателя и привязки к студентам.

Критерий выхода:
- Полный teachers flow без `antd`.

### Этап 5. Funnel board
- Пошагово мигрировать карточки, тулбар, модалки, селекты, notes/payout UX.
- Отдельно прогнать сценарии массовых действий и оплатных ссылок.

Критерий выхода:
- Funnel board без импортов Ant и без UX-регрессии в ключевых операциях.

### Этап 6. Финальная зачистка
- Удалить из `package.json`: `antd`, `@ant-design/icons`, `@ant-design/nextjs-registry`.
- Удалить `antd/dist/reset.css` и Ant registry provider из layout/providers.
- Прогнать полный цикл: `typecheck`, `lint`, `build`, smoke-тесты.

Критерий выхода:
- В кодовой базе нет импортов `antd` и связанных пакетов.

## Матрица замен (минимальный слой соответствий)
- `Button` -> `ui/button`
- `Input`/`Input.TextArea` -> `ui/input` + `ui/textarea`
- `Form`/`Form.Item` -> `react-hook-form` + `ui/form`
- `Select` -> `ui/select` (или `popover + command` для searchable)
- `Modal` -> `ui/dialog`
- `Tabs` -> `ui/tabs`
- `Tag` -> `ui/badge`
- `Alert` -> `ui/alert`
- `Table` -> `react-table` + `ui/table`
- `Dropdown`/`Menu` -> `ui/dropdown-menu`

## Риски и как снижать
- Риск: рассинхрон валидации форм.
  - Митигировать: единый слой `zod`-схем и интеграционные smoke-тесты submit/ошибок.
- Риск: потеря фич `antd Table`.
  - Митигировать: заранее определить обязательный функционал таблиц по доменам.
- Риск: UI-конфликты в переходный период.
  - Митигировать: ограничить глобальные стили, держать миграцию локально по страницам.

## Контрольный чеклист на каждый PR миграции
- [ ] Нет новых импортов из `antd` в затронутом модуле
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] Smoke сценарий для затронутого домена пройден
- [ ] Обновлен `.codex/tasks/<branch>/SUMMARY.md`
