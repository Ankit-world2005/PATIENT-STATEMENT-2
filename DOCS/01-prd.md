# Product Requirements Document: My Patient

| | |
|---|---|
| **Product** | My Patient (patient statement portal) |
| **Company** | US24 Solutions |
| **Version** | v1 (first usable release) |
| **Document status** | Draft for review |
| **Date** | October 21, 2026 |
| **Source** | 00-app-brief.md, plus defaults confirmed by the owner on October 21, 2026 |

---

## 1. Product Overview

### 1.1 What it is
My Patient is a secure, HIPAA-compliant web portal. US24 Solutions billing specialists use it to publish patient statements to the clinics they serve. Each clinic signs in and sees only its own patients' statements. Clinics and specialists record remarks against each statement in a shared log, and specialists also record remarks from insurance companies.

### 1.2 Problem being solved
Today, statements and the conversations about them move between US24 and clinics outside a single system (assumed: email, files and phone calls). This causes four problems:

- Clinics cannot see the current state of their patient statements on their own and have to ask US24.
- Remarks from the clinic, the specialist and the insurance company are scattered, so no one has the full history of a statement.
- Sending patient information by email or shared files is hard to control and audit, which is a HIPAA risk.
- Specialists spend time answering status questions instead of working accounts.

### 1.3 Product goal for v1
Give each clinic one secure place to view its patient statements and the full remark history for each one. Give specialists a quick, low-error way to publish those statements.

---

## 2. Users

### 2.1 Primary users

| User | Who they are | What they need |
|---|---|---|
| **Specialist** | US24 Solutions billing staff | Upload or import statements for their assigned clinics, record specialist and insurance remarks, see what clinics have said |
| **Clinic User** | Staff at a client clinic (office manager, front desk, provider) | Sign in securely, find their patients' statements, read the history, add clinic remarks, download or print |

### 2.2 Secondary users

| User | Who they are | What they need |
|---|---|---|
| **Admin** | US24 Solutions owner or manager | Create clinics, create and deactivate users, assign specialists to clinics, review the audit log |

### 2.3 Not users in v1
- **Insurance companies** do not log in. Specialists record insurance remarks on their behalf.
- **Patients** do not log in.

---

## 3. Core User Outcome

> A clinic user signs in with 2-step verification, opens **Patient Statement**, finds a patient, and sees that patient's latest statement and the full remark history. A specialist was able to publish that statement in a few minutes, and only that clinic can see it.

---

## 4. Version-One Feature List

### 4.1 Must-have (v1 cannot launch without these)

| ID | Feature | Users |
|---|---|---|
| F1 | Login page with email and password | All |
| F2 | 2-step verification (email code; authenticator app optional) | All |
| F3 | Password reset | All |
| F4 | Role-based access and clinic data isolation | All |
| F5 | Admin: clinic and user management, specialist-to-clinic assignment | Admin |
| F6 | Specialist dashboard | Specialist |
| F7 | Single statement upload (PDF, one patient) | Specialist |
| F8 | Bulk statement import (Excel/CSV, one clinic per file) | Specialist |
| F9 | Patient statement list with search and filters | Clinic User, Specialist |
| F10 | Statement detail view | Clinic User, Specialist |
| F11 | Remarks log per statement (Clinic, Specialist, Insurance) | Clinic User, Specialist |
| F12 | Download and print statements | Clinic User, Specialist |
| F13 | Audit log of all access to patient information | System, Admin |
| F14 | Responsive web design for desktop, tablet and phone browsers | All |

### 4.2 Nice-to-have items from the brief (included in v1 because they cost little)

| ID | Feature | Notes |
|---|---|---|
| N1 | Clinic home page with three centered cards: AR Report, Clinic Collection, Patient Statement | Only Patient Statement works; the other two are visibly marked "Coming soon" |
| N2 | User's name in the top-left corner of the header | On every page after login |
| N3 | US24 Solutions logo in the top-right corner of the header | On every page, including login |
| N4 | "New" badge on statements a clinic hasn't opened yet | Helps clinics notice fresh uploads |

### 4.3 Explicitly not in v1
See Section 9.2.

---

## 5. User Stories

### Authentication and access
- **US-01** As any user, I want to sign in with my email and password so that I can reach the portal.
- **US-02** As any user, I want to enter a one-time code after my password so that my account is protected even if my password is stolen.
- **US-03** As any user, I want to reset a forgotten password myself so that I don't have to call US24.
- **US-04** As a clinic user, I want to see only my clinic's patients so that other clinics' information is never exposed to me, and mine is never exposed to them.

### Admin
- **US-05** As an admin, I want to create a clinic and its users so that the clinic can start using the portal.
- **US-06** As an admin, I want to assign specialists to clinics so that each specialist works only on their own clients.
- **US-07** As an admin, I want to deactivate a user right away so that former staff lose access.
- **US-08** As an admin, I want to review who viewed, uploaded or downloaded which statement so that I can answer compliance questions.

### Specialist
- **US-09** As a specialist, I want a dashboard of my clinics, recent uploads and unanswered clinic remarks so that I know what needs attention.
- **US-10** As a specialist, I want to upload a single PDF statement for one patient so that I can publish one-off statements.
- **US-11** As a specialist, I want to import a spreadsheet of many statements for one clinic so that I can publish a full cycle in one go.
- **US-12** As a specialist, I want to see a clear error report when rows in my import fail so that I can fix them and re-import.
- **US-13** As a specialist, I want to confirm the target clinic before publishing so that I never send statements to the wrong clinic.
- **US-14** As a specialist, I want to withdraw a statement I published by mistake so that the clinic no longer sees it, while the record of what happened is kept.
- **US-15** As a specialist, I want to add specialist remarks and record insurance remarks on a statement so that the clinic sees the full history.

### Clinic user
- **US-16** As a clinic user, I want a simple home page with three cards so that I know where to go.
- **US-17** As a clinic user, I want to search statements by patient name, account number or date so that I can find a patient quickly.
- **US-18** As a clinic user, I want to open a statement and see its details and remark history so that I understand where it stands.
- **US-19** As a clinic user, I want to add a remark to a statement so that US24 knows about updates on our side.
- **US-20** As a clinic user, I want to download or print a statement so that I can share it with the patient or keep it for our records.

---

## 6. Functional Requirements

### 6.1 Authentication (F1, F2, F3)
- **FR-1.1** The portal opens on a login page asking for email and password. The page shows the US24 Solutions logo top-right.
- **FR-1.2** After a correct password, the system requires a second step. The default is a 6-digit code emailed to the user. A user may instead enroll an authenticator app (TOTP).
- **FR-1.3** Email codes expire after 10 minutes and can be used once. After 5 wrong codes, the user must sign in again from the start.
- **FR-1.4** 2-step verification is required on every login for every role in v1. There is no "remember this device" option in v1.
- **FR-1.5** After 5 failed password attempts, the account is locked for 15 minutes and the attempt is logged.
- **FR-1.6** Passwords must have at least 12 characters, and the system rejects common or known-breached passwords.
- **FR-1.7** A "Forgot password" link sends a single-use reset link that expires after 30 minutes. A reset still requires 2-step verification on the next login.
- **FR-1.8** New users receive an invitation email to set their password. Invitation links expire after 72 hours.
- **FR-1.9** Sessions end after 15 minutes of inactivity, with a warning 2 minutes beforehand. Users can sign out manually from any page.
- **FR-1.10** Login error messages do not reveal whether an email address exists.

### 6.2 Roles and data isolation (F4)
- **FR-2.1** The system has three roles: Admin, Specialist and Clinic User.
- **FR-2.2** A Clinic User belongs to exactly one clinic. A clinic can have many Clinic Users.
- **FR-2.3** A Specialist can be assigned to many clinics and can only see statements for clinics assigned to them.
- **FR-2.4** An Admin can see all clinics and statements.
- **FR-2.5** Access rules are enforced by the system for every request, not just hidden in the interface. A Clinic User who requests another clinic's statement (for example, by changing a link) receives a "not found" response, and the attempt is logged.

### 6.3 Header and clinic home page (N1, N2, N3)
- **FR-3.1** Every page after login shows a header with the signed-in user's full name top-left and the US24 Solutions logo top-right. A sign-out control sits in the header.
- **FR-3.2** After login, a Clinic User lands on a home page that shows only three centered cards: **AR Report**, **Clinic Collection** and **Patient Statement**.
- **FR-3.3** The Patient Statement card opens the statement list (F9).
- **FR-3.4** The AR Report and Clinic Collection cards are visibly disabled, labeled "Coming soon," and do nothing when clicked.
- **FR-3.5** After login, Specialists land on the Specialist Dashboard (F6) and Admins land on the Admin area (F5).

### 6.4 Admin management (F5)
- **FR-4.1** An Admin can create, edit and deactivate clinics. A clinic has a name, a clinic ID, an address and a primary contact.
- **FR-4.2** An Admin can invite users, set their role, and set a Clinic User's clinic.
- **FR-4.3** An Admin can assign and unassign specialists to clinics.
- **FR-4.4** An Admin can deactivate a user. Deactivation ends that user's active sessions immediately. Users are never hard-deleted.
- **FR-4.5** An Admin can resend an invitation and can reset a user's 2-step enrollment, for example after a lost phone.
- **FR-4.6** Deactivating a clinic blocks all of its users from logging in. Its statements are kept for the retention period.

### 6.5 Specialist dashboard (F6)
- **FR-5.1** The dashboard shows four things:
  - the specialist's assigned clinics, with a statement count for each;
  - recent uploads and imports with their status (Published, Failed, Partially imported);
  - clinic remarks with no specialist reply yet, newest first;
  - buttons for **Upload Statement** and **Import Statements**.
- **FR-5.2** Selecting a clinic opens that clinic's statement list (F9).
- **FR-5.3** Selecting an unanswered remark opens the related statement detail (F10).

### 6.6 Single statement upload (F7)
- **FR-6.1** A specialist selects a clinic (only assigned clinics are listed), enters the statement fields (Section 6.8), and attaches one PDF.
- **FR-6.2** Only PDF files up to 10 MB are accepted.
- **FR-6.3** Before publishing, a confirmation screen shows the clinic name, patient name and account number. The specialist must confirm before the statement is published.
- **FR-6.4** Once confirmed, the statement is immediately visible to that clinic's users and is marked "New."

### 6.7 Bulk statement import (F8)
- **FR-7.1** A specialist selects one clinic and uploads one .xlsx or .csv file. Each row is one patient statement.
- **FR-7.2** A downloadable template file defines the required columns.
- **FR-7.3** The system validates every row before publishing anything: required fields present, valid dates, numeric amounts, no duplicate rows in the file.
- **FR-7.4** A preview shows the clinic name, total rows, valid rows and invalid rows with their reasons. The specialist chooses **Publish valid rows** or **Cancel**.
- **FR-7.5** If a row matches an existing statement for that clinic with the same account number and statement date, it is flagged as a possible duplicate. The specialist chooses whether to skip it or publish it as a new version.
- **FR-7.6** After publishing, an import summary is saved and can be downloaded as a file listing the failed rows and reasons.
- **FR-7.7** Imports of up to 5,000 rows must be supported.
- **FR-7.8** Imported statements without a PDF display their data in a standard on-screen statement layout, which can also be downloaded as a PDF.

### 6.8 Statement data
- **FR-8.1** Each statement stores at least: clinic, patient name, patient account number, statement date, and patient balance due. It also stores the uploading specialist, the upload date and time, and its status (Active or Withdrawn).
- **FR-8.2** Optional fields: patient date of birth, dates of service, CPT codes, billed amount, insurance paid, adjustments and insurance name.
- **FR-8.3** The final field list will be confirmed against US24's current statement export (see Open Question Q1).

### 6.9 Statement list and search (F9)
- **FR-9.1** Clinic Users see a list of their clinic's active statements. Specialists see the same list for any assigned clinic.
- **FR-9.2** The list shows patient name, account number, statement date, balance due, last remark date and a "New" badge if no clinic user has opened it.
- **FR-9.3** Users can search by patient name or account number, and filter by statement date range.
- **FR-9.4** The list can be sorted by statement date (newest first by default), patient name or balance.
- **FR-9.5** The list is paginated, with 25 statements per page by default.

### 6.10 Statement detail (F10)
- **FR-10.1** The detail page shows all statement fields, the attached PDF (or the standard layout), and the remarks log (F11).
- **FR-10.2** When a Clinic User opens a statement, it is no longer marked "New" for that clinic.
- **FR-10.3** If a patient has several statements, the detail page links to the patient's other statements in the same clinic.
- **FR-10.4** A specialist can withdraw a statement and must give a reason. A withdrawn statement disappears from the clinic's view. The specialist, the admin and the audit log keep the record.

### 6.11 Remarks log (F11)
- **FR-11.1** Each statement has a chronological log of remarks, oldest at the top and newest at the bottom.
- **FR-11.2** Each entry shows the author's name, role, date and time, the remark type and the text.
- **FR-11.3** Remark types are **Clinic**, **Specialist** and **Insurance**.
- **FR-11.4** Clinic Users can only add **Clinic** remarks. Specialists can add **Specialist** or **Insurance** remarks. An Insurance remark also captures the insurance company name, and optionally a reference or call number.
- **FR-11.5** Remarks are plain text, up to 2,000 characters.
- **FR-11.6** Remarks cannot be edited or deleted once saved. A correction is made by adding a new remark.
- **FR-11.7** A Clinic remark counts as "unanswered" on the Specialist Dashboard until a specialist adds a remark to the same statement.

### 6.12 Download and print (F12)
- **FR-12.1** Users can download any statement they are allowed to see as a PDF.
- **FR-12.2** Users can print the statement detail page. The printout includes the statement, but remarks are included only if the user chooses to include them.
- **FR-12.3** Every download and print request is recorded in the audit log.

### 6.13 Audit log (F13)
- **FR-13.1** The system records the following events:
  - logins, logouts and failed logins;
  - 2-step verification events;
  - views, uploads, imports, downloads and print requests for statements;
  - withdrawals and remarks;
  - user and clinic changes;
  - blocked access attempts.
- **FR-13.2** Each audit entry stores the user, role, clinic, action, target record, date and time, and IP address.
- **FR-13.3** Admins can view and filter the audit log by user, clinic, action and date range, and export it.
- **FR-13.4** No user, including Admins, can edit or delete audit entries.

---

## 7. Non-Functional Requirements

### 7.1 Security and HIPAA compliance
- **NFR-1** All data is encrypted in transit (TLS 1.2 or higher) and at rest.
- **NFR-2** Every hosting, email and storage vendor that handles patient information must sign a Business Associate Agreement (BAA) with US24 Solutions before launch.
- **NFR-3** Emails sent by the system never contain patient information. They only say that there is something to view in the portal, with a link to sign in.
- **NFR-4** The system follows HIPAA's "minimum necessary" principle. Users only see the data their role and clinic assignment require.
- **NFR-5** Statements, remarks and audit logs are retained for at least 7 years. Withdrawn statements are kept for the same period.
- **NFR-6** Data is backed up daily, and backups are encrypted. A restore is tested before launch.
- **NFR-7** An independent security review or penetration test is completed before go-live, and high-severity findings are fixed.
- **NFR-8** US24 maintains a written incident and breach-response procedure that covers the portal.

### 7.2 Usability
- **NFR-9** A first-time Clinic User can sign in and find a named patient's statement in under 2 minutes without training.
- **NFR-10** The design is clean and uncluttered. Labels use plain language rather than billing jargon where possible.
- **NFR-11** The portal works on current versions of Chrome, Edge, Safari and Firefox on desktop, and on Safari (iOS) and Chrome (Android) on phones.
- **NFR-12** The design targets the WCAG 2.1 AA accessibility standard.

### 7.3 Performance and reliability
- **NFR-13** Pages load in under 3 seconds on a normal broadband connection.
- **NFR-14** A 5,000-row import is validated and previewed in under 2 minutes.
- **NFR-15** The portal is available 99.5% of the time each month, excluding announced maintenance.
- **NFR-16** The system supports about 50 clinics at launch and can grow to at least 500 without a redesign.

---

## 8. Acceptance Criteria

### F1 – Login
- [ ] The login page shows email and password fields and the US24 logo top-right.
- [ ] A correct email and password lead to the 2-step verification screen, not straight into the portal.
- [ ] A wrong password shows a generic error that does not confirm whether the email exists.
- [ ] After 5 failed attempts, the account is locked for 15 minutes and an audit entry is created.
- [ ] A deactivated user cannot log in.

### F2 – 2-step verification
- [ ] After the password step, a 6-digit code is emailed. Entering it signs the user in.
- [ ] An expired code (older than 10 minutes) or a reused code is rejected.
- [ ] After 5 wrong codes, the user is returned to the login page.
- [ ] A user who enrolled an authenticator app can sign in with an app code instead.
- [ ] It is impossible to reach any page that shows patient information without completing both steps.

### F3 – Password reset
- [ ] "Forgot password" sends a reset link without revealing whether the account exists.
- [ ] The link works once and expires after 30 minutes.
- [ ] After a reset, the next login still requires 2-step verification.

### F4 – Role-based access and data isolation
- [ ] A Clinic User of Clinic A sees zero statements from Clinic B in lists, searches, links or downloads.
- [ ] Changing a link to point at Clinic B's statement returns "not found" and creates an audit entry.
- [ ] A Specialist sees only assigned clinics. Unassigning a clinic removes access immediately.
- [ ] Clinic Users cannot reach Specialist or Admin pages.

### F5 – Admin management
- [ ] An Admin can create a clinic and invite a Clinic User, and the user receives an invitation email with no patient information in it.
- [ ] An Admin can assign a specialist to a clinic, and the clinic appears on that specialist's dashboard.
- [ ] Deactivating a user signs them out of active sessions and blocks future logins.
- [ ] An Admin can reset a user's 2-step enrollment.

### F6 – Specialist dashboard
- [ ] Shows only assigned clinics, each with its statement count.
- [ ] Shows recent uploads and imports with the correct status.
- [ ] Lists clinic remarks with no specialist reply. A remark drops off the list after the specialist replies.
- [ ] The Upload Statement and Import Statements buttons are visible and work.

### F7 – Single upload
- [ ] Only assigned clinics appear in the clinic picker.
- [ ] Non-PDF files and files over 10 MB are rejected with a clear message.
- [ ] A confirmation screen shows the clinic, patient and account number before publishing.
- [ ] After confirming, the statement appears in that clinic's list marked "New," and an audit entry is created.

### F8 – Bulk import
- [ ] A template file can be downloaded.
- [ ] Files with missing required columns are rejected with a message naming the missing columns.
- [ ] The preview shows the clinic name and the valid and invalid row counts, with a reason for each invalid row.
- [ ] Nothing is published until the specialist confirms.
- [ ] Possible duplicates (same account number and statement date) are flagged, and the specialist decides skip or publish.
- [ ] A 5,000-row file is validated in under 2 minutes.
- [ ] A downloadable error report lists every failed row with its reason.

### F9 – Statement list and search
- [ ] Clinic Users see only their clinic's active statements, newest first.
- [ ] Searching by full or partial patient name or account number returns matching results.
- [ ] Filtering by date range works, and filters can be combined with search.
- [ ] Unopened statements show a "New" badge.

### F10 – Statement detail
- [ ] Shows all statement fields, the PDF or standard layout, and the remarks log.
- [ ] Opening a statement as a Clinic User removes its "New" badge and creates an audit entry.
- [ ] A specialist can withdraw a statement with a required reason. The statement disappears from the clinic's view but stays visible to the specialist, the admin and the audit log.

### F11 – Remarks log
- [ ] Clinic Users can add only Clinic remarks. Specialists can add Specialist or Insurance remarks.
- [ ] Insurance remarks require an insurance company name.
- [ ] Each entry shows the author, role, date and time, and type.
- [ ] Remarks cannot be edited or deleted by anyone.
- [ ] Remarks longer than 2,000 characters are blocked with a message.

### F12 – Download and print
- [ ] Download produces a PDF of the statement.
- [ ] Print produces a clean page with the statement and, if chosen, the remarks.
- [ ] Each download and print request creates an audit entry.

### F13 – Audit log
- [ ] Every event type listed in FR-13.1 produces an entry with all required fields.
- [ ] An Admin can filter and export the log.
- [ ] No user can edit or delete an entry.

### F14 – Responsive design
- [ ] Every v1 screen is usable on a 375-pixel-wide phone screen without horizontal scrolling.
- [ ] The login, statement list, statement detail and add-remark flows work on iOS Safari and Android Chrome.

### N1–N4 – Home page and header
- [ ] After login, a Clinic User sees only the header and three centered cards.
- [ ] Patient Statement opens the statement list. AR Report and Clinic Collection show "Coming soon" and do nothing when clicked.
- [ ] The user's full name is top-left and the US24 logo is top-right on every page after login.
- [ ] The "New" badge appears on unopened statements and clears once a clinic user opens the statement.

---

## 9. Scope

### 9.1 Included in v1
- A responsive web portal that works on desktop and phone browsers.
- Admin, Specialist and Clinic User roles.
- Login, 2-step verification, password reset and invitations.
- Single PDF upload and bulk Excel/CSV import of statements.
- The clinic statement list, statement detail and remarks log.
- Download and print, the audit log, and HIPAA safeguards.
- A three-card clinic home page (one working card), with the header layout from the brief.

### 9.2 Excluded from v1
- Native iOS and Android apps.
- Working AR Report and Clinic Collection modules.
- Logins for insurance companies or patients.
- SMS-based 2-step verification.
- Email or push notifications for new statements or remarks.
- Attachments on remarks.
- Automatic data feeds from practice-management or billing software.
- Online patient payments.
- One user with access to several clinics (group practices).
- Editing statement data after publishing (corrections are made by withdrawing and re-uploading).
- Analytics dashboards and reporting for clinics.
- Multiple languages.

### 9.3 Possible later additions
1. AR Report module, which activates the existing card.
2. Clinic Collection module, which activates the existing card.
3. Native iOS and Android apps.
4. Email notifications for new statements and remarks, without patient information in the email.
5. File attachments on remarks, such as EOBs and denial letters.
6. Multi-clinic users for group practices.
7. "Remember this device" for 2-step verification on trusted devices.
8. Direct data feeds from billing or practice-management systems.
9. Credentialing status views, which would extend the portal to US24's credentialing service.
10. A view-only role for insurance company contacts.

---

## 10. Success Criteria

These are proposed targets for the first 90 days after launch. US24 should confirm or adjust them.

| Area | Measure | Target |
|---|---|---|
| Adoption | Share of active client clinics with at least one user who has logged in | ≥ 90% |
| Engagement | Share of published statements opened by the clinic within 14 days | ≥ 70% |
| Specialist efficiency | Time to publish a monthly statement batch for one clinic | ≤ 10 minutes |
| Import quality | Share of import rows that pass validation on the first attempt | ≥ 95% |
| Support load | Clinic phone and email requests about statement status, compared with before launch | 50% fewer |
| Collaboration | Clinic remarks answered by a specialist within 2 business days | ≥ 90% |
| Security | Cross-clinic data exposure incidents | 0 |
| Security | Logins completed with 2-step verification | 100% |
| Reliability | Monthly uptime | ≥ 99.5% |

---

## 11. Assumptions, Risks and Open Questions

### 11.1 Assumptions (owner-confirmed defaults, October 21, 2026)
- **A1** There are three roles: Admin, Specialist and Clinic User. Insurance companies do not log in, and specialists record their remarks.
- **A2** Statements arrive as a single PDF per patient or as an Excel/CSV bulk import for one clinic.
- **A3** Each statement has its own remarks log. Remarks cannot be edited or deleted.
- **A4** Clinics can view, download and print, and every action is audited.
- **A5** v1 is a responsive web app, and native apps come later.
- **A6** 2-step verification uses an emailed code, with an authenticator app as an option. SMS is not used.
- **A7** Specialist dashboard contents are as described in FR-5.1.
- **A8** A clinic can have many users, and each user belongs to one clinic. There are about 50 clinics at launch, and data is kept for 7 years.
- **A9** Statements are published immediately after the specialist confirms. There is no separate approval step.
- **A10** Corrections are made by withdrawing a statement and re-uploading it, not by editing it.

### 11.2 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A statement is published to the wrong clinic | HIPAA breach | Clinic confirmation screen (FR-6.3, FR-7.4); specialists see only assigned clinics; withdrawal with audit trail |
| Statement exports vary between clinics or billing systems | Imports fail and specialists lose time | One fixed template, clear row-level errors, early testing with real exports |
| Clinics find 2-step verification on every login tiresome | Low adoption | Authenticator-app option; consider "remember device" in a later release |
| Disabled "Coming soon" cards confuse clinics or create expectations | Support questions | Clear labeling; communicate the roadmap to clients |
| A vendor will not sign a BAA | Launch is blocked | Choose only BAA-ready vendors when picking the stack |
| Emails reveal patient information | HIPAA breach | NFR-3: no patient information in any email |
| Remark volume grows faster than specialists can answer | Clinic dissatisfaction | Unanswered-remarks list on the dashboard; track the response-time metric |

### 11.3 Open questions (to resolve before or during design)
- **Q1** What columns and format does US24's current statement export use? This finalizes Section 6.8 and the import template.
- **Q2** Should clinic users see the specialist's full name on remarks, or only "US24 Solutions"?
- **Q3** Should a specialist ever be able to edit statement data after publishing, or is withdraw-and-replace enough?
- **Q4** Does each clinic need a clinic-side administrator who can add or remove their own staff, or does US24 handle all user changes?
- **Q5** What should the "standard statement layout" for imported rows look like? Is there an existing statement design to match?
- **Q6** What domain and URL will the portal use, for example portal.us24solutions.com?
- **Q7** Are there client contract terms, such as audit requests or data return when a client leaves, that the portal must support?
- **Q8** Is it acceptable that the AR Report and Clinic Collection cards appear before they work, or should they be hidden until they are ready?
