# Пропозиція архітектури P1/P2: персональні сповіщення, інтернет, дисципліна і scope коменданта

Статус: реалізовано в API та React-інтерфейсі; міграції `005`-`013` застосовані.  
Дата оновлення: 27.05.2026.

## Мета інкременту

Розширити DormManager функціями, які мають сенс для реального Студмістечка:

- персональний центр сповіщень і нагадування про оплати;
- статус оплаченої інтернет-послуги на рівні кімнати;
- офіційні дисциплінарні записи з керованою політикою балів;
- закріплення коменданта за одним або кількома гуртожитками з жорстким
  обмеженням його даних і дій.

Фраза "for personal too" у цьому дизайні трактується у двох корисних сенсах:
повідомлення є персональними для кожного отримувача, а механізм inbox може
використовуватися не тільки студентами, але й персоналом
(`commandant`, `maintenance_staff`, `administrator`).

## Уточнення нумерації кімнат

Міграція `010_room_naming_layout_mode.sql` розділяє два типи житлового
планування. У гуртожитку з блоками номер кімнати містить номер поверху,
номер блоку та літеру кімнати (`201а`, `201б`). У гуртожитку без блоків
використовуються цифрові номери без літер (`201`, `202`).

## Важлива залежність від фінансів

Поточні `service` і `transactions` реєструють тариф та факт оплати, але не
відповідають на питання "що саме вже нараховано за цей семестр/місяць і чи є
борг". Тому автоматичне нагадування про оплату має спиратися не на відсутність
довільної транзакції, а на непогашене нарахування (`billing_charge`).

Нижче запропоновано мінімальне розширення фінансової моделі, необхідне для:

- семестрового нагадування за проживання;
- щомісячного нагадування за інтернет кімнати;
- обчислюваного статусу `інтернет активний і оплачений`;
- подальшої автоматичної перевірки боргу в заяві на продовження проживання.

## Порядок міграцій

| Файл | Призначення | Залежність |
| --- | --- | --- |
| `005_staff_dorm_scope.sql` | Закріплення персоналу й маршрутизація заяв | `users`, `dorm`, `application` |
| `006_billing_charges_and_services.sql` | Періодичні послуги та нарахування | чинні `service`, `transactions`, `residence`, `room` |
| `007_room_internet_subscription.sql` | Підключення інтернету кімнати | `room`, `service`, `users` |
| `008_personal_notifications.sql` | Персональний inbox та ідемпотентні нагадування | `users`, `billing_charge` |
| `009_disciplinary_records.sql` | Формальні порушення/попередження | `residence`, `application`, `users` |
| `010_room_naming_layout_mode.sql` | Блочна нумерація з літерами та режим кімнат без блоків | `dorm`, `room` |
| `011_automatic_billing_cycles.sql` | Автоматичні щомісячні нарахування та календар семестрів | `service`, `billing_charge`, `residence` |
| `012_maintenance_workflow.sql` | Спеціалізації, категорії ремонту та коментарі заявки | `users`, `application` |
| `013_disciplinary_points_policy.sql` | Довідник правил, бали й максимальний ліміт `35` | `disciplinary_record` |

## `006_billing_charges_and_services.sql`

Необхідна причина: нагадування не повинні вгадувати борг за історією оплат.

```sql
BEGIN;

CREATE TYPE billing_frequency AS ENUM ('once', 'monthly', 'semester');
CREATE TYPE charge_status AS ENUM ('pending', 'paid', 'cancelled', 'overdue', 'waived');
CREATE TYPE charge_subject_type AS ENUM ('residence', 'room');

ALTER TABLE service
  ADD COLUMN service_code VARCHAR(40) UNIQUE,
  ADD COLUMN billing_frequency billing_frequency NOT NULL DEFAULT 'once',
  ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE billing_charge (
  id BIGSERIAL PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
  subject_type charge_subject_type NOT NULL,
  residence_id BIGINT REFERENCES residence(id) ON DELETE RESTRICT,
  room_id BIGINT REFERENCES room(id) ON DELETE RESTRICT,
  responsible_user_id BIGINT REFERENCES users(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  status charge_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT billing_charge_period_valid CHECK (period_end >= period_start),
  CONSTRAINT billing_charge_subject_valid CHECK (
    (subject_type = 'residence' AND residence_id IS NOT NULL AND room_id IS NULL)
    OR
    (subject_type = 'room' AND room_id IS NOT NULL AND residence_id IS NULL)
  )
);

CREATE UNIQUE INDEX billing_charge_unique_period_subject
  ON billing_charge(service_id, subject_type, COALESCE(residence_id, 0), COALESCE(room_id, 0), period_start, period_end);

CREATE INDEX billing_charge_due_status_index
  ON billing_charge(status, due_date);

ALTER TABLE transactions
  ADD COLUMN charge_id BIGINT REFERENCES billing_charge(id) ON DELETE SET NULL;

CREATE INDEX transactions_charge_index ON transactions(charge_id);

CREATE UNIQUE INDEX transactions_one_success_per_charge
  ON transactions(charge_id)
  WHERE charge_id IS NOT NULL AND payment_status = 'succeeded';

COMMIT;
```

Правила:

- `ACCOMMODATION` має `billing_frequency = 'semester'` і charge на
  `residence`; персональний платник - студент.
- `INTERNET` має `billing_frequency = 'monthly'` і charge на `room`; оплатити
  його може один активний мешканець, але статус послуги стосується всієї
  кімнати.
- `responsible_user_id` визначає платника і основного отримувача нагадування.
  Для room-internet, якщо потрібні нагадування кожному мешканцю, inbox
  розсилається всім активним residence кімнати.
- кілька невдалих спроб платежу можуть посилатися на одне нарахування, але
  успішна транзакція для нього може бути лише одна.

## `008_personal_notifications.sql`

```sql
BEGIN;

CREATE TYPE notification_type AS ENUM (
  'payment_reminder',
  'application_update',
  'disciplinary_record',
  'internet_status',
  'staff_assignment',
  'system'
);

CREATE TYPE notification_priority AS ENUM ('info', 'warning', 'urgent');

CREATE TABLE notification (
  id BIGSERIAL PRIMARY KEY,
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type notification_type NOT NULL,
  priority notification_priority NOT NULL DEFAULT 'info',
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  related_entity_type VARCHAR(40),
  related_entity_id BIGINT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  deduplication_key VARCHAR(180) NOT NULL UNIQUE,
  read_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX notification_recipient_created_index
  ON notification(recipient_user_id, created_at DESC);

CREATE INDEX notification_recipient_unread_index
  ON notification(recipient_user_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE notification_job_run (
  id BIGSERIAL PRIMARY KEY,
  job_name VARCHAR(80) NOT NULL,
  business_date DATE NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT notification_job_daily_unique UNIQUE (job_name, business_date)
);

COMMIT;
```

Нагадування:

| Правило | Джерело істини | Ключ дедуплікації |
| --- | --- | --- |
| Проживання на початку семестру | непогашений `billing_charge` з `ACCOMMODATION` | `charge:{chargeId}:housing-reminder:{userId}` |
| Інтернет кожного місяця | непогашений room charge з `INTERNET` | `charge:{chargeId}:internet-reminder:{userId}` |
| Зміна статусу заяви | оновлення `application.status` | `application:{id}:status:{status}:{userId}` |
| Дисциплінарний запис | новий `disciplinary_record` | `disciplinary:{id}:issued:{userId}` |
| Призначення коменданта | новий `staff_dorm_assignment` | `staff-dorm:{id}:assigned:{userId}` |

Персональність забезпечується полем `recipient_user_id`: користувач читає
виключно власні повідомлення; адміністратор не підміняє цей inbox у звичайному
інтерфейсі.

## `007_room_internet_subscription.sql`

```sql
BEGIN;

CREATE TYPE room_service_status AS ENUM ('inactive', 'active', 'suspended');

CREATE TABLE room_internet_subscription (
  room_id BIGINT PRIMARY KEY REFERENCES room(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
  status room_service_status NOT NULL DEFAULT 'inactive',
  activated_at DATE,
  suspended_at DATE,
  updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT room_internet_dates_valid CHECK (
    suspended_at IS NULL OR activated_at IS NULL OR suspended_at >= activated_at
  )
);

COMMIT;
```

Статус, який показується користувачу, не слід зберігати окремим boolean.
Backend обчислює його для поточного місяця:

```text
not_connected = subscription відсутня або inactive
payment_due   = subscription active, але немає paid charge поточного місяця
active_paid   = subscription active і charge поточного місяця paid
suspended     = subscription suspended
```

Таким чином напис "Інтернет активний" не може залишитися зеленим після
неоплаченого нового місяця.

## `009_disciplinary_records.sql`

```sql
BEGIN;

CREATE TYPE disciplinary_record_type AS ENUM ('formal_warning', 'violation');
CREATE TYPE disciplinary_record_status AS ENUM ('active', 'resolved', 'revoked');

CREATE TABLE disciplinary_record (
  id BIGSERIAL PRIMARY KEY,
  residence_id BIGINT NOT NULL REFERENCES residence(id) ON DELETE RESTRICT,
  issued_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  record_type disciplinary_record_type NOT NULL,
  status disciplinary_record_status NOT NULL DEFAULT 'active',
  incident_date DATE NOT NULL,
  rule_reference VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  resolution_note TEXT,
  resolved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX disciplinary_residence_status_index
  ON disciplinary_record(residence_id, status, incident_date DESC);

CREATE TABLE eviction_disciplinary_basis (
  application_id BIGINT NOT NULL REFERENCES application(id) ON DELETE CASCADE,
  disciplinary_record_id BIGINT NOT NULL REFERENCES disciplinary_record(id) ON DELETE RESTRICT,
  PRIMARY KEY (application_id, disciplinary_record_id)
);

COMMIT;
```

Правила:

- запис пов'язаний саме з `residence`, щоб зберігалася кімната і гуртожиток,
  де мешкав студент на момент порушення;
- `formal_warning` та `violation` є документованими фактами, не балами;
- накопичення записів не виселяє студента автоматично: комендант створює
  заяву/рішення `eviction` і додає записи як підстави;
- студент бачить власні записи та статус розгляду; комендант бачить записи
  тільки в закріплених гуртожитках.

## `005_staff_dorm_scope.sql`

Таблиця названа `staff_dorm_assignment`, а не `commandant_dorm`, щоб надалі
той самий scope можна було застосувати до персоналу ремонтів. У цьому
інкременті жорстке обмеження обов'язкове для ролі `commandant`.

```sql
BEGIN;

CREATE TABLE staff_dorm_assignment (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  dorm_id BIGINT NOT NULL REFERENCES dorm(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMPTZ,
  CONSTRAINT staff_dorm_assignment_period_valid CHECK (
    ended_at IS NULL OR ended_at >= assigned_at
  ),
  CONSTRAINT staff_dorm_assignment_unique UNIQUE (user_id, dorm_id)
);

CREATE INDEX staff_dorm_active_user_index
  ON staff_dorm_assignment(user_id, dorm_id)
  WHERE active = TRUE;

ALTER TABLE application
  ADD COLUMN managed_dorm_id BIGINT REFERENCES dorm(id) ON DELETE SET NULL;

CREATE INDEX application_managed_dorm_index
  ON application(managed_dorm_id, status);

COMMIT;
```

Навіщо `application.managed_dorm_id`: у новій заяві на первинне поселення
ще немає кімнати. Адміністратор маршрутизує її до гуртожитку, після чого
відповідний комендант може призначити вільну кімнату. Для заяв поточного
мешканця `managed_dorm_id` автоматично береться з активного проживання.

## Backend Архітектура

### Нові модулі

```text
backend/src/
|-- controllers/
|   |-- notification.controller.js
|   |-- billing.controller.js
|   |-- internet.controller.js
|   |-- disciplinary.controller.js
|   `-- staff-dorm.controller.js
|-- routes/
|   |-- notification.routes.js
|   |-- billing.routes.js
|   |-- internet.routes.js
|   |-- disciplinary.routes.js
|   `-- staff-dorm.routes.js
|-- services/
|   |-- notification.service.js
|   |-- reminder.service.js
|   |-- billing.service.js
|   `-- dorm-scope.service.js
`-- jobs/
    `-- payment-reminder.job.js
```

Контролери мають лише приймати/валідувати запит і формувати response.
Створення нарахувань, сповіщень та перевірка scope повинні бути у
`services/`, оскільки ними користуватимуться кілька контролерів.

### Scope доступу

`dorm-scope.service.js`:

```js
getManagedDormIds(userId)
assertCanManageDorm(user, dormId)
scopedDormWhere(user, tableAlias)
assertCanManageResidence(user, residenceId)
```

Правила:

| Ресурс | Студент | Комендант | Maintenance staff | Адміністратор |
| --- | --- | --- | --- | --- |
| `notification` | тільки власні | тільки власні | тільки власні | тільки власні в Notification Center |
| `dorm`, `room` | власна активна/призначена кімната; за потреби агрегати | лише assigned dorms | assigned dorms для ремонтів | усі |
| `application` | власні | `managed_dorm_id` у scope | лише ремонти assigned dorms | усі |
| `disciplinary_record` | власні | створення/читання тільки residence assigned dorms | немає доступу | усі |
| `room_internet_subscription` | статус власної кімнати | assigned dorms | read assigned dorms за потреби | усі |
| `staff_dorm_assignment` | немає | читати власні | читати власні | CRUD |

Особливо важливо: фільтр `dormId` від клієнта не є авторизацією. Backend
завжди додає scope із таблиці assignment або перевіряє знайдений запис перед
зміною.

Первинні заяви `settlement`, для яких ще немає `managed_dorm_id`, бачить
адміністратор як центральну чергу. Після маршрутизації комендант
закріпленого гуртожитку отримує заяву та може встановити `assignedRoomId`
лише для кімнати цього ж гуртожитку.

### API endpoints

| Method | Endpoint | Доступ | Призначення |
| --- | --- | --- | --- |
| `GET` | `/api/notifications` | authenticated | Власна історія повідомлень |
| `GET` | `/api/notifications/unread-count` | authenticated | Badge у topbar |
| `PATCH` | `/api/notifications/:id/read` | recipient only | Позначити прочитаним |
| `PATCH` | `/api/notifications/read-all` | authenticated | Прочитати всі власні |
| `GET` | `/api/notifications/stream` | authenticated | SSE події для Toast |
| `GET` | `/api/charges` | own/scoped/admin | Нарахування та борг |
| `POST` | `/api/charges/generate` | administrator | Генерація періоду або демо-кампанії |
| `PATCH` | `/api/applications/:id/managed-dorm` | administrator | Направити первинну заяву до гуртожитку |
| `GET` | `/api/room-internet/:id` | own room/scoped/admin | Розрахований статус інтернету |
| `PUT` | `/api/room-internet/:id` | scoped commandant/admin | Підключити/призупинити |
| `GET` | `/api/disciplinary-records` | own/scoped/admin | Журнал дисциплінарних записів |
| `POST` | `/api/disciplinary-records` | scoped commandant/admin | Видати запис |
| `PATCH` | `/api/disciplinary-records/:id` | scoped commandant/admin | Resolve; revoke лише admin |
| `GET/POST/PATCH` | `/api/disciplinary-records/rules` | scoped read/admin write | Довідник правил і балів |
| `GET/PATCH` | `/api/disciplinary-records/policy` | own/scoped read/admin write | Пороги та максимальний ліміт `35` |
| `GET/POST` | `/api/applications/:id/comments` | repair participants | Публічні та внутрішні коментарі заявки |
| `GET` | `/api/staff-dorm-assignments` | admin, or own read | Закріплення |
| `POST` | `/api/staff-dorm-assignments` | administrator | Призначити |
| `DELETE` | `/api/staff-dorm-assignments/:id` | administrator | Завершити закріплення |

### Сповіщення в реальному часі

Для цього проєкту достатньо Server-Sent Events:

1. Після входу frontend відкриває `GET /api/notifications/stream` із Firebase
   bearer token через `fetch` stream.
2. Backend реєструє з'єднання за `request.user.id`.
3. `notification.service.js` спочатку вставляє запис у PostgreSQL, а потім
   надсилає подію активним SSE-з'єднанням саме цього користувача.
4. Frontend додає toast і оновлює badge/inbox.

Історія завжди читається з PostgreSQL; якщо студент був offline, він побачить
повідомлення після наступного входу. Для кількох серверних інстансів надалі
потрібен PostgreSQL `LISTEN/NOTIFY` або Redis, але для курсового одного процесу
Express достатньо.

### Автоматичні нарахування та нагадування

`payment-reminder.job.js` запускається щодня у часовій зоні
`Europe/Kyiv`:

- для активного тарифу `INTERNET` створює щомісячне нарахування для кожної
  заселеної кімнати з підключеною або призупиненою послугою;
- для налаштованого адміністратором семестрового періоду `ACCOMMODATION`
  створює нарахування всім активним мешканцям;
- при пропущеному запуску дозаповнює нарахування поточного місяця або
  чинного семестру без дублікатів;
- знаходить непогашені семестрові charge проживання і створює персональні
  `payment_reminder`;
- знаходить непогашені щомісячні charge інтернету і створює повідомлення
  активним мешканцям кімнати;
- використовує `deduplication_key` і `notification_job_run`, тому перезапуск
  job не дублює повідомлення.

У панелі адміністратора доступні календар семестрів і кнопка синхронізації
планових нарахувань; постійний Express-процес виконує цей самий цикл щодня.
Календар проживання є налаштовуваним, оскільки опубліковані НУЛП графіки
навчального процесу можуть відрізнятися за освітньою програмою.

### Події, що породжують повідомлення

- `application.status` змінено: повідомити студента.
- `disciplinary_record` створено: повідомити студента; для `violation`
  пріоритет `warning`.
- `staff_dorm_assignment` створено/завершено: повідомити працівника.
- інтернет став `suspended` або неоплачений новий період: повідомити
  мешканців кімнати.
- оплачено нарахування інтернету: автоматично активувати підключення кімнати
  та повідомити її мешканців.
- з'явився новий ремонт у гуртожитку: у наступному підетапі повідомити
  assigned maintenance staff.

## Frontend Архітектура

### Загальні компоненти

```text
frontend/src/
|-- components/
|   |-- NotificationBell.jsx
|   |-- NotificationDrawer.jsx
|   |-- ToastProvider.jsx
|   |-- InternetStatusBadge.jsx
|   `-- DisciplinaryBadge.jsx
|-- hooks/
|   |-- useNotifications.js
|   `-- useNotificationStream.js
`-- pages/
    |-- StudentDashboard.jsx
    |-- CommandantDashboard.jsx
    `-- AdminAssignmentsPage.jsx (або вкладка в поточній панелі)
```

### Студентський кабінет

- дзвіночок із unread count у `AppShell`;
- панель `Сповіщення` з фільтрами `Усі / Непрочитані / Оплати / Заяви`;
- toast лише для нових SSE-подій, без повторного показу історії;
- у картці поточної кімнати badge:
  `Інтернет оплачено`, `Очікує оплати`, `Не підключено`, `Призупинено`;
- блок `Мої дисциплінарні записи` з датою, видом, правилом і статусом;
- у майбутньому блок `Мої нарахування` з сумою до оплати та строком.

### Панель коменданта

- дані завантажуються тільки для закріплених гуртожитків;
- перемикач гуртожитку показує лише assigned dorms;
- у таблиці кімнат відображається статус інтернету;
- у картці мешканця або активного поселення дія `Додати попередження /
  порушення`;
- у заяві на виселення можливість прикріпити дисциплінарні записи як підставу;
- особистий Notification Center також доступний коменданту.

### Панель адміністратора

- вкладка `Закріплення персоналу`: користувач, роль, гуртожиток, активність,
  дата призначення;
- огляд непокритих комендантом гуртожитків;
- генерація нарахувань/нагадувань для демонстрації;
- повний доступ до дисциплінарного реєстру з можливістю відкликати запис.

### Maintenance staff

Оскільки inbox проєктується персонально для всіх ролей, ремонтний персонал
отримає Notification Center відразу. Якщо персонал також буде закріплений
через `staff_dorm_assignment`, список ремонтів обмежується його гуртожитками,
а нова ремонтна заявка може породжувати персональне повідомлення.

## Валідація і безпека

- `recipient_user_id` для створення системних повідомлень задає тільки
  backend; клієнт не може надіслати повідомлення іншому користувачу.
- Студент не може змінювати room internet status або discipline record.
- Комендант не може видати порушення студенту з іншого гуртожитку, навіть якщо
  передасть чужий `residenceId` вручну.
- Виселення через дисциплінарні підстави залишається рішенням, а не
  автоматичною реакцією на кількість записів.
- Для SSE кожна подія відправляється лише каналам, зареєстрованим за
  автентифікованим `user.id`.
- У payload notification не слід зберігати чутливі документи або зайвий текст
  дисциплінарної справи; inbox може посилатися на захищений detail endpoint.

## Тести

### Backend smoke/integration

- студент бачить тільки власні notifications і не може прочитати чуже;
- нагадування одного charge не дублюється при повторному запуску job;
- оплачений internet charge змінює API-статус кімнати на `active_paid`;
- commandant A не бачить і не змінює room/application/residence/discipline
  гуртожитку commandant B;
- administrator призначає commandant до двох гуртожитків, після чого scope
  містить обидва;
- discipline record створює повідомлення студенту;
- дисциплінарний запис не може підняти активну суму студента понад `35`;
- електрик не бачить сантехнічні заявки, а студент не бачить внутрішні коментарі;
- eviction може містити discipline basis, але не виконується автоматично.

### Frontend

- Notification Center показує history/unread/read;
- подія stream викликає один toast і збільшує badge;
- Student room card показує internet status;
- commandant selection не містить чужих dorms;
- форма дисциплінарного запису валідує тип, дату, посилання на правило й опис.

## Порядок реалізації

1. `005_staff_dorm_scope.sql` і backend scope helpers: без цього нові
   адміністративні дані не можна безпечно відкривати комендантам.
2. `006_billing_charges_and_services.sql`: джерело боргу і періодичних оплат.
3. `007_room_internet_subscription.sql`: статус кімнати на основі monthly
   charge.
4. `008_personal_notifications.sql`: inbox, reminder job і SSE/toasts.
5. `009_disciplinary_records.sql`: журнал, повідомлення та підстави виселення.
6. `010_room_naming_layout_mode.sql`: блочна нумерація кімнат і тип
   планування гуртожитку.
7. `011_automatic_billing_cycles.sql`: календар семестрів, щомісячні
   інтернет-нарахування та запуск automatic billing.
8. `012_maintenance_workflow.sql`: спеціалізації персоналу, категорії та
   коментарі ремонтних заяв.
9. `013_disciplinary_points_policy.sql`: довідник правил, пороги та жорсткий
   максимум `35` активних балів.
10. Frontend-панелі, Notification Center та базові звіти підключені до API.

## Прийняті рішення реалізації

1. Оплату інтернету може виконати активний мешканець кімнати; оплачений
   monthly charge визначає статус інтернету всієї кімнати.
2. `staff_dorm_assignment` застосовується до комендантів і ремонтного
   персоналу; комендант без активного призначення не отримує житлові дані.
3. Для курсової доречно зберігати лише факт перевірки пільгового документа,
   без завантаження копій особистих документів.
4. Дисциплінарні пороги `25/35` є редагованою політикою адміністратора, але
   сума активних балів студента технічно не може перевищити `35`.
