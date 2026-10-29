-- Migration 007: Support permanent clinic deletion by admins
-- Allows cascading cleanup of statements, remarks, files, batches, users, assignments, and audit events

CREATE OR REPLACE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_clinic_deletion', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION statement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_clinic_deletion', true) = 'true' THEN
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

CREATE OR REPLACE FUNCTION admin_delete_clinic(p_clinic_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Set session flag so triggers allow cascading delete
  PERFORM set_config('app.allow_clinic_deletion', 'true', true);

  -- 1. Break foreign key references in import_row that point to statements of this clinic
  UPDATE import_row SET duplicate_of_statement_id = NULL 
   WHERE duplicate_of_statement_id IN (SELECT id FROM statement WHERE clinic_id = p_clinic_id);

  -- 2. Delete remarks for statements of this clinic
  DELETE FROM remark WHERE statement_id IN (SELECT id FROM statement WHERE clinic_id = p_clinic_id);

  -- 3. Delete statement_files for statements of this clinic
  DELETE FROM statement_file WHERE statement_id IN (SELECT id FROM statement WHERE clinic_id = p_clinic_id);

  -- 4. Break self-referencing supersedes_id chain on statements before deleting statements
  UPDATE statement SET supersedes_id = NULL WHERE clinic_id = p_clinic_id;

  -- 5. Delete statements
  DELETE FROM statement WHERE clinic_id = p_clinic_id;

  -- 6. Delete import_rows for import_batches of this clinic
  DELETE FROM import_row WHERE batch_id IN (SELECT id FROM import_batch WHERE clinic_id = p_clinic_id);

  -- 7. Delete import_batches
  DELETE FROM import_batch WHERE clinic_id = p_clinic_id;

  -- 8. Delete upload_drafts
  DELETE FROM upload_draft WHERE clinic_id = p_clinic_id;

  -- 9. Delete specialist assignments for this clinic
  DELETE FROM specialist_assignment WHERE clinic_id = p_clinic_id;

  -- 10. Delete sessions for clinic users
  DELETE FROM user_session WHERE user_id IN (SELECT id FROM app_user WHERE clinic_id = p_clinic_id);

  -- 11. Delete audit events where clinic user is actor
  DELETE FROM audit_event WHERE actor_user_id IN (SELECT id FROM app_user WHERE clinic_id = p_clinic_id);

  -- 12. Delete clinic users (app_user where clinic_id = p_clinic_id)
  DELETE FROM app_user WHERE clinic_id = p_clinic_id;

  -- 13. Delete audit events referencing this clinic
  DELETE FROM audit_event WHERE clinic_id = p_clinic_id;

  -- 14. Finally, delete the clinic
  DELETE FROM clinic WHERE id = p_clinic_id;
END;
$$;

