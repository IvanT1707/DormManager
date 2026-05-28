# DormManager Backend

This backend implements the current DormManager API foundation, CRUD layer,
Firebase Authentication verification, role-based access rules, and simulated
payments suitable for the course project demonstration.

## Implemented in this increment

- Express server with JSON, CORS, Helmet, and central 404/error handling.
- PostgreSQL pool configuration and database connectivity health check.
- OpenAPI/Swagger UI at `/api-docs` and JSON specification at `/api-docs.json`.
- Initial database schema for dorms, rooms, users, services, residences,
  applications, and transactions.
- Enums for the four system roles, residence lifecycle, request workflow, and
  payment workflow.
- Parameterized CRUD endpoints for all seven entities with request validation.
- Business checks preventing room over-occupancy and invalid capacity reduction.
- Firebase Admin verification of client ID tokens and profile self-registration.
- Administrator creation of Firebase-authenticated staff/user accounts with initial passwords.
- Role-based authorization for students, commandants, maintenance staff, and administrators.
- Simulated student payment flow using database statuses without real money processing.
- Structured dorm layouts with residential floors, blocks, room positions, and batch room generation.
- Two room numbering modes: block rooms use suffixes such as `201а` and `201б`;
  corridor-style dormitories keep numeric room names such as `201` and `202`.
- Residence application workflow with administration-assigned rooms, continuation requests,
  settlement verification, relocation decisions, and eviction completion.
- Dorm-scoped access assignments for commandants and maintenance staff.
- Automatic monthly internet charges and administrator-configured semester
  accommodation billing periods.
- Personal Notification Center storage, real-time SSE delivery, and daily payment reminders.
- Room-level internet connection, calculated paid status, and automatic
  reactivation after a successful internet payment.
- Occupancy map grouped by dormitory, floor, and block for room assignment.
- Maintenance specializations, categorized repair requests, and public/staff
  repair discussion history.
- Formal disciplinary records with configurable rules, active point totals,
  and an enforced maximum of `35`, attachable as grounds for eviction decisions.

The application deliberately does not integrate a live payment provider:
payment success or failure is recorded as a demonstration workflow in
PostgreSQL. `password_hash` remains nullable in the schema because it is
required by the coursework structure; Firebase-managed accounts do not store
local passwords in PostgreSQL. Passwords entered during administrative account
creation are sent to Firebase Authentication only.

## Structure

```text
backend/
|-- database/migrations/001_initial_schema.sql
|-- database/migrations/002_remove_stripe_payment_intent.sql
|-- database/migrations/003_dorm_layout_structure.sql
|-- database/migrations/004_application_residence_workflow.sql
|-- database/migrations/005_staff_dorm_scope.sql
|-- database/migrations/006_billing_charges_and_services.sql
|-- database/migrations/007_room_internet_subscription.sql
|-- database/migrations/008_personal_notifications.sql
|-- database/migrations/009_disciplinary_records.sql
|-- database/migrations/010_room_naming_layout_mode.sql
|-- database/migrations/011_automatic_billing_cycles.sql
|-- database/migrations/012_maintenance_workflow.sql
|-- database/migrations/013_disciplinary_points_policy.sql
|-- database/migrations/014_simplify_support_tables.sql
|-- scripts/migrate.js
|-- src/
|   |-- config/database.js
|   |-- config/env.js
|   |-- config/firebase.js
|   |-- config/swagger.js
|   |-- controllers/*.controller.js
|   |-- jobs/payment-reminder.job.js
|   |-- middleware/auth.js
|   |-- middleware/error-handler.js
|   |-- routes/*.routes.js
|   |-- services/*.service.js
|   |-- utils/*.js
|   `-- index.js
|-- scripts/smoke-crud.js
|-- .env.example
`-- package.json
```

## Run locally

```powershell
Copy-Item .env.example .env
npm.cmd install
psql -d dormmanager -f database/migrations/001_initial_schema.sql
npm.cmd run dev
```

Configure either `DATABASE_URL` or all five `POSTGRES_*` values in `.env` if
PostgreSQL uses another user, password, host, or database name. A complete
`POSTGRES_*` group takes precedence over `DATABASE_URL`. The `npm.cmd` form
works in PowerShell installations that restrict unsigned `npm.ps1` script
execution.

For a database created with an earlier DormManager version, apply the upgrade
migrations once:

```powershell
psql -d dormmanager -f database/migrations/002_remove_stripe_payment_intent.sql
psql -d dormmanager -f database/migrations/003_dorm_layout_structure.sql
psql -d dormmanager -f database/migrations/004_application_residence_workflow.sql
psql -d dormmanager -f database/migrations/005_staff_dorm_scope.sql
psql -d dormmanager -f database/migrations/006_billing_charges_and_services.sql
psql -d dormmanager -f database/migrations/007_room_internet_subscription.sql
psql -d dormmanager -f database/migrations/008_personal_notifications.sql
psql -d dormmanager -f database/migrations/009_disciplinary_records.sql
psql -d dormmanager -f database/migrations/010_room_naming_layout_mode.sql
psql -d dormmanager -f database/migrations/011_automatic_billing_cycles.sql
psql -d dormmanager -f database/migrations/012_maintenance_workflow.sql
psql -d dormmanager -f database/migrations/013_disciplinary_points_policy.sql
psql -d dormmanager -f database/migrations/014_simplify_support_tables.sql
```

If those migrations were already applied manually to an existing local
database, record them for the automated runner once without re-executing SQL:

```powershell
npm.cmd run migrate:baseline
```

For a clean deployed database, use `npm run migrate` or the Render
`start:render` command; it creates `schema_migrations` and applies pending
files automatically.

## Render Deployment

The repository root contains `render.yaml`. Render builds the frontend and
sets `SERVE_FRONTEND=true`, so this Express service also serves React routes
such as `/login`. The configured Render start command is:

```bash
npm --prefix backend run start:render
```

It applies pending migrations before starting the API. Firebase Admin
credentials must be entered in Render as `FIREBASE_PROJECT_ID`,
`FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`; never commit the service
account JSON file.

## Firebase Setup

1. In Firebase Console, create or select the project and enable the desired
   sign-in provider under Authentication.
2. In `Project settings > Service accounts`, generate a private key JSON file.
3. Keep that JSON file outside the project directory.
4. Add these values to the local `.env`:

```env
FIREBASE_USE_APPLICATION_DEFAULT=true
GOOGLE_APPLICATION_CREDENTIALS=D:\secure\firebase-service-account.json
```

The frontend will later sign a user in through Firebase and send the returned
ID token as:

```http
Authorization: Bearer <firebase-id-token>
```

For local Swagger calls, click `Authorize` and paste a Firebase ID token after
the frontend authentication step is implemented.

## First Administrator

Student accounts may create their own student profile using
`POST /api/auth/register`. Staff and administrator roles are deliberately not
self-assignable. After creating the administrator in Firebase Authentication,
link that Firebase user's UID once in PostgreSQL:

```sql
INSERT INTO users (firebase_uid, email, role, full_name)
VALUES ('firebase-admin-uid', 'admin@example.com', 'administrator', 'Administrator')
ON CONFLICT (email) DO UPDATE
SET firebase_uid = EXCLUDED.firebase_uid,
    role = 'administrator',
    updated_at = CURRENT_TIMESTAMP;
```

To check the CRUD layer against the configured database, run:

```powershell
npm.cmd run smoke
```

The smoke test uses test-only identity tokens, creates uniquely named temporary
data, verifies role restrictions, and removes its records after completion.

## Current endpoints

| Method | Endpoint               | Purpose                         |
| ------ | ---------------------- | ------------------------------- |
| GET    | `/api`                 | API entry point                 |
| GET    | `/api/health`          | API availability                |
| GET    | `/api/health/database` | PostgreSQL availability         |
| GET    | `/api-docs`            | Interactive Swagger API docs    |
| GET    | `/api-docs.json`       | OpenAPI JSON specification      |
| GET    | `/api/auth/me`         | Firebase identity/profile state |
| POST   | `/api/auth/register`   | Student profile registration    |
| PATCH  | `/api/auth/me`         | Own profile editing             |
| CRUD   | `/api/dorms`           | Dormitories                     |
| POST   | `/api/dorms/{id}/generate-rooms` | Create rooms from floor/block layout |
| GET    | `/api/dorms/{id}/occupancy-layout` | Scoped floor/block occupancy map with residents |
| CRUD   | `/api/rooms`           | Rooms                           |
| CRUD   | `/api/users`           | Authenticated users and roles   |
| POST   | `/api/users/{id}/activate` | Activate a legacy unlinked user profile |
| CRUD   | `/api/services`        | Accommodation/services tariffs; writes are administrator-only |
| CRUD   | `/api/residences`      | Student residence records       |
| CRUD   | `/api/applications`    | Settlement/residence requests   |
| GET/POST | `/api/applications/{id}/comments` | Repair request discussion |
| CRUD   | `/api/transactions`    | Payment records                 |
| POST   | `/api/transactions/simulate` | Start a simulated payment |
| POST   | `/api/transactions/{id}/complete-simulation` | Finish a simulated payment |
| GET/POST | `/api/charges`, `/api/charges/generate` | Period charges and generation |
| GET/POST/PATCH | `/api/charges/billing-periods` | Semester billing calendar |
| POST | `/api/charges/run-scheduled` | Synchronize automatic planned charges now |
| GET/PATCH | `/api/notifications`, `/api/notifications/{id}/read` | Personal inbox |
| GET | `/api/notifications/stream` | Live notification stream |
| POST | `/api/notifications/generate-reminders` | Run reminder scan now (administrator) |
| GET/PUT | `/api/room-internet/{id}` | Room internet status and configuration |
| GET/POST/PATCH | `/api/disciplinary-records` | Formal warning/violation registry |
| GET/POST/PATCH | `/api/disciplinary-records/rules` | Rule directory and point values |
| GET/PATCH | `/api/disciplinary-records/policy` | Active thresholds and 35-point limit |
| GET/POST/DELETE | `/api/staff-dorm-assignments` | Dorm scope assignments |
| PATCH | `/api/applications/{id}/managed-dorm` | Route an initial application |

## Access Rules

| Resource | Student | Commandant | Maintenance staff | Administrator |
| -------- | ------- | ---------- | ----------------- | ------------- |
| Dorms, rooms | Own active room/dorm | Assigned dorms; room management | Assigned dorms read | CRUD |
| Services | Read | Read | Read | CRUD/archive |
| User profiles | Own profile | Residents/applicants in assigned dorms | Own profile | CRUD |
| Residences | Read own | Assigned dorms; changes through approved applications | - | CRUD/import corrections |
| Applications | Create/read own | Process assigned dorms only | Read/update assigned repairs | CRUD/routing |
| Transactions and charges | Pay/read own | Assigned dorm residents | - | Calendar management/synchronization |
| Notifications | Own inbox | Own inbox | Own inbox | Own inbox/reminder run |
| Discipline and internet | Own residence/room read | Assigned dorms manage | Assigned room internet read | Full management |

An administrator must assign each commandant or maintenance worker to a
dormitory in the `Призначення` panel before staff data becomes visible to that
account.

## Dorm Layouts

The room model supports `floorNumber`, `blockNumber`, and `roomInBlock`.
The dorm model stores `hasBlocks` and default generation parameters: total
floors, first residential floor, room capacity, and either block dimensions
or `roomsPerFloor` for a dormitory without blocks.

For example, dormitory No. 11 with floors `2` through `9`, `19` blocks per
floor, `2` rooms per block, and `4` places in each room produces:

```text
8 residential floors x 19 blocks x 2 rooms = 304 rooms
304 rooms x 4 places = 1216 places
```

With block layout, block `1` on the second floor contains `201а` and `201б`,
block `2` contains `202а` and `202б`, and block `19` contains `219а` and
`219б`. With non-block layout, generated rooms retain numeric names such as
`201`, `202`, and `203`, with no letter suffix or block position.

## Simulated Payments

This project demonstrates accommodation payment processing without charging
cards or calling an external provider.

1. A student calls `POST /api/transactions/simulate` with a `serviceId`.
2. The API reads the current service tariff and creates the student's
   transaction with status `pending`.
3. The interface calls `POST /api/transactions/{id}/complete-simulation` with
   `{"result":"succeeded"}` or `{"result":"failed"}`.
4. A successful result stores `paidAt`; a failed result remains unpaid.

The API chooses the authenticated student and the tariff amount on the server,
so the client cannot simulate a payment for another user or change its price.

## Automatic Billing

- An active `INTERNET` tariff creates one room-level charge for every occupied
  subscribed room in each calendar month. The tariff stores the payment due
  day; its default is the `10`th day of the month.
- An administrator schedules accommodation semesters in
  `accommodation_billing_period`. When its charge date is reached, every
  active residence receives its semester charge.
- The daily backend job runs in `Europe/Kyiv`, catches up any missing charge
  for the current month or active semester, and does not duplicate existing
  charges.
- A room remains eligible for internet billing while its subscription is
  `active` or `suspended`. A successful payment for the current room internet
  charge automatically sets the subscription back to `active`.

Semester dates are entered by an administrator because the university's
published academic process calendars can differ by educational programme.

## Swagger initialization order

In `src/index.js`, `const app = express()` is declared before
`setupSwagger(app)` is called. This order prevents the reference error caused
by mounting Swagger middleware on `app` before the Express instance exists.

## Frontend role views

The React client now contains the student portal, shared commandant and
administrator management dashboard, administrator-only role assignment, and
the maintenance staff repair queue. Public sign-up intentionally creates
students only; the first administrator is linked through the SQL statement
above and can then configure further role profiles through the user interface.
