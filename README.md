# Smart Student Portal

**Smart Student Document & Academic Clearance Portal**  
A web-based platform for submitting student service requests, coordinating academic and administrative clearances, processing payments, issuing certificates, and monitoring institutional activity.

> Repository: `smart-student-portal-principal-admin-dashboard`  
> Project type: Full-stack web application  
> Frontend: React + Vite  | Backend: Node.js + Express  | Database: MySQL

---

## Table of Contents

- [Overview](#overview)
- [Core Modules](#core-modules)
- [Roles and Access](#roles-and-access)
- [Technology Stack](#technology-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Run the Application](#run-the-application)
- [Useful URLs](#useful-urls)
- [API Overview](#api-overview)
- [Principal / Admin Dashboard](#principal--admin-dashboard)
- [Development Workflow](#development-workflow)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Overview

The Smart Student Portal digitizes common student-facing academic and administrative services. Students can submit applications and supporting documents, follow request progress, respond to correction requests, view notifications, and access issued certificates. Department Heads (HODs) and section staff process the clearance tasks assigned to them. The ADMIN role has an institution-wide, read-only Principal dashboard for operational oversight.

The application is designed around role-based access and configurable service workflows. Request processing is handled by the backend; frontend route visibility is not treated as a security boundary.

## Core Modules

- **Authentication and authorization** — Login, JWT-based authentication, and role-protected API routes.
- **Student services** — Browse available services, submit requests, attach supporting documents, view request details, and resubmit corrected documents.
- **Clearance workflow** — Route clearance tasks to the relevant HODs and college sections, record reviews, and track request status.
- **Staff workspace** — View section workload, inspect assigned tasks and documents, and approve, request corrections, or reject according to permissions.
- **Payments** — Store payment records and integrate the Razorpay payment flow and webhook handling.
- **Certificates** — Generate and provide access to certificates, with verification-related records supported by the database schema.
- **Postal delivery** — Manage postal dispatch details, tracking references, and delivery status for eligible requests.
- **Notifications and audit trail** — Provide student notifications and record relevant administrative activity.
- **Principal / Admin dashboard** — View institution-level counts, request trends, department and section summaries, payment collections, postal delivery summaries, and recent audit activity.

The exact availability of a service depends on the database seed data, active workflow configuration, and the state of the running environment.

## Roles and Access

| Role | Responsibility |
| --- | --- |
| `STUDENT` | Apply for services, upload documents, track requests, respond to corrections, view notifications and certificates. |
| `HOD` | Review clearance tasks within the HOD's assigned department/section. |
| `SECTION_STAFF` | Process tasks assigned to the staff member's college section. |
| `ADMIN` | View institution-wide operational information through the Principal dashboard. The dashboard is read-only for request workflow actions. |

Access is enforced by backend authentication and authorization middleware. Do not rely on hiding a frontend page or menu item to protect data or operations.

## Technology Stack

### Frontend

- React 19
- Vite
- React Router
- Axios
- Tailwind CSS (Vite integration)
- Framer Motion
- Recharts
- Lucide React

### Backend

- Node.js
- Express 5
- MySQL 8-compatible SQL schema (use a compatible MySQL release)
- `mysql2`
- JSON Web Tokens (`jsonwebtoken`)
- `bcryptjs`
- Multer for file uploads
- PDFKit and QRCode libraries for document/certificate-related functionality
- Razorpay integration for payment processing

### Database

- MySQL
- SQL schema, seed data, and versioned migration scripts are maintained under `database/`.

## Repository Structure

```text
smart-student-portal/
│││ client/                 # React + Vite frontend
│   │││ src/
│   │   │││ pages/            # Student, staff and admin screens
│   │   │││ services/         # Frontend API integration
│   │   ——— ...
│   ——— package.json
│
│││ server/                 # Express backend
│   │││ src/
│   │   │││ config/           # Database configuration
│   │   │││ controllers/      # Request and business logic
│   │   │││ middleware/       # Authentication, roles, uploads
│   │   │││ routes/           # API route definitions
│   │   ——— app.js
│   │││ uploads/               # Runtime upload storage (keep private)
│   │││ .env.example
│   ——— package.json
│
│││ database/
│   │││ schema.sql             # Base database schema
│   │││ seed.sql               # Initial roles, departments, sections, services/workflows
│   ——— migrations/            # Incremental database changes
│
│││ README.md
│——— .gitignore
```

> This is a high-level guide to the repository. Some folders contain additional files and modules not shown in the tree.

## Prerequisites

Install the following before setup:

- Node.js (a current LTS release is recommended)
- npm (included with Node.js)
- MySQL Server and MySQL Workbench or another SQL client
- Git
- A code editor such as Visual Studio Code

Check your versions:

```bash
node --version
npm --version
mysql --version
```

## Getting Started

### 1. Clone the repository

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd smart-student-portal
```

Replace the placeholder with the actual repository URL. If you have already downloaded the project, open the project root folder in your terminal instead.

### 2. Configure the backend

```bash
cd server
npm install
```

Create a local `.env` file by copying the example:

**Windows PowerShell**

```powershell
Copy-Item .env.example .env
```

**macOS / Linux**

```bash
cp .env.example .env
```

Edit `server/.env` with your local MySQL credentials and application secrets. See [Environment Configuration](#environment-configuration).

### 3. Install frontend dependencies

Open a second terminal at the project root:

```bash
cd client
npm install
```

## Environment Configuration

The backend reads configuration from `server/.env`. The repository includes `server/.env.example` as a template.

| Variable | Purpose | Example / default |
| --- | --- | --- |
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | Backend HTTP port | `5000` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_NAME` | Database name | `smart_student_portal` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | Set locally |
| `JWT_SECRET` | Secret used to sign JWTs | Generate a long, random secret |
| `JWT_EXPIRES_IN` | JWT lifetime | `1d` |
| `CLIENT_URL` | Allowed frontend origin(s) for CORS | `http://localhost:5173` |
| `API_PUBLIC_URL` | Public/base API URL used by the backend | `http://localhost:5000` |
| `RAZORPAY_KEY_ID` | Razorpay key ID | Test key during development |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | Set locally; never commit |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signature secret | Set locally; never commit |
| `COLLEGE_NAME` | Institution name used by relevant output | Set to the approved institution name |
| `COLLEGE_AFFILIATION` | University / affiliation text | Set to the approved affiliation |

For local development, use Razorpay test credentials. Configure live credentials and production URLs only in a secured deployment environment. Never paste secrets into source code, issues, screenshots, or commits.

## Database Setup

The project database scripts are in the `database/` directory.

### 1. Create the base schema

Open MySQL Workbench, connect to your local MySQL server, and execute:

```text
database/schema.sql
```

The schema script creates and selects the `smart_student_portal` database. If you want a different database name, update the database name consistently in both the SQL scripts and `server/.env` before running setup.

### 2. Insert initial data

After the base schema is created, execute:

```text
database/seed.sql
```

The seed script inserts the initial roles, engineering departments, HOD/general sections, service types, and workflow configuration. Run it once on a newly created database unless the script has been deliberately made safe for repeat execution.

### 3. Apply migrations

Review the scripts in `database/migrations/` and apply the migrations required by the version of the application you are running. The repository currently includes:

```text
database/migrations/20261027_fix_legacy_payments.sql
database/migrations/20261027_postal_payment_certificates.sql
database/migrations/20261103_reconcile_postal_delivery.sql
database/migrations/20261103_postal_tracking_events.sql
database/migrations/20261112_profile_photos.sql
```

Apply each migration only if its changes are not already present in the target database. Do not blindly rerun `ALTER TABLE` migrations on an existing database. Keep a record of which migrations have been applied in each environment. Back up the database before applying schema changes to a database containing real data.

The Principal dashboard reads existing portal tables and does not create its own dashboard tables. It expects the related request, payment, delivery, certificate, staff-review, and audit data structures to exist.

## Run the Application

Run the backend and frontend in separate terminals.

### Terminal 1 — Backend

```bash
cd server
npm run dev
```

The backend uses `nodemon` in development mode and listens on the configured `PORT` (default `5000`).

### Terminal 2 — Frontend

```bash
cd client
npm run dev
```

Vite is configured to use port `5173` and `strictPort: true`.

Open the frontend in your browser:

```text
http://localhost:5173
```

## Useful URLs

| URL | Description |
| --- | --- |
| `http://localhost:5173` | Frontend application |
| `http://localhost:5173/admin/dashboard` | Principal / Admin dashboard (after signing in as `ADMIN`) |
| `http://localhost:5000/` | Backend API status response |
| `http://localhost:5000/api/health` | API and database health check |

If you change the backend port, update the URLs and the relevant environment variables accordingly.

## API Overview

The Express application mounts these route groups:

| Base path | Purpose |
| --- | --- |
| `/api/auth` | Authentication and account-related routes |
| `/api/student` | Student profile, services, requests, documents, certificates and notifications |
| `/api/staff` | Staff dashboard, task review, document access, certificate generation and postal dispatch |
| `/api/student/payments` | Student payment operations and Razorpay integration |
| `/api/admin` | Institution-wide Principal / Admin dashboard data |

The backend also exposes `GET /api/health` for a basic database connectivity check. For exact request methods, parameters, payloads, and response formats, refer to the route files under `server/src/routes/` and their corresponding controllers.

## Principal / Admin Dashboard

The `/admin/dashboard` page provides institution-wide, read-only operational visibility for users with the `ADMIN` role. Based on the current project implementation, the dashboard includes:

- Active student and staff counts, department totals, request totals, and certificates issued.
- Request status distribution and department-level student/request summaries.
- Section-level active staff and pending/review workload summaries.
- Searchable and status-filterable student service requests, with CSV export.
- Payment totals and successful collection summaries.
- Postal delivery status counts.
- Recent activity from `audit_logs`.

The dashboard does not approve, reject, edit, or reassign student requests. Those workflow actions remain with the authorized HOD and section-staff roles. The admin API is protected on the server with authentication and `ADMIN` role authorization.

The project documentation for this module notes an existing test admin account in the database. Use only credentials provided through your team's approved local setup; do not publish account passwords or seed private credentials in this README.

## Development Workflow

A recommended team workflow for shared development:

1. Pull the latest `main` branch before starting work.
2. Create a focused feature branch.
3. Make changes within the module agreed by the team.
4. Run the relevant checks locally.
5. Commit with a clear message and push the branch.
6. Open a Pull Request and request review from the relevant teammate.
7. Resolve review comments, merge the PR, then pull the updated `main` branch.

Example:

```bash
git switch main
git pull origin main
git switch -c feature/short-description

# Make and test your changes

git add .
git commit -m "feat: describe the change"
git push -u origin feature/short-description
```

Avoid having multiple team members independently edit shared integration files (for example, the Express app entry point, frontend route configuration, API client, or authentication context) without coordinating first.

### Available project scripts

**Backend (`server/`)**

```bash
npm run dev       # Start backend with nodemon
npm start         # Start backend normally
```

**Frontend (`client/`)**

```bash
npm run dev       # Start Vite development server
npm run build     # Create production frontend build
npm run preview   # Preview the production build
npm run lint      # Run ESLint
```

## Security Notes

- Keep `.env` files out of Git. Commit `.env.example` with placeholder values only.
- Never commit Razorpay secrets, JWT secrets, database passwords, access tokens, or private keys.
- Do not commit real student records, exported CSVs containing personal data, private uploaded documents, or production database dumps.
- Restrict access to uploaded documents and generated exports. Treat student information as confidential.
- Use HTTPS, secure secret management, restricted database credentials, backups, and production-grade logging before deployment.
- Keep dependencies updated and review file-upload validation and access-control rules before production use.
- The development configuration is not, by itself, a production deployment configuration.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| Backend cannot connect to MySQL | Confirm MySQL is running and `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` match your local database. |
| `Access denied for user` | Verify the MySQL username/password and the user's database permissions. |
| `Table doesn't exist` | Confirm `schema.sql`, `seed.sql`, and all required migrations have been applied to the database configured in `.env`. |
| Service list is empty | Check that service types were inserted by `seed.sql`, are active, and that the backend is connected to the expected database. |
| No-Due workflow is unavailable | Check that the No-Due workflow definition and its workflow steps exist and are active in the database. |
| Frontend cannot reach the API | Confirm the backend is running, the frontend API base URL is correct, and `CLIENT_URL` allows the frontend origin. |
| Port `5000` or `5173` is already in use | Stop the other process or update the port configuration consistently. Vite is configured with `strictPort: true`. |
| Payment or webhook verification fails | Confirm test/live Razorpay credentials match the environment and webhook secret; inspect backend logs and payment records. |

When reporting a bug, include the affected role, page, request identifier (if safe), exact steps to reproduce, expected result, actual result, and relevant redacted logs. Do not attach passwords, tokens, or unredacted student data.

## Contributing

Contributions should be submitted through Pull Requests. Keep changes focused, follow the existing code structure, avoid committing generated or sensitive files, and include a short testing note in each PR. Database changes should include a migration script and a note describing how to apply it safely.

## License

No license has been specified in the inspected project files. Unless the repository owner adds a license, the project should not be assumed to be open source or freely reusable.

---

**Maintained by the Smart Student Portal project team.**
