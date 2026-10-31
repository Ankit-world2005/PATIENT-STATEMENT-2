-- Migration 010: Support permanent statement deletion by specialists and admins
-- Allows cascading removal of statement records, remarks, statement files, and attachments

CREATE OR REPLACE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_clinic_deletion', true) = 'true'
     OR current_setting('app.allow_user_deletion', true) = 'true'
     OR current_setting('app.allow_statement_deletion', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION statement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_clinic_deletion', true) = 'true'
     OR current_setting('app.allow_user_deletion', true) = 'true'
     OR current_setting('app.allow_statement_deletion', true) = 'true' THEN
    RETURN OLD;
  END IF;

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

CREATE OR REPLACE FUNCTION delete_statement(p_statement_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Set session flag so triggers allow cascading delete
  PERFORM set_config('app.allow_statement_deletion', 'true', true);

  -- 1. Unlink any import_row duplicate reference
  UPDATE import_row SET duplicate_of_statement_id = NULL
   WHERE duplicate_of_statement_id = p_statement_id
      OR duplicate_of_statement_id IN (SELECT id FROM statement WHERE supersedes_id = p_statement_id);

  -- 2. Break supersedes_id self-reference chain
  UPDATE statement SET supersedes_id = NULL
   WHERE supersedes_id = p_statement_id OR id = p_statement_id;

  -- 3. Delete attachments
  DELETE FROM attachment
   WHERE statement_id = p_statement_id
      OR statement_id IN (SELECT id FROM statement WHERE supersedes_id = p_statement_id);

  -- 4. Delete remarks
  DELETE FROM remark
   WHERE statement_id = p_statement_id
      OR statement_id IN (SELECT id FROM statement WHERE supersedes_id = p_statement_id);

  -- 5. Delete statement files
  DELETE FROM statement_file
   WHERE statement_id = p_statement_id
      OR statement_id IN (SELECT id FROM statement WHERE supersedes_id = p_statement_id);

  -- 6. Delete child statement versions (if any)
  DELETE FROM statement WHERE supersedes_id = p_statement_id;

  -- 7. Delete the target statement itself
  DELETE FROM statement WHERE id = p_statement_id;
END;
$$;
