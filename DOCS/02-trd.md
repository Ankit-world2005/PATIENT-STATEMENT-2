# Technical Requirements Document: My Patient

| | |
|---|---|
| **Product** | My Patient (patient statement portal) |
| **Company** | US24 Solutions |
| **Version** | v1 (first usable release) |
| **Document status** | Draft for review |
| **Date** | October 21, 2026 |
| **Inputs** | 00-app-brief.md, 01-prd.md (approved) |

This document describes **how** v1 will be built. It does not change the product scope in 01-prd.md. Every PRD requirement keeps its ID (FR-x, NFR-x, F-x) so it can be traced.

---

## 1. Summary of Decisions

| Area | Decision |
|---|---|
| Application shape | One web application (a "modular monolith"). No separate API service, no mobile apps. |
| Language and framework | Python 3.13, Django 5.2 LTS |
| Frontend | Server-rendered Django templates, HTMX for small partial updates, Tailwind CSS (standalone CLI), minimal vanilla JavaScript |
| Database | PostgreSQL 17 on Amazon RDS |
| File storage | Amazon S3, private bucket, encrypted |
| Authentication | Built into the app, using Django's auth system with django-otp (email code + authenticator app), django-axes (lockout) and a breached-password check |
| Email | Amazon SES |
| Hosting | AWS: ECS on Fargate behind an Application Load Balancer, one region in the US |
| Background jobs | None in v1. All work, including the 5,000-row import, runs within the web request. |
| Infrastructure as code | Terraform |
| Source control and CI/CD | GitHub (private repository) with GitHub Actions |
| HIPAA basis | AWS Business Associate Agreement (BAA); only HIPAA-eligible AWS services store or process patient information |

**Main reasoning:** the app is a classic secure business portal: forms, lists, file upload, PDFs and strict access rules, used by roughly 50–500 clinics. One mature framework with built-in security features, one database and one cloud provider under one BAA is the simplest setup that meets every requirement. Each extra service would be another vendor to sign a BAA with, secure and maintain.

---

## 2. System Architecture

### 2.1 Overview

```
 Browser (desktop / phone)
        │  HTTPS (TLS 1.2+)
        ▼
 AWS WAF ──► Application Load Balancer (TLS certificate from ACM)
                    │
                    ▼
     ECS Fargate service: "web" (Django + Gunicorn), 2 tasks in 2 availability zones
        │                 │                    │                   │
        ▼                 ▼                    ▼                   ▼
  RDS PostgreSQL     S3 bucket           Amazon SES          Secrets Manager
  (all records,      (statement PDFs,    (codes, invites,    (DB password,
   audit log)         import files)       reset links)        app secret key)

  Outbound only: Have I Been Pwned "range" API (password check; no patient data sent)
  Logs and metrics: CloudWatch
```

All application containers and the database run in private subnets. Only the load balancer is reachable from the internet.

### 2.2 Responsibility boundaries inside the application

The Django project is split into modules ("apps"). Each owns its data and rules.

| Module | Responsibilities | PRD features |
|---|---|---|
| `accounts` | Users, roles, login, 2-step verification, password rules, invitations, password reset, session timeout, deactivation | F1, F2, F3, F4 |
| `clinics` | Clinics, clinic users, specialist-to-clinic assignments | F5 |
| `access` | One central place that decides which clinics and statements a user may see. Every other module asks it rather than writing its own rules. | F4 |
| `statements` | Statement records, PDF storage, list, search, detail, "New" badge, withdrawal, download, print view, standard-layout PDF | F7, F9, F10, F12, N4 |
| `imports` | Template download, file parsing, row validation, duplicate detection, preview, publish, error report | F8 |
| `remarks` | Remarks log, remark types, "unanswered" status | F11 |
| `dashboard` | Clinic home page (three cards), specialist dashboard, admin landing page | F6, N1 |
| `audit` | Writing and reading audit events, audit filters and export | F13 |
| `ui` | Shared layout: header with user name on the left and logo on the right, session-timeout warning, accessible components | N2, N3, F14 |

**Key rule:** views never query statements directly. They call `access` helpers, such as "statements visible to this user," that always filter by clinic. When a record is out of scope, the helper returns "not found" (FR-2.5).

### 2.3 Data model (main tables)

| Table | Key fields | Notes |
|---|---|---|
| `user` | email, full name, role (admin / specialist / clinic_user), clinic (clinic users only), is_active | Never hard-deleted (FR-4.4) |
| `clinic` | name, clinic ID, address, primary contact, is_active | |
| `specialist_assignment` | specialist, clinic | Many-to-many (FR-2.3) |
| `statement` | clinic, patient name, account number, statement date, balance due, optional fields (FR-8.2), source (pdf / import), version, supersedes, status (active / withdrawn), withdrawal reason, uploaded_by, uploaded_at, first_opened_by_clinic_at | The "New" badge shows while first_opened_by_clinic_at is empty |
| `statement_file` | statement, S3 key, size, checksum | PDF uploads only |
| `import_batch` | clinic, specialist, original file S3 key, totals, status, error report S3 key | Shown on the specialist dashboard |
| `remark` | statement, author, type (clinic / specialist / insurance), insurance name, reference number, text (≤ 2,000 characters), created_at | Insert-only |
| `audit_event` | timestamp (UTC), user, role, clinic, action, target type and ID, IP address, outcome | Insert-only, protected at the database level (Section 5.5) |
| `session` | Django's database-backed sessions | Lets the app end all of a user's sessions immediately (FR-4.4) |

Search on patient name and account number uses PostgreSQL trigram indexes (`pg_trgm`) so partial matches stay fast (FR-9.3).

---

## 3. Technology Choices

### 3.1 Frontend
- **Django templates** render complete HTML pages on the server. No single-page-app framework is used.
- **HTMX** handles small in-page updates: posting a remark, refreshing the import preview, paging and filtering the list.
- **Tailwind CSS** is built with the standalone command-line tool, so no Node.js toolchain is needed.
- **Vanilla JavaScript** is used only for the session-timeout warning (FR-1.9) and the print button (FR-12.2).

**Why:** server-rendered pages give semantic, accessible HTML by default and keep patient data out of the browser's storage. They also work well on phones and mean only one codebase to secure.

### 3.2 Backend
- **Python 3.13 + Django 5.2 LTS.** Django provides sessions, CSRF protection, password hashing, password validators, an ORM that prevents SQL injection, and a long-term-support release that receives security fixes through April 2028.
- **Gunicorn** is the application server.

### 3.3 Database
- **PostgreSQL 17 on Amazon RDS**: encrypted at rest with AWS KMS, automated daily backups with point-in-time recovery, and a Multi-AZ standby in production (see Q4).

### 3.4 Authentication
Authentication is built into the app with well-established Django packages rather than bought from an outside identity service. The PRD's rules are precise (FR-1.3 to FR-1.10), and an in-app setup can implement each one exactly.

| Requirement | How it is met |
|---|---|
| FR-1.1 Email and password | Django auth, with email as the username |
| FR-1.2 / 1.3 Email code; authenticator option | `django-otp` with the email and TOTP plugins. Codes are 6 digits, valid for 10 minutes and single use. A counter ends the attempt after 5 wrong codes. |
| FR-1.4 2-step on every login | A middleware blocks every page except login and 2-step pages until verification is complete. No "remember device." |
| FR-1.5 Lockout | `django-axes`: 5 failures trigger a 15-minute lock, and each failure is logged |
| FR-1.6 Password rules | Django `MinimumLengthValidator(12)` and `CommonPasswordValidator`, plus a breached-password check against the Have I Been Pwned range API (`pwned-passwords-django`) |
| FR-1.7 / 1.8 Reset (30 min) and invitations (72 h) | Two signed, single-use token generators with different lifetimes |
| FR-1.9 15-minute inactivity | Server-side session expiry, refreshed on each real user action, plus a JavaScript warning at 13 minutes with a "Stay signed in" button |
| FR-1.10 No account enumeration | The same message and similar response time whether or not an account exists |
| FR-4.4 Immediate deactivation | Database-backed sessions; deactivating a user deletes all of their sessions |

### 3.5 Important libraries

| Purpose | Library |
|---|---|
| 2-step verification | `django-otp` (email and TOTP devices), `qrcode` for authenticator enrollment |
| Login lockout | `django-axes` |
| Breached-password check | `pwned-passwords-django` |
| S3 file storage | `django-storages`, `boto3` |
| Email through SES | `django-ses` (or SMTP to SES) |
| Excel reading and writing | `openpyxl`; CSV through Python's standard library |
| PDF validation | `pypdf` (confirms an upload is a real PDF that is not encrypted) |
| PDF generation (standard layout, FR-7.8) | `WeasyPrint` (HTML template to PDF) |
| Security headers | `django-csp`, plus Django's built-in security settings |
| Static files | `whitenoise` (no CDN needed) |
| Configuration | `django-environ` |
| Database driver | `psycopg` 3 |

### 3.6 Development tools

| Purpose | Tool |
|---|---|
| Dependency management | `uv` with a lock file |
| Formatting and linting | `ruff`, `djlint` for templates |
| Type checking | `mypy` with `django-stubs` (main modules) |
| Security scanning | `bandit` (code), `pip-audit` (dependencies), GitHub Dependabot, OWASP ZAP baseline scan against staging |
| Tests | `pytest`, `pytest-django`, `factory_boy`, `coverage` |
| Browser tests | Playwright for Python, with `axe-core` for accessibility checks |
| Local services | Docker Compose (PostgreSQL, Mailpit for viewing test emails) |
| Infrastructure | Terraform |

---

## 4. External Services

Every external service the system needs is listed below. Any service that stores or processes patient information must be covered by a BAA (NFR-2).

| Service | Used for | Handles patient information? | BAA |
|---|---|---|---|
| AWS ECS Fargate + ECR | Running the app and storing its container images | Yes (processing) | AWS BAA |
| AWS Application Load Balancer + ACM | HTTPS entry point and certificate | Yes (in transit) | AWS BAA |
| AWS WAF | Blocking common attacks; rate limit on login | Passes through | AWS BAA |
| Amazon RDS for PostgreSQL | All records and the audit log | Yes | AWS BAA |
| Amazon S3 | Statement PDFs, import files, error reports | Yes | AWS BAA |
| Amazon SES | 2-step codes, invitations, password resets | No by design (NFR-3); email addresses only | AWS BAA |
| AWS Secrets Manager + KMS | Secrets and encryption keys | No | AWS BAA |
| Amazon CloudWatch | Application logs, metrics, alarms | Must not (logs exclude patient data, Section 5.6) | AWS BAA |
| Have I Been Pwned "Pwned Passwords" range API | Breached-password check (FR-1.6) | No. Only the first 5 characters of a password hash are sent. | Not needed |
| GitHub (repository and Actions) | Code, CI/CD | No. Patient data must never be committed, and tests use synthetic data. | Not needed |
| DNS for us24solutions.com | Portal address and email verification records | No | Not needed |
| Penetration-testing vendor | NFR-7 | Staging only, with synthetic data | Only if given production access |

**Before any real patient data is loaded,** US24 must accept the AWS BAA (available in AWS Artifact) for the production AWS account. US24 must also confirm that every AWS service listed is on AWS's current HIPAA Eligible Services list.

---

## 5. Security, Privacy and Secrets

### 5.1 Encryption
- **In transit:** HTTPS only, with a TLS 1.2+ security policy on the load balancer and HTTP Strict Transport Security (HSTS) enabled. Connections from the app to the database use TLS, and SES uses TLS (NFR-1).
- **At rest:** RDS storage, snapshots, the S3 bucket and CloudWatch logs are encrypted with AWS KMS keys (NFR-1).
- Field-level encryption of patient names is **not** used. It would prevent partial-name search (FR-9.3). Full-disk encryption plus strict access control meets HIPAA's encryption expectations for this use.

### 5.2 Access control
- Role and clinic checks go through the `access` module for every request (FR-2.5).
- Clinic users can only reach clinic pages; staff pages check the role on the server (F4).
- Files are never public. Downloads are streamed through the app after the access check and the audit write. The S3 bucket blocks all public access and allows only the app's role.
- Django's built-in admin site is disabled in production. Admin features are normal app pages with full audit logging.

### 5.3 Browser and session protections
- Session and CSRF cookies are `Secure` and `HttpOnly` (session cookie) with `SameSite=Lax`.
- `Cache-Control: no-store` on every page and file that contains patient data. This stops the back button from showing data after sign-out on shared clinic computers.
- Content Security Policy, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin` and `X-Content-Type-Options: nosniff`.

### 5.4 Upload safety
- PDFs are checked for type, size (≤ 10 MB) and that they can be parsed, and encrypted PDFs are rejected. They are stored under random S3 keys, never under the uploaded file name.
- Import files must be .xlsx or .csv. They are read with formulas ignored, and exported error reports neutralise any cell starting with `=`, `+`, `-` or `@` so they can't run as spreadsheet formulas.
- Virus scanning is not in the v1 baseline because only US24 staff can upload. See Q6.

### 5.5 Audit log protection (FR-13)
- Each audit event is written in the same database transaction as the action it records, so an action cannot succeed without its audit entry.
- Views, downloads and print requests are recorded before the content is returned.
- The app's database user has INSERT and SELECT rights on `audit_event`, but not UPDATE or DELETE. A database trigger also rejects updates and deletes.
- The IP address comes from the load balancer's forwarded header. Only the load balancer's value is trusted.

### 5.6 Privacy in logs and email
- Application logs record IDs and actions only, never patient names, account numbers, amounts or remark text. A shared logging filter enforces this, and tests check it.
- Email templates contain no patient information (NFR-3). Invitations and codes include only the user's name and a link to the portal.

### 5.7 Secrets handling
- Production and staging secrets (database password, Django secret key) live in AWS Secrets Manager and are passed to containers at start-up. The RDS password is managed and rotated by RDS.
- The app reaches AWS services through its IAM task role, with no stored access keys.
- GitHub Actions deploys through short-lived OpenID Connect (OIDC) credentials, with no long-lived AWS keys in GitHub.
- Local development uses a `.env` file that is excluded from Git and contains no real secrets.
- A pre-commit secret scanner (for example, `gitleaks`) runs locally and in CI.

### 5.8 Network and account security
- The app and database run in private subnets. The database accepts connections only from the app's security group.
- AWS WAF uses AWS managed rule sets plus a rate limit on the login and 2-step endpoints.
- AWS root account with MFA, locked away. Named IAM users or SSO with MFA for staff, and least-privilege roles. CloudTrail enabled in all accounts.

---

## 6. Performance, Reliability and Accessibility

### 6.1 Performance targets

| Requirement | Target | How it is met |
|---|---|---|
| NFR-13 Page load < 3 s | Server response under 500 ms for list and detail pages at 500 clinics | Indexed queries (clinic + statement date, trigram on name and account number), pagination of 25 rows, no client-side framework |
| NFR-14 5,000-row import previewed < 2 min | Under 30 seconds in tests | Rows are validated in memory, duplicates are checked with one query per batch, and rows are inserted in bulk. The load balancer timeout is raised to 120 seconds for the import endpoint only. |
| FR-7.7 5,000 rows | Supported | The file size limit is 10 MB |
| NFR-16 50 → 500 clinics | No redesign needed | The same architecture scales by adding containers or a larger database instance |

### 6.2 Reliability (NFR-6, NFR-15)
- Two app containers run in two availability zones, with health checks and automatic replacement.
- The production database is RDS Multi-AZ, with automatic failover in about 1–2 minutes (see Q4).
- RDS automated backups are kept for 35 days with point-in-time recovery. S3 versioning protects files from overwrites and deletions.
- A restore drill is completed and documented before launch (NFR-6).
- CloudWatch alarms cover errors, slow responses, database CPU and storage, failed email sends and unhealthy containers. Alerts go to a US24 email address.

### 6.3 Data retention (NFR-5)
- Statements, files, remarks and audit events stay in the live database and S3 for at least 7 years. No automatic deletion is configured.
- An S3 lifecycle rule moves files older than 1 year to a cheaper storage class but never deletes them.
- Deleting data after 7 years is a manual, documented process for a later release.

### 6.4 Accessibility (NFR-12, WCAG 2.1 AA)
- Semantic HTML: real buttons, links, labels, headings and table headers.
- Every form field has a visible label. Errors are announced and linked to their field.
- Everything works with a keyboard, focus is visible, and a "Skip to content" link is provided.
- Color contrast is at least 4.5:1. Status is never shown by color alone; for example, the "New" badge has text.
- The disabled "Coming soon" cards (FR-3.4) use `aria-disabled` and announce "Coming soon."
- The session warning (FR-1.9) is announced to screen readers and can be extended by keyboard. This also meets WCAG's timing rule.
- Pages work at 200% zoom and at 375 px width (F14).

---

## 7. Testing Strategy

| Level | What it covers | Tooling |
|---|---|---|
| Unit | Validators, import row rules, duplicate detection, token lifetimes, remark rules, access helpers | pytest |
| Integration | Each view with the database: login → 2-step → page; upload → publish → audit entry; import preview → publish | pytest-django, factory_boy |
| **Access-control matrix** | An automated test that visits **every URL** as every role, from a clinic that owns the record and one that doesn't, and checks for "allowed" or "not found." New URLs fail the test until they are added to the matrix. | pytest |
| Audit completeness | Every FR-13.1 event type creates an entry with all FR-13.2 fields; attempted UPDATE or DELETE on the audit table fails | pytest + real PostgreSQL |
| End-to-end | The core user outcome (PRD Section 3), the specialist upload and import flows, withdrawal, remarks, download and print | Playwright |
| Accessibility | An automated axe scan on every page in the end-to-end suite; a manual keyboard and screen-reader check (NVDA, VoiceOver) before launch | axe-core, manual |
| Performance | Import of a 5,000-row file timed in CI against a real database; a basic load test on staging | pytest timing, Locust (staging only) |
| Security | bandit, pip-audit, gitleaks in CI; OWASP ZAP baseline against staging; external penetration test before go-live (NFR-7) | CI + vendor |
| Responsive | End-to-end core flows at 375 px, plus iOS Safari and Android Chrome checks | Playwright device profiles + real phones |

**Rules**
- Tests use only synthetic data. Real patient data never enters local or staging environments.
- CI blocks merging if any test, lint or security check fails.
- Code coverage target: 85% overall, 95% for `accounts`, `access` and `audit`.
- Each PRD acceptance criterion (PRD Section 8) is mapped to at least one automated or documented manual test.

---

## 8. Environments

| | Local | Staging | Production |
|---|---|---|---|
| Purpose | Development | Testing, demos, penetration test, user acceptance testing | Live clinics |
| Where | Developer laptop, Docker Compose | Separate AWS account | Separate AWS account (BAA accepted) |
| Data | Synthetic seed data | Synthetic data only | Real patient data |
| Database | PostgreSQL container | RDS, single-AZ, small instance | RDS Multi-AZ |
| Files | Local disk | S3 | S3 |
| Email | Mailpit (nothing sent) | SES, sending only to verified test addresses | SES production |
| App containers | 1 | 1 | 2 (two availability zones) |
| Address | localhost | staging.portal.us24solutions.com (behind WAF IP allow-list) | portal.us24solutions.com (see Q2) |
| Debug | On | Off | Off |

Both AWS accounts sit under one AWS Organization so that billing and security settings are managed in one place.

---

## 9. Deployment

1. Developers work on branches and open a pull request. CI runs lint, type checks, tests, security scans and builds the container image.
2. When the pull request merges to `main`, the image is pushed to ECR and **deployed automatically to staging**. Database migrations run first as a one-off ECS task.
3. **Production deploys are manual:** a release tag plus an approval in GitHub Actions. The same tested image is promoted, not rebuilt.
4. ECS performs a rolling deployment. New containers must pass health checks before old ones stop, so deploys happen without downtime.
5. **Rollback:** redeploy the previous task definition. Migrations must be backward-compatible (add first, remove in a later release) so rollback is always safe.
6. Infrastructure changes go through Terraform, with a reviewed plan before apply, through the same pipeline.

### Rough monthly AWS cost (to verify with the AWS Pricing Calculator)

| Environment | Estimate |
|---|---|
| Production (2 small containers, load balancer, Multi-AZ small database, NAT gateway, WAF, S3, SES, logs) | about US$180–250 |
| Staging | about US$80–120 |

---

## 10. Requirement Coverage and Flags

Most PRD requirements are fully met by this stack. The items below are **not fully met by technology alone**.

| PRD requirement | Status | Detail |
|---|---|---|
| **FR-12.3** Every print request is audited | ⚠️ **Partially met** | The app can record prints made with its **Print** button, which opens a server-generated print view and logs the request. It **cannot detect** a user pressing Ctrl+P or using the browser menu on an ordinary page. Mitigation: the page view itself is always logged, and a print stylesheet hides content on non-print pages. See Q3. |
| **FR-13.4** No one can edit or delete audit entries | ⚠️ **Partially met** | No app user, admin included, can change entries, and the database itself blocks it. Someone with full AWS account or database-owner access could still alter the database. Complete protection would need write-once storage, such as a nightly export to S3 Object Lock. See Q5. |
| **NFR-15** 99.5% monthly uptime | ⚠️ **Met only with Multi-AZ database** | A single database instance is the main single point of failure. The plan includes Multi-AZ, which roughly doubles database cost. See Q4. |
| **NFR-7** Independent penetration test | ⛔ **Not a stack item** | Requires an outside vendor and budget. Staging is designed for this test. |
| **NFR-8** Incident and breach-response procedure | ⛔ **Not a stack item** | A US24 policy document. The stack supplies the evidence: audit log, CloudTrail and alarms. |
| **NFR-9** First-time user finds a statement in under 2 minutes | ⛔ **Not guaranteed by the stack** | Depends on design and a short usability test with 3–5 clinic users before launch. |
| **NFR-2** BAAs | ✅ with an action | Met by staying within AWS, but US24 must accept the AWS BAA in the production account before go-live. |
| **FR-1.2** Email codes | ✅ with a risk | Logins depend on email being delivered quickly. If SES is delayed, users with authenticator apps can still sign in. |
| **FR-1.6** Breached-password check | ✅ with a decision | Needs outbound internet access. If the check service is unreachable, the app falls back to the built-in common-password list ("fail open"). See Q7. |
| Brief: iOS / Android | Out of scope (per PRD) | Covered by the responsive web portal in v1. Native apps would be a separate later project. |

---

## 11. Rejected Alternatives

| Alternative | Why not chosen for v1 |
|---|---|
| React or Next.js frontend with a separate API | Two codebases, an API layer and token handling to secure. It adds no benefit for form- and list-based pages, and Next.js hosting platforms usually offer a BAA only on higher-priced plans. |
| Node.js (NestJS/Express), .NET or Ruby on Rails | All workable. Django was chosen for built-in auth, sessions and security defaults and mature 2-step and lockout packages. Python is also strong for Excel and PDF work. **If US24's developers already know another stack well, that may be the better choice** (Q1). |
| Managed identity services (Amazon Cognito, Auth0, Clerk and similar) | They can't match all the exact PRD rules, such as the lockout timing, 30-minute versus 72-hour links and immediate session ending. Some sign a BAA only on enterprise plans, and they add another vendor. |
| Backend-as-a-service (Supabase, Firebase and similar) | HIPAA coverage is usually only on higher-priced plans. They also push access rules into database policies, which are harder to test and review. |
| Microservices, Kubernetes | Far more operating effort than ~50–500 clinics need. |
| Task queue (Celery + Redis) for imports and email | The 5,000-row import and single emails fit inside a normal request, so a queue would only add services. It can be added later if volumes grow. |
| CloudFront CDN | Static files are small and served efficiently by the app. The load balancer and WAF are enough. |
| Field-level encryption of patient names | Breaks partial-name search (FR-9.3). Disk encryption plus access control is sufficient. |
| PostgreSQL row-level security as the main access control | Strong but adds complexity. The central `access` module plus the access-control test matrix is simpler to reason about. It could be added later as a second layer. |
| Azure or Google Cloud | Both sign BAAs and would work equally well. AWS was chosen for its depth of HIPAA documentation. If US24 already runs on Microsoft Azure, an equivalent Azure design is reasonable (Q1). |

---

## 12. Technical Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A missed access check exposes another clinic's data | HIPAA breach | Central `access` module, a "not found" default, and the access-control test matrix covering every URL |
| Real statement files vary from the template | Import failures | Build the template from US24's real export (PRD Q1) and test with sample files early |
| SES delays or blocks codes | Users can't log in | Set up SES domain verification (DKIM, SPF, DMARC), request production access early, monitor bounces and offer authenticator apps |
| A large import exceeds the request time | Import fails | Limits of 5,000 rows and 10 MB, a CI timing test, and the option to add a background worker later |
| Patient data leaks into logs or error reports | HIPAA breach | Log filter, tests, and no third-party error trackers without a BAA |
| Small team, single maintainer | Slow fixes and security updates | Django LTS, Dependabot, documented runbooks, infrastructure as code |
| Cost growth | Budget overrun | Small instances to start, AWS budget alarms |

---

## 13. Open Questions

These decisions depend on information only US24 can provide. My default is in brackets.

- **Q1. Team and stack fit.** Who will build and maintain the portal: in-house developers, a contractor or an agency? Do they already work in a particular language, or does US24 already use Microsoft Azure? *[Default: Python/Django on AWS as described.]*
- **Q2. Domain and DNS.** Can US24 add DNS records for us24solutions.com (for the portal address and SES email verification)? Which subdomain should be used? *[Default: portal.us24solutions.com.]*
- **Q3. Print logging (FR-12.3).** Is "prints made with the portal's Print button are logged; browser-menu prints are not, but the page view is" acceptable? *[Default: yes.]*
- **Q4. Uptime vs. cost.** Use a Multi-AZ production database to meet 99.5% uptime (about US$30–50 more per month)? *[Default: yes.]*
- **Q5. Audit log protection.** Is database-level protection enough, or should audit entries also be copied nightly to write-once (Object Lock) S3 storage? *[Default: database-level protection only in v1.]*
- **Q6. Virus scanning of uploads.** Should uploaded PDFs and spreadsheets be scanned for malware before clinics can open them (for example, with Amazon GuardDuty Malware Protection for S3)? *[Default: not in v1, because only US24 staff upload.]*
- **Q7. Breached-password check outage.** If the check is unavailable, should password creation be allowed with the basic checks (fail open) or blocked (fail closed)? *[Default: fail open.]*
- **Q8. Time zones.** Which time zone should dates and times show in? Clinics may be in different states. *[Default: shown in each user's browser time zone with the zone label; stored and exported in UTC.]*
- **Q9. Hosting budget.** Is about US$260–370 per month across staging and production acceptable? *[Default: yes.]*
- **Q10. Region.** Is a single US region acceptable, and does any client contract require a specific one? *[Default: one US region, us-west-2 (Oregon).]*

Open product questions from the PRD (Q1–Q8 there) do not change this architecture. They will be answered during design and build.
