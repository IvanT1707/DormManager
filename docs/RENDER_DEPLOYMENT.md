# Деплой DormManager На Render

## Архітектура Деплою

Для курсового проєкту використовується проста конфігурація з
[`render.yaml`](../render.yaml):

- один Render Web Service `dormmanager-tsekot-oi35`, що запускає Express API
  і роздає зібраний React frontend з тієї ж адреси;
- одна Render PostgreSQL база `dormmanager-db-tsekot-oi35`;
- `VITE_API_URL=/api`, тому frontend звертається до backend через той самий
  origin і не потребує окремого CORS-домену;
- перед стартом сервісу runner `backend/scripts/migrate.js` застосовує лише
  міграції, яких ще немає у таблиці `schema_migrations`.

Обрано один Web Service замість окремого Static Site, щоб авторизація,
Notification stream і API працювали на одному домені без додаткової
конфігурації CORS.

## Що Треба Зробити Один Раз

1. Створіть GitHub-репозиторій і завантажте до нього вміст каталогу
   `DormManager`, включно з `render.yaml`.
2. Переконайтеся, що файли `backend/.env`, `frontend/.env` та Firebase Admin
   JSON не додані до GitHub.
3. У Render відкрийте `New > Blueprint`, підключіть GitHub-репозиторій і
   виберіть файл `render.yaml`.
4. На екрані створення Blueprint введіть значення змінних із секції нижче.
5. Після першого успішного деплою відкрийте:
   `https://dormmanager-tsekot-oi35.onrender.com`.

Якщо ім'я `dormmanager-tsekot-oi35` вже зайняте і Render запропонує інше,
змініть у `render.yaml` назву web service, а також значення
`API_BASE_URL` і `CORS_ORIGIN` на його фактичну HTTPS-адресу, після чого
повторіть deploy.

## Значення Firebase Для Blueprint

Render попросить значення змінних, позначених `sync: false`. Їх не слід
зберігати у GitHub.

### Backend Firebase Admin

З JSON service account використайте:

| Render variable | Поле JSON |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `project_id` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` |
| `FIREBASE_PRIVATE_KEY` | `private_key` повністю, разом із `BEGIN/END PRIVATE KEY` |

Для `FIREBASE_PRIVATE_KEY` можна вставити значення з символами `\n`: backend
перетворить їх на переноси рядків.

### Frontend Firebase Web App

У Firebase Console відкрийте `Project settings > General > Your apps` і
скопіюйте web configuration:

| Render variable | Firebase web config |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `VITE_FIREBASE_APP_ID` | `appId` |

У Firebase Authentication також додайте домен
`dormmanager-tsekot-oi35.onrender.com` до `Authorized domains`.

## База І Міграції

У Blueprint backend отримує `DATABASE_URL` безпосередньо з Render Postgres.
Під час першого запуску виконуються міграції `001`-`013`; під час наступних
деплоїв runner виконує лише нові `.sql`-файли.

Free Render PostgreSQL підходить для захисту курсової, але за поточними
умовами Render база free-плану спливає через 30 днів і не має резервних
копій. Перед демонстрацією перевірте дату створення бази або використайте
платний план.

## Перший Адміністратор

Після деплою:

1. Зареєструйте користувача у Firebase Authentication.
2. У PostgreSQL змініть його роль на `administrator` згідно з інструкцією
   у [`backend/README.md`](../backend/README.md#first-administrator).
3. Увійдіть на опублікованому сайті й створіть решту ролей через панель
   адміністратора.

## Перевірка Після Деплою

Відкрийте ці адреси:

| Адреса | Очікуваний результат |
| --- | --- |
| `/api/health` | API повертає `status: ok` |
| `/api/health/database` | PostgreSQL повертає `database: connected` |
| `/api-docs` | Відкривається Swagger |
| `/login` | Відкривається React-сторінка входу після прямого переходу |

Потім перевірте реєстрацію студента, вхід адміністратора, створення
гуртожитку/кімнат, поселення, ремонтну заявку та нарахування.

## Офіційні Посилання Render

- [Blueprint YAML Reference](https://render.com/docs/blueprint-spec)
- [Deploy a Node Express App](https://render.com/docs/deploy-node-express-app)
- [Create and Connect to Render Postgres](https://render.com/docs/databases)
- [Free instance limitations](https://render.com/free)
