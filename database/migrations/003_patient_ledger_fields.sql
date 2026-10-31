-- Patient Statement Ledger Fields (17-column medical billing layout).
-- Adds columns to statement for multi-cycle tracking, PR type, location, and remark summaries.

ALTER TABLE statement
  ADD COLUMN IF NOT EXISTS location_name varchar(200),
  ADD COLUMN IF NOT EXISTS cycle1_date date,
  ADD COLUMN IF NOT EXISTS cycle1_balance numeric(12, 2),
  ADD COLUMN IF NOT EXISTS cycle1_payment numeric(12, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cycle2_date date,
  ADD COLUMN IF NOT EXISTS cycle2_balance numeric(12, 2),
  ADD COLUMN IF NOT EXISTS cycle2_payment numeric(12, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cycle3_date date,
  ADD COLUMN IF NOT EXISTS cycle3_balance numeric(12, 2),
  ADD COLUMN IF NOT EXISTS cycle3_payment numeric(12, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS current_balance numeric(12, 2),
  ADD COLUMN IF NOT EXISTS pr_type varchar(50) DEFAULT 'Copay',
  ADD COLUMN IF NOT EXISTS ledger_status varchar(50) DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS us24_notes text,
  ADD COLUMN IF NOT EXISTS client_response text,
  ADD COLUMN IF NOT EXISTS vob_notes text;

CREATE INDEX IF NOT EXISTS statement_pr_type_idx ON statement (clinic_id, pr_type);
