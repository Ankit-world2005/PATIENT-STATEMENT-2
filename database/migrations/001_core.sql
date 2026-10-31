-- My Patient core schema. Mirrors DOCS/05-backend-schema.md sections 5.1-5.12.
-- Library-managed tables from the Django design (django-otp, django-axes) are
-- replaced by columns on app_user / user_session and the login_attempt table.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- 5.1 clinic -----------------------------------------------------------------
CREATE TABLE clinic (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              varchar(200) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 200),
  clinic_code       citext NOT NULL UNIQUE CHECK (clinic_code ~ '^[A-Za-z0-9_-]{1,32}$'),
  address_line1     varchar(200) NOT NULL,
  address_line2     varchar(200),
  city              varchar(100) NOT NULL,
  state             char(2) NOT NULL CHECK (state ~ '^[A-Z]{2}$'),
  postal_code       varchar(10) NOT NULL CHECK (postal_code ~ '^\d{5}(-\d{4})?$'),
  contact_name      varchar(200) NOT NULL,
  contact_phone     varchar(32) NOT NULL,
  contact_email     citext NOT NULL CHECK (char_length(contact_email) <= 254),
  is_active         boolean NOT NULL DEFAULT true,
  deactivated_at    timestamptz,
  deactivated_by_id uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  created_by_id     uuid,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (is_active = (deactivated_at IS NULL))
);
CREATE INDEX clinic_active_name_idx ON clinic (is_active, lower(name));
CREATE INDEX clinic_name_trgm_idx ON clinic USING gin (lower(name) gin_trgm_ops);

-- 5.2 app_user ---------------------------------------------------------------
CREATE TABLE app_user (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email               citext NOT NULL UNIQUE CHECK (char_length(email) <= 254),
  full_name           varchar(200) NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 1 AND 200),
  role                varchar(16) NOT NULL CHECK (role IN ('admin', 'specialist', 'clinic_user')),
  clinic_id           uuid REFERENCES clinic (id) ON DELETE RESTRICT,
  status              varchar(16) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'deactivated')),
  password_hash       text,
  password_changed_at timestamptz,
  -- Authenticator app secret, AES-256-GCM encrypted by the app (schema Q-6).
  totp_secret_enc     text,
  totp_confirmed_at   timestamptz,
  last_login          timestamptz,
  invited_at          timestamptz NOT NULL DEFAULT now(),
  invited_by_id       uuid REFERENCES app_user (id) ON DELETE RESTRICT,
  activated_at        timestamptz,
  deactivated_at      timestamptz,
  deactivated_by_id   uuid REFERENCES app_user (id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'clinic_user') = (clinic_id IS NOT NULL)),
  CHECK ((status = 'deactivated') = (deactivated_at IS NOT NULL)),
  CHECK (status <> 'active' OR password_hash IS NOT NULL),
  CHECK ((totp_confirmed_at IS NULL) OR (totp_secret_enc IS NOT NULL))
);
CREATE INDEX app_user_clinic_status_idx ON app_user (clinic_id, status);
CREATE INDEX app_user_role_status_idx ON app_user (role, status);
CREATE INDEX app_user_name_trgm_idx ON app_user USING gin (lower(full_name) gin_trgm_ops);

ALTER TABLE clinic
  ADD CONSTRAINT clinic_created_by_fk FOREIGN KEY (created_by_id) REFERENCES app_user (id) ON DELETE RESTRICT,
  ADD CONSTRAINT clinic_deactivated_by_fk FOREIGN KEY (deactivated_by_id) REFERENCES app_user (id) ON DELETE RESTRICT;

-- 5.3 specialist_assignment --------------------------------------------------
CREATE TABLE specialist_assignment (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  specialist_id  uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  clinic_id      uuid NOT NULL REFERENCES clinic (id) ON DELETE RESTRICT,
  assigned_at    timestamptz NOT NULL DEFAULT now(),
  assigned_by_id uuid REFERENCES app_user (id) ON DELETE RESTRICT,
  UNIQUE (specialist_id, clinic_id)
);
CREATE INDEX specialist_assignment_clinic_idx ON specialist_assignment (clinic_id);

-- 5.4 user_session -----------------------------------------------------------
-- The cookie holds a random token; only its SHA-256 hash is stored here.
-- stage = 'password' until the 2-step code is verified (FR-1.4).
CREATE TABLE user_session (
  id_hash          char(64) PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  stage            varchar(16) NOT NULL CHECK (stage IN ('password', 'verified')),
  otp_hash         char(64),
  otp_expires_at   timestamptz,
  otp_sent_at      timestamptz,
  otp_failures     integer NOT NULL DEFAULT 0,
  totp_pending_enc text,
  ip_address       inet,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL
);
CREATE INDEX user_session_user_idx ON user_session (user_id);
CREATE INDEX user_session_expires_idx ON user_session (expires_at);

-- Lockout counter keyed by the typed email, so unknown emails lock exactly like
-- real ones and nothing reveals whether an account exists (FR-1.5, I-03).
CREATE TABLE login_attempt (
  email             citext PRIMARY KEY,
  failure_count     integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until      timestamptz
);

-- 5.9 import_batch (before statement, which references it) -------------------
CREATE TABLE import_batch (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                uuid NOT NULL REFERENCES clinic (id) ON DELETE RESTRICT,
  specialist_id            uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  original_filename        varchar(255) NOT NULL,
  file_format              varchar(8) NOT NULL CHECK (file_format IN ('xlsx', 'csv')),
  size_bytes               integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256                   char(64) NOT NULL,
  source_storage_key       varchar(255) NOT NULL,
  status                   varchar(24) NOT NULL CHECK (status IN ('failed', 'previewed', 'published', 'partially_imported', 'cancelled')),
  failure_reason           varchar(500),
  total_rows               integer CHECK (total_rows <= 5000),
  valid_rows               integer,
  invalid_rows             integer,
  duplicate_rows           integer,
  published_rows           integer,
  published_new_versions   integer,
  skipped_duplicates       integer,
  error_report_storage_key varchar(255),
  created_at               timestamptz NOT NULL DEFAULT now(),
  checked_at               timestamptz,
  published_at             timestamptz,
  cancelled_at             timestamptz,
  preview_expires_at       timestamptz,
  CHECK ((status = 'failed') = (failure_reason IS NOT NULL)),
  CHECK ((published_at IS NOT NULL) = (status IN ('published', 'partially_imported')))
);
CREATE INDEX import_batch_specialist_idx ON import_batch (specialist_id, created_at DESC);
CREATE INDEX import_batch_clinic_idx ON import_batch (clinic_id, created_at DESC);
CREATE INDEX import_batch_expiry_idx ON import_batch (status, preview_expires_at);

-- 5.6 statement --------------------------------------------------------------
CREATE TABLE statement (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                 uuid NOT NULL REFERENCES clinic (id) ON DELETE RESTRICT,
  patient_name              varchar(200) NOT NULL CHECK (char_length(btrim(patient_name)) BETWEEN 1 AND 200),
  account_number            varchar(64) NOT NULL CHECK (char_length(btrim(account_number)) BETWEEN 1 AND 64),
  statement_date            date NOT NULL,
  balance_due               numeric(12, 2) NOT NULL,
  patient_dob               date,
  service_date_from         date,
  service_date_to           date,
  cpt_codes                 varchar(10)[],
  billed_amount             numeric(12, 2) CHECK (billed_amount >= 0),
  insurance_paid            numeric(12, 2) CHECK (insurance_paid >= 0),
  adjustments               numeric(12, 2),
  insurance_name            varchar(200),
  source                    varchar(16) NOT NULL CHECK (source IN ('pdf_upload', 'import')),
  import_batch_id           uuid REFERENCES import_batch (id) ON DELETE RESTRICT,
  import_row_number         integer,
  version                   integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  supersedes_id             uuid UNIQUE REFERENCES statement (id) ON DELETE RESTRICT,
  status                    varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn')),
  withdrawn_at              timestamptz,
  withdrawn_by_id           uuid REFERENCES app_user (id) ON DELETE RESTRICT,
  withdrawal_reason         varchar(1000),
  uploaded_by_id            uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  uploaded_at               timestamptz NOT NULL DEFAULT now(),
  first_opened_by_clinic_at timestamptz,
  last_remark_at            timestamptz,
  awaiting_reply_since      timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CHECK ((source = 'import') = (import_batch_id IS NOT NULL)),
  CHECK ((import_batch_id IS NULL) = (import_row_number IS NULL)),
  CHECK ((version = 1) = (supersedes_id IS NULL)),
  CHECK ((service_date_from IS NULL AND service_date_to IS NULL)
         OR (service_date_from IS NOT NULL AND service_date_to IS NOT NULL AND service_date_from <= service_date_to)),
  CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawn_by_id IS NOT NULL AND withdrawal_reason IS NOT NULL)),
  CHECK (withdrawal_reason IS NULL OR char_length(btrim(withdrawal_reason)) BETWEEN 1 AND 1000)
);
CREATE INDEX statement_list_idx ON statement (clinic_id, status, statement_date DESC, id);
CREATE INDEX statement_name_sort_idx ON statement (clinic_id, status, lower(patient_name));
CREATE INDEX statement_balance_sort_idx ON statement (clinic_id, status, balance_due);
CREATE INDEX statement_name_trgm_idx ON statement USING gin (lower(patient_name) gin_trgm_ops);
CREATE INDEX statement_account_trgm_idx ON statement USING gin (lower(account_number) gin_trgm_ops);
CREATE INDEX statement_dup_idx ON statement (clinic_id, account_number, statement_date);
CREATE INDEX statement_new_idx ON statement (clinic_id) WHERE status = 'active' AND first_opened_by_clinic_at IS NULL;
CREATE INDEX statement_unanswered_idx ON statement (clinic_id, awaiting_reply_since) WHERE awaiting_reply_since IS NOT NULL;
CREATE INDEX statement_recent_upload_idx ON statement (uploaded_by_id, uploaded_at DESC) WHERE source = 'pdf_upload';
CREATE INDEX statement_batch_idx ON statement (import_batch_id);

-- 5.7 statement_file ---------------------------------------------------------
CREATE TABLE statement_file (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id      uuid NOT NULL UNIQUE REFERENCES statement (id) ON DELETE RESTRICT,
  storage_key       varchar(255) NOT NULL UNIQUE,
  original_filename varchar(255) NOT NULL,
  content_type      varchar(32) NOT NULL DEFAULT 'application/pdf' CHECK (content_type = 'application/pdf'),
  size_bytes        integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256            char(64) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- 5.8 upload_draft -----------------------------------------------------------
CREATE TABLE upload_draft (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  specialist_id     uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  clinic_id         uuid NOT NULL REFERENCES clinic (id) ON DELETE RESTRICT,
  payload           jsonb NOT NULL,
  storage_key       varchar(255) NOT NULL,
  original_filename varchar(255) NOT NULL,
  size_bytes        integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 10485760),
  sha256            char(64) NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL DEFAULT now() + interval '24 hours'
);
CREATE INDEX upload_draft_specialist_idx ON upload_draft (specialist_id, created_at);
CREATE INDEX upload_draft_expires_idx ON upload_draft (expires_at);

-- 5.10 import_row ------------------------------------------------------------
CREATE TABLE import_row (
  id                        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id                  uuid NOT NULL REFERENCES import_batch (id) ON DELETE CASCADE,
  row_number                integer NOT NULL,
  outcome                   varchar(16) NOT NULL CHECK (outcome IN ('valid', 'invalid', 'duplicate')),
  data                      jsonb NOT NULL,
  errors                    jsonb,
  duplicate_of_statement_id uuid REFERENCES statement (id) ON DELETE RESTRICT,
  duplicate_decision        varchar(16) CHECK (duplicate_decision IN ('skip', 'new_version')),
  UNIQUE (batch_id, row_number),
  CHECK ((outcome = 'invalid') = (errors IS NOT NULL)),
  CHECK ((outcome = 'duplicate') = (duplicate_of_statement_id IS NOT NULL)),
  CHECK (duplicate_decision IS NULL OR outcome = 'duplicate')
);
CREATE INDEX import_row_outcome_idx ON import_row (batch_id, outcome);

-- 5.11 remark ----------------------------------------------------------------
CREATE TABLE remark (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  statement_id        uuid NOT NULL REFERENCES statement (id) ON DELETE RESTRICT,
  author_id           uuid NOT NULL REFERENCES app_user (id) ON DELETE RESTRICT,
  author_role         varchar(16) NOT NULL CHECK (author_role IN ('clinic_user', 'specialist')),
  type                varchar(16) NOT NULL CHECK (type IN ('clinic', 'specialist', 'insurance')),
  body                text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000 AND btrim(body) <> ''),
  insurance_name      varchar(200),
  insurance_reference varchar(100),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((type = 'insurance') = (insurance_name IS NOT NULL)),
  CHECK (insurance_reference IS NULL OR type = 'insurance'),
  CHECK ((type = 'clinic' AND author_role = 'clinic_user')
         OR (type IN ('specialist', 'insurance') AND author_role = 'specialist'))
);
CREATE INDEX remark_statement_idx ON remark (statement_id, created_at, id);

-- 5.12 audit_event -----------------------------------------------------------
CREATE TABLE audit_event (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor_user_id   uuid REFERENCES app_user (id) ON DELETE RESTRICT,
  actor_role      varchar(16),
  attempted_email citext CHECK (attempted_email IS NULL OR char_length(attempted_email) <= 254),
  clinic_id       uuid REFERENCES clinic (id) ON DELETE RESTRICT,
  action          varchar(48) NOT NULL CHECK (action IN (
    'auth.login.success', 'auth.login.failure', 'auth.lockout', 'auth.logout', 'auth.session_timeout',
    'auth.otp.sent', 'auth.otp.success', 'auth.otp.failure', 'auth.otp.too_many', 'auth.totp.enrolled',
    'auth.password.reset_requested', 'auth.password.reset_completed', 'auth.invitation.accepted',
    'statement.view', 'statement.upload', 'statement.download', 'statement.print', 'statement.withdraw',
    'import.check', 'import.publish', 'import.cancel', 'import.error_report.download',
    'remark.create',
    'user.invite', 'user.invite.resend', 'user.update', 'user.deactivate', 'user.reactivate', 'user.otp_reset',
    'clinic.create', 'clinic.update', 'clinic.deactivate', 'clinic.reactivate',
    'assignment.create', 'assignment.delete',
    'access.blocked', 'audit.export'
  )),
  target_type     varchar(24) CHECK (target_type IN (
    'statement', 'statement_file', 'import_batch', 'remark', 'app_user', 'clinic',
    'specialist_assignment', 'audit_event', 'upload_draft', 'url'
  )),
  target_id       varchar(64),
  outcome         varchar(16) NOT NULL DEFAULT 'success' CHECK (outcome IN ('success', 'failure', 'blocked')),
  ip_address      inet,
  details         jsonb
);
CREATE INDEX audit_occurred_idx ON audit_event (occurred_at DESC);
CREATE INDEX audit_actor_idx ON audit_event (actor_user_id, occurred_at DESC);
CREATE INDEX audit_clinic_idx ON audit_event (clinic_id, occurred_at DESC);
CREATE INDEX audit_action_idx ON audit_event (action, occurred_at DESC);
CREATE INDEX audit_target_idx ON audit_event (target_type, target_id);
