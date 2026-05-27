# DormManager

Student Dormitory Management System course project.

## Course Scope

The authoritative coursework requirements, implementation coverage, and
planned extensions are tracked in
[docs/COURSE_REQUIREMENTS.md](docs/COURSE_REQUIREMENTS.md).
The residence-process audit based on official Lviv Polytechnic materials is
recorded in
[docs/LPNU_RESIDENCE_PROCESS_REVIEW.md](docs/LPNU_RESIDENCE_PROCESS_REVIEW.md).
A wider audit of tariffs, housing capacity, resident categories, safety,
maintenance, and recommended development priorities is recorded in
[docs/LPNU_FULL_DOMAIN_AUDIT.md](docs/LPNU_FULL_DOMAIN_AUDIT.md).
The implemented database migrations and API/UI architecture for personal
notifications, room internet status, disciplinary records, dorm-scoped staff
access, and room numbering modes are described in
[docs/P1_P2_ARCHITECTURE_PROPOSAL.md](docs/P1_P2_ARCHITECTURE_PROPOSAL.md).
Feedback captured during end-to-end manual testing and the next UI/domain
improvement backlog are recorded in
[docs/TESTING_FEEDBACK_BACKLOG.md](docs/TESTING_FEEDBACK_BACKLOG.md).
Deployment on Render is described in
[docs/RENDER_DEPLOYMENT.md](docs/RENDER_DEPLOYMENT.md).

## Components

| Directory | Technology | Purpose |
| --------- | ---------- | ------- |
| `backend` | Node.js, Express, PostgreSQL, Firebase Admin, Swagger | Protected REST API and data layer |
| `frontend` | React, Vite, Firebase Web Auth | Student and commandant user interface |

Payment operations are intentionally simulated for demonstration: no card data
or real payment provider is used.

## Supported Roles

| Role | Main interface |
| ---- | -------------- |
| `student` | Room status, applications, services, simulated payments |
| `commandant` | Applications, settlements, rooms, tariffs, reports |
| `maintenance_staff` | Repair request queue and completion notes |
| `administrator` | Commandant operations plus user and role management |

Self-registration creates a student profile. Create the first administrator in
Firebase Authentication and link its UID according to `backend/README.md`;
that administrator can then change roles of registered test accounts or link
new commandants and maintenance staff in the web interface.

## Start The Application

Terminal 1 - API:

```powershell
Set-Location -LiteralPath 'D:\Унік\3 курс\6 семестр\Курсова\DormManager\backend'
npm.cmd run dev
```

Terminal 2 - React client:

```powershell
Set-Location -LiteralPath 'D:\Унік\3 курс\6 семестр\Курсова\DormManager\frontend'
Copy-Item .env.example .env
npm.cmd run dev
```

Before real login can work, configure Firebase Admin credentials in
`backend/.env` and the Firebase web application values in `frontend/.env`.

## Local Addresses

- Frontend: `http://localhost:5173`
- API health: `http://localhost:5000/api/health`
- API documentation: `http://localhost:5000/api-docs`

## Render Deployment

The repository includes a [`render.yaml`](render.yaml) Blueprint for one
full-stack Render Web Service and one Render PostgreSQL database. In deployed
mode Express serves the Vite build, and the frontend uses the same-origin
endpoint `/api`.

Before creating the Blueprint, push this `DormManager` directory to a GitHub
repository. Then follow [docs/RENDER_DEPLOYMENT.md](docs/RENDER_DEPLOYMENT.md)
to enter Firebase environment variables and deploy without committing local
secrets.
