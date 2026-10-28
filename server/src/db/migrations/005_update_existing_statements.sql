-- Migration 005: Allow updating existing active patient statements and update duplicate_decision constraint

-- 1. Relax duplicate_decision check constraint on import_row to allow 'update'
ALTER TABLE import_row DROP CONSTRAINT IF EXISTS import_row_duplicate_decision_check;
ALTER TABLE import_row ADD CONSTRAINT import_row_duplicate_decision_check
  CHECK (duplicate_decision IN ('skip', 'new_version', 'update'));

-- 2. Update statement_immutable() trigger function:
-- Statements cannot be deleted; withdrawal must be used.
-- Primary key (id) and clinic_id cannot be changed.
-- A withdrawn statement cannot be reactivated.
-- Updating active statements in-place (ledger balances, cycle dates, notes, statement date, etc.) is allowed.
CREATE OR REPLACE FUNCTION statement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Statements cannot be deleted; withdraw instead' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.id <> NEW.id OR OLD.clinic_id <> NEW.clinic_id THEN
    RAISE EXCEPTION 'Statement id and clinic cannot be changed' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN
    RAISE EXCEPTION 'A withdrawn statement cannot be reactivated' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;
