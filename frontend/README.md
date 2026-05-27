# DormManager Frontend

React + Vite client for the DormManager course project. It uses Firebase
Authentication for login and communicates with the protected Express API.

## Available Views

- Firebase email/password login and student account creation.
- Firebase password reset by email.
- Registration password confirmation and a role-neutral sign-in screen for
  students, staff, commandants, and administrators.
- Student profile selection from verified Lviv Polytechnic institute/program
  options (IKNI, IKTA, IARD), with custom input for other institutes.
- Student portal: active room, application submission without self-selecting a
  settlement room, continuation requests, service tariffs, and payment completion.
- Commandant/administrator operations view: occupancy overview, application
  processing, residence assignment, room and tariff editing, and printable
  reports.
- Filtered analytics for occupancy, application statuses, and monthly
  successful payments, with the same filters applied to printed reports.
- Administrator-only account creation and role management view.
- Maintenance staff portal for receiving repair requests, recording work
  notes, and completing requests.
- Dorm layout management with floors, blocks, room positions, and batch room
  generation for real residence structures.
- Administration-assigned settlement and relocation decisions with residence
  verification checklists and automatic resident-register updates.

## Configure

Create a local environment file:

```powershell
Copy-Item .env.example .env
```

Copy the Firebase web app configuration values from Firebase Console into
`.env`. Enable `Email/Password` under Firebase Authentication sign-in methods.

```env
VITE_API_URL=http://localhost:5000/api
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

The Firebase values used by a web client identify the Firebase project; server
credentials remain only in the backend configuration.

## Student Profile Catalogue

Self-registered students choose an institute and educational program. Current
predefined options were transcribed from official Lviv Polytechnic pages:

- [IKNI programmes](https://lpnu.ua/ikni/napriamy-pidhotovky-spetsialnosti-ta-osvitni-prohramy)
- [IKTA programmes](https://lpnu.ua/ikta/haluzi-znan-spetsialnosti-ta-osvitni-prohramy)
- [IARD specialities](https://lpnu.ua/iard/spetsialnosti-iard)

The `Інший інститут або університет` option keeps the profile form usable for
programmes not yet represented in the catalogue.

## Run

Start the backend first, then in another PowerShell window:

```powershell
Set-Location -LiteralPath 'D:\Унік\3 курс\6 семестр\Курсова\DormManager\frontend'
npm.cmd install
npm.cmd run dev
```

Open `http://localhost:5173`.

## Role Accounts

New accounts created from the public registration screen receive the
`student` role. For the first administrator, create a Firebase Authentication
user and link its Firebase UID in PostgreSQL as documented in
`../backend/README.md`. Once signed in as an administrator, use the
`Користувачі` tab to promote already registered student accounts to commandant
or maintenance roles. Administrators can also create a new user directly in
that tab by entering an initial password; the account is created in Firebase
Authentication and linked to its system role automatically. Profiles created
by an older version without Firebase access are marked in the table and can
be activated there with an initial password.

## Build Check

```powershell
npm.cmd run build
```
