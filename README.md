# My Patient — US24 Solutions patient statement portal

US24 Solutions specialists publish patient statements to the clinics they serve.
Each clinic signs in with 2-step verification and sees only its own patients'
statements, with a shared remarks log (Clinic, Specialist, Insurance).

Product and design documents are in [DOCS/](DOCS/) (PRD, app flow, UI brief,
schema). Requirement IDs in code comments (F8, FR-7.4, S5, …) refer to them.

| Layer | Technology |
|---|---|
| Web client | React 19, React Router 7, Vite 7 ([client/](client/)) |
| API | Node.js 22+, Express 5 ([server/](server/)) |
| Database | PostgreSQL 17 (raw SQL migrations, triggers for immutability) |
| Local services | Docker Compose: PostgreSQL + Mailpit (catches all email) |

> The TRD proposed Python/Django. This build uses React + Node.js + PostgreSQL
> as requested, keeping the PRD, app flow and data model unchanged.

## Run it locally

Prerequisites: Node.js 22 or newer, Docker Desktop.

```bash
npm run install:all          # root, server and client dependencies
npm run services:up          # PostgreSQL on :5432, Mailpit on :1025/:8025
cp server/.env.example server/.env
#   then set APP_SECRET (command in the file) and the SEED_* passwords
npm run db:reset             # create schema + load synthetic demo data
npm run dev                  # API on :4000, web app on http://localhost:5173
```

Sign in at http://localhost:5173 with one of the seeded accounts:

| Role | Email | Lands on |
|---|---|---|
| Admin | `saurabh@us24solutions.com` | Admin home |
| US24 Specialist | `ankit.k@us24solutions.com` | Specialist dashboard |
| Clinic user (Lakeside Family Clinic) | `ankitkumar87147@gmail.com` | Three-card clinic home |

Passwords come from `SEED_*_PASSWORD` in `server/.env` (left empty, the seed
generates and prints one). The 6-digit sign-in code is emailed to **Mailpit at
http://localhost:8025** and, in development, also printed in the API console.
No email leaves your machine.

## Importing statements (specialists)

1. **Dashboard → Import statements**, choose the clinic and an `.xlsx` or `.csv` file.
   Download the Excel or CSV template from the same screen.
2. **Check file**: every row is validated before anything is published. File
   problems (wrong type, empty, over 5,000 rows, missing columns) are reported by name.
3. **Preview**: the destination clinic is shown prominently, with counts of valid
   rows, invalid rows (row number and reason) and possible duplicates (same account
   number and statement date as an existing statement). Choose **Skip** or
   **Publish as new version** for each duplicate.
4. **Publish valid rows**: statements appear for the clinic immediately, marked
   **New**. The result page offers an error report of failed and skipped rows.

Template columns (headers are matched flexibly, e.g. "Patient Name" or "Acct No"):

| Column | Required | Format |
|---|---|---|
| `patient_name` | yes | text, ≤ 200 |
| `account_number` | yes | text, ≤ 64 |
| `statement_date` | yes | `YYYY-MM-DD` or `MM/DD/YYYY`, not in the future |
| `balance_due` | yes | amount, e.g. `125.50`; negative = credit |
| `patient_dob`, `service_date_from`, `service_date_to` | no | dates |
| `cpt_codes` | no | 5-character codes separated by spaces, commas or semicolons |
| `billed_amount`, `insurance_paid`, `adjustments` | no | amounts |
| `insurance_name` | no | text |

Single statements with a PDF use **Dashboard → Upload statement** (PDF only, ≤ 10 MB,
with a confirm-the-clinic step).

## Tests

```bash
npm test                         # unit tests: parsing, validation, crypto, policy
npm --prefix server run smoke    # end-to-end API journey; needs db:reset + running API + Mailpit
```

## Project layout

```
server/src/
  app.js, index.js          Express app (security headers, CSRF guard, sessions, routes)
  db/migrations/*.sql       schema (001) and immutability triggers (002)
  db/seed.js                synthetic demo data, loaded through the real import pipeline
  middleware/               server-side sessions, role guards, no-store
  services/access.js        the one place that decides what a user may see
  services/imports/         parse → validate → preview → publish, template, error report
  routes/                   auth, statements, uploads, imports, dashboard, admin
client/src/
  pages/                    one file per screen group (auth, clinic, statements, specialist, admin)
  components/               layout/header, session timeout, remarks ledger, statement layout
  styles/base.css           Clinical Ledger design tokens (from the original prototype)
```

## Security and HIPAA notes

- 2-step verification on every sign-in (email code; authenticator app optional), lockout
  after 5 failures, 15-minute inactivity sign-out with a warning at 13 minutes.
- Every request is scoped on the server; out-of-scope records return "not found" and
  are logged as `access.blocked`.
- Audit events are written in the same transaction as the action; the database refuses
  updates or deletes on `audit_event`, `remark` and `statement_file`, and edits to
  published statement data.
- Emails contain no patient information. Logs record IDs and error codes only.
- Before production: managed PostgreSQL with TLS and encryption at rest, a private
  encrypted object store for files (replace the local driver in `server/src/lib/storage.js`),
  a BAA-covered email provider, `NODE_ENV=production`, `TRUST_PROXY`, and a signed BAA
  with each vendor (see DOCS/02-trd.md §4).
