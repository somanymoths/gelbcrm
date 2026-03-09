# GELB CRM — Техническое задание MVP (онлайн-школа языков)

## 1. Область MVP
Система для управления учениками, преподавателями, оплатами и расписанием занятий.

## 2. Роли и доступ

### 2.1 Роли
- `admin` — полный доступ ко всем разделам и действиям.
- `teacher` — доступ только к разделу `Журнал`.

### 2.2 RBAC-матрица
| Раздел / Действие | Admin | Teacher |
|---|---:|---:|
| Воронка: просмотр/создание/редактирование учеников | ✅ | ❌ |
| Воронка: смена этапов | ✅ | ❌ |
| Воронка: назначение преподавателя | ✅ | ❌ |
| Преподаватели: CRUD карточек | ✅ | ❌ |
| Оплаты: тарифы (CRUD) | ✅ | ❌ |
| Оплаты: история оплат (просмотр/ручная привязка) | ✅ | ❌ |
| Журнал: просмотр | ✅ | ✅ (только свои занятия) |
| Журнал: управление слотами/статусами | ✅ | ✅ (только свои занятия) |
| Пользователи: создание преподавателей, сброс паролей преподавателей | ✅ | ❌ |
| Сброс своего пароля через «Забыл пароль» | ✅ | ❌ |
| Аудит-лог: просмотр | ✅ | ❌ |

## 3. Функциональные разделы

### 3.1 Воронка (канбан)
Этапы (фиксированные):
1. Заинтересовался
2. Квалификация
3. Знакомство
4. Оплата
5. На занятиях
6. Последнее занятие
7. Отказался
8. Перестал заниматься

Карточка ученика:
- Обязательно: `first_name`, `last_name`.
- Необязательно: `contact_link`, `phone`, `email`, `notes`.
- Связанные данные (синхронизация):
  - назначенный преподаватель — из раздела `Преподаватели`;
  - данные об оплатах/балансе/тарифном плане — из раздела `Оплаты`;
  - история смены преподавателя — в карточке и в аудит-логе.

Валидации:
- `phone` и `email` уникальны глобально среди учеников (если заполнены).
- Дубли запрещены на уровне БД и API (жесткий отказ сохранения).
- `phone` вводится по маске и сохраняется в едином нормализованном формате: 8 (999) 999-99-99

### 3.2 Преподаватели
Карточка преподавателя:
- `full_name` (обязательно)
- `phone`
- `contact_link`
- `language`
- `lesson_rate_rub`
- `timezone` (для справки; в MVP расчет и отображение расписания в едином часовом поясе школы)

Управление карточками преподавателей: только администратор.

### 3.3 Оплаты
Подразделы:
- `Тарифы` — тарифные сетки и публичные ссылки оплаты.
- `История оплат` — все платежные события.

Логика тарифов:
- Администратор может создавать несколько тарифных сеток.
- Каждая сетка содержит набор пакетов (например, 4/8/16 занятий с разной ценой).
- По сетке создается ссылка оплаты, отправляемая ученику.

Логика после успешной оплаты:
1. Автоматическая запись в `Историю оплат`.
2. Автоматический перевод ученика на этап `На занятиях`.
3. Начисление баланса оплаченных занятий.
4. Выбранный в оплате тарифный план становится «основным» для ученика.
5. В карточке ученика отображается ссылка на оплату его основного тарифного плана.

Платежная интеграция MVP: `ЮKassa`.

Сопоставление платежа к ученику:
1. Точное совпадение `email`.
2. Если не найдено — точное совпадение `phone`.
3. Если не найдено — статус платежа `requires_manual_link`.
4. Администратор может вручную привязать такой платеж.

### 3.4 Журнал занятий
Доступ:
- `teacher`: только собственный журнал и собственные занятия.
- `admin`: полный доступ.

Функции:
- Шаблон недельного расписания (по дням недели, повторяемый).
- Разовые изменения на конкретную дату.
- Создание пустых слотов.
- Назначение ученика в слот из списка учеников, закрепленных за преподавателем.

Поля слота:
- `date` (дата)
- `start_time` (время начала)
- `student_id`
- `status`: `planned | completed | rescheduled | canceled`

Правила статусов и баланса:
- Длительность занятия фиксирована: 60 минут.
- `completed`: списать 1 занятие с баланса ученика.
- `rescheduled`: не списывать, создать новую дату.
- `canceled`: не списывать.

### 3.5 Уведомления
Получатель: администратор.
Каналы:
- Внутри CRM (центр уведомлений).
- Telegram-бот в личные сообщения (`chat_id` администратора).

События:
- новая успешная оплата;
- отмена занятия;
- низкий баланс занятий у ученика: при остатке `2` и `1`.

### 3.6 Аудит-лог
Полный аудит для администратора. Логировать:
- CRUD по ученикам, преподавателям, тарифам;
- смену этапа воронки;
- назначение/смену преподавателя ученику;
- события оплаты и ручные привязки;
- изменения расписания и статусов занятий;
- действия по пользователям (создание, сброс пароля преподавателя).

## 4. Нефункциональные требования
- Интерфейс: только русский язык.
- Валюта: RUB.
- Часовой пояс системы: `Europe/Moscow` (единый для расписания и журнала).
- Форм-фактор:
  - основной CRM: веб для ПК;
  - раздел `Журнал`: адаптивен для мобильного браузера.
- Импорт данных в MVP: не требуется (ввод вручную).

## 5. Технический стек и инфраструктура
- Frontend/Backend: `Next.js` (App Router).
- База данных: `MySQL` (Beget-совместимая конфигурация).
- Деплой: `VPS/Beget + MySQL`.
- Аутентификация: логин + пароль.
- Управление аккаунтами преподавателей: только администратор.

## 6. Модель данных (ER)

### 6.1 Сущности
- `users` — аккаунты системы.
- `teachers` — профиль преподавателя.
- `students` — карточка ученика.
- `student_notes` — заметки по ученику.
- `student_teacher_history` — история смен преподавателя.
- `funnel_stages` — справочник этапов воронки.
- `funnel_stage_history` — история смен этапа.
- `tariff_grids` — тарифные сетки.
- `tariff_packages` — пакеты внутри сетки.
- `payment_links` — ссылки на оплату сетки.
- `payments` — история платежей.
- `student_balances` — текущий баланс занятий.
- `teacher_weekly_slots` — шаблон слотов по дням недели.
- `lesson_slots` — экземпляры слотов на конкретные даты.
- `notifications` — внутренние уведомления.
- `admin_telegram_settings` — настройки Telegram администратора.
- `audit_logs` — аудит действий.

### 6.2 Ключевые связи
- `users (1) -> (0..1) teachers` по `user_id`.
- `teachers (1) -> (N) students` по `assigned_teacher_id`.
- `students (1) -> (N) student_notes`.
- `students (1) -> (N) payments`.
- `tariff_grids (1) -> (N) tariff_packages`.
- `tariff_grids (1) -> (N) payment_links`.
- `payment_links (1) -> (N) payments`.
- `teachers (1) -> (N) teacher_weekly_slots`.
- `teachers (1) -> (N) lesson_slots`.
- `students (1) -> (N) lesson_slots`.

### 6.3 Минимальные SQL-контуры (поля)

`users`
- id (uuid, pk)
- role (`admin|teacher`)
- login (unique)
- password_hash
- is_active
- created_at, updated_at

`teachers`
- id (uuid, pk)
- user_id (uuid, unique, fk users)
- full_name
- phone
- contact_link
- language
- lesson_rate_rub (numeric)
- timezone
- created_at, updated_at

`students`
- id (uuid, pk)
- first_name
- last_name
- contact_link
- phone (unique nullable)
- email (unique nullable)
- assigned_teacher_id (uuid fk teachers nullable)
- current_funnel_stage_id (int fk funnel_stages)
- primary_tariff_grid_id (uuid fk tariff_grids nullable)
- created_at, updated_at

`student_notes`
- id (uuid, pk)
- student_id (uuid fk students)
- author_user_id (uuid fk users)
- body (text)
- created_at

`tariff_grids`
- id (uuid, pk)
- name
- is_active
- created_by (uuid fk users)
- created_at, updated_at

`tariff_packages`
- id (uuid, pk)
- tariff_grid_id (uuid fk tariff_grids)
- lessons_count (int)
- price_per_lesson_rub (numeric)
- total_price_rub (numeric)
- is_active

`payment_links`
- id (uuid, pk)
- tariff_grid_id (uuid fk tariff_grids)
- public_slug (unique)
- is_active
- created_at

`payments`
- id (uuid, pk)
- provider (`yookassa`)
- provider_payment_id (unique)
- payment_link_id (uuid fk payment_links)
- tariff_package_id (uuid fk tariff_packages)
- student_id (uuid fk students nullable)
- payer_email
- payer_phone
- amount_rub (numeric)
- status (`pending|succeeded|failed|requires_manual_link|refunded`)
- paid_at
- raw_payload (jsonb)
- created_at, updated_at

`student_balances`
- student_id (uuid, pk fk students)
- lessons_left (int)
- updated_at

`teacher_weekly_slots`
- id (uuid, pk)
- teacher_id (uuid fk teachers)
- weekday (int 1-7)
- start_time (time)
- is_active

`lesson_slots`
- id (uuid, pk)
- teacher_id (uuid fk teachers)
- student_id (uuid fk students nullable)
- slot_date (date)
- start_time (time)
- status (`planned|completed|rescheduled|canceled`)
- rescheduled_to_slot_id (uuid fk lesson_slots nullable)
- source (`template|manual`)
- created_by (uuid fk users)
- updated_by (uuid fk users)
- created_at, updated_at

`notifications`
- id (uuid, pk)
- recipient_user_id (uuid fk users)
- type
- title
- body
- channel (`in_app|telegram`)
- is_read
- created_at

`audit_logs`
- id (uuid, pk)
- actor_user_id (uuid fk users)
- entity_type
- entity_id
- action
- diff_before (jsonb)
- diff_after (jsonb)
- created_at

## 7. API-контракты (MVP)

Префикс: `/api/v1`.
Авторизация: session/JWT cookie.

### 7.1 Auth
- `POST /auth/login`
- `POST /auth/forgot-password` (для admin)
- `POST /auth/reset-password`
- `POST /auth/logout`

### 7.2 Students / Funnel
- `GET /students?stage=&teacherId=&q=&page=`
- `POST /students`
- `GET /students/{id}`
- `PATCH /students/{id}`
- `PATCH /students/{id}/stage`
- `PATCH /students/{id}/assign-teacher`
- `GET /students/{id}/notes`
- `POST /students/{id}/notes`
- `GET /students/{id}/teacher-history`

Ошибки валидации:
- `409 DUPLICATE_EMAIL`
- `409 DUPLICATE_PHONE`
- `422 INVALID_PHONE_FORMAT`

### 7.3 Teachers
- `GET /teachers`
- `POST /teachers`
- `GET /teachers/{id}`
- `PATCH /teachers/{id}`
- `POST /teachers/{id}/reset-password`

### 7.4 Tariffs / Payment Links
- `GET /tariff-grids`
- `POST /tariff-grids`
- `GET /tariff-grids/{id}`
- `PATCH /tariff-grids/{id}`
- `POST /tariff-grids/{id}/packages`
- `PATCH /tariff-packages/{id}`
- `POST /tariff-grids/{id}/payment-links`
- `GET /payment-links/{slug}` (публичная страница выбора пакета)

### 7.5 Payments
- `GET /payments?status=&from=&to=&studentId=`
- `POST /payments/{id}/manual-link` (ручная привязка к ученику)
- `POST /webhooks/yookassa` (публичный webhook)

Webhook-процесс `payment.succeeded`:
1. Проверить подпись/валидность.
2. Найти `payment_link` и `tariff_package`.
3. Автопривязка к ученику по email -> phone.
4. Если ученик найден:
- создать payment `succeeded`;
- добавить баланс занятий;
- обновить `students.primary_tariff_grid_id`;
- перевести этап в `На занятиях`;
- создать уведомление admin.
5. Если не найден:
- payment со статусом `requires_manual_link`;
- уведомление admin.

### 7.6 Journal
- `GET /journal/weekly-template?teacherId=`
- `PUT /journal/weekly-template?teacherId=`
- `GET /journal/slots?teacherId=&dateFrom=&dateTo=`
- `POST /journal/slots`
- `PATCH /journal/slots/{id}`
- `POST /journal/slots/{id}/status`

Правила `status`:
- `completed` -> decrement balance on 1 (transactional lock).
- `rescheduled` -> create new slot + link `rescheduled_to_slot_id`.
- `canceled` -> balance unchanged.

### 7.7 Notifications / Audit
- `GET /notifications`
- `PATCH /notifications/{id}/read`
- `GET /audit-logs?entityType=&entityId=&actor=&from=&to=`

## 8. User Flows

### 8.1 Новый ученик -> первые оплаты -> занятия
1. Admin создает карточку ученика в воронке.
2. Admin проводит по этапам до `Оплата`.
3. Admin отправляет ссылку на нужную тарифную сетку.
4. Ученик оплачивает пакет в ЮKassa.
5. Webhook фиксирует оплату и обновляет карточку/баланс/этап.
6. Teacher видит ученика в журнале и ставит в слоты.
7. После `completed` баланс автоматически уменьшается.

### 8.2 Непривязанный платеж
1. Оплата пришла, но email/phone не совпали.
2. Платеж получает `requires_manual_link`.
3. Admin получает уведомление.
4. Admin вручную привязывает платеж к ученику.
5. Система доначисляет баланс и обновляет данные ученика.

### 8.3 Перенос занятия
1. Teacher меняет статус слота на `rescheduled`.
2. Система создает новый слот на новую дату.
3. Списание урока не происходит.

### 8.4 Отмена занятия
1. Teacher меняет статус на `canceled`.
2. Списание не выполняется.
3. Admin получает уведомление.

## 9. Транзакционность и консистентность
- Изменения по успешной оплате выполнять в одной транзакции.
- Списание баланса при `completed` выполнять с `SELECT ... FOR UPDATE` по `student_balances`.
- Идемпотентность webhook по `provider_payment_id`.
- Аудит писать атомарно вместе с основным действием.

## 10. Безопасность
- Хранить только `password_hash` (argon2/bcrypt).
- CSRF защита для cookie-сессий.
- RBAC-проверка на каждом API endpoint.
- Ограничение частоты на login/webhook endpoints.
- В webhook валидировать подпись ЮKassa.

## 11. План реализации по спринтам

### Спринт 1 (База системы)
- Инициализация Next.js проекта, UI shell.
- MySQL schema + миграции.
- Auth + роли.
- CRUD преподавателей.
- CRUD учеников + воронка + валидации дублей.
- Аудит-лог (ядро).

### Спринт 2 (Оплаты)
- Тарифные сетки и пакеты.
- Генерация payment links.
- Публичная страница выбора пакета.
- Интеграция ЮKassa + webhook + идемпотентность.
- История оплат + ручная привязка.
- Обновление баланса/этапа/основного тарифа после оплаты.

### Спринт 3 (Журнал + уведомления)
- Недельный шаблон расписания.
- Генерация/управление слотами.
- Статусы занятия с бизнес-правилами списания.
- Mobile-adaptive UI для журнала.
- In-app уведомления + Telegram DM.
- Сценарные e2e тесты критических потоков.

## 12. Критерии приемки MVP
- Админ полностью ведет воронку, преподавателей, оплаты и журнал.
- Преподаватель видит только свой журнал и своих учеников в нем.
- Нельзя создать дубль ученика по email/phone.
- Успешная оплата через ЮKassa автоматически:
  - попадает в историю,
  - обновляет этап ученика,
  - начисляет баланс,
  - закрепляет основной тарифный план.
- При `completed` баланс уменьшается на 1.
- При `rescheduled/canceled` баланс не уменьшается.
- Уведомления админу работают в CRM и Telegram.
- Полный аудит-лог доступен админу.
