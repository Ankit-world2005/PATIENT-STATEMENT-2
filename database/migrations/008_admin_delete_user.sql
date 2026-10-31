-- Migration 008: Support permanent user deletion by admins
-- Cascades sessions, assignments, drafts, and safely reassigns statement/batch/remark author metadata

CREATE OR REPLACE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_clinic_deletion', true) = 'true'
     OR current_setting('app.allow_user_deletion', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION statement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.allow_clinic_deletion', true) = 'true'
     OR current_setting('app.allow_user_deletion', true) = 'true' THEN
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

CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid, p_fallback_admin_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  -- Set session flag so triggers allow cascading delete
  PERFORM set_config('app.allow_user_deletion', 'true', true);

  -- 1. Clear self-references and invited/deactivated fields
  UPDATE app_user SET invited_by_id = NULL WHERE invited_by_id = p_user_id;
  UPDATE app_user SET deactivated_by_id = NULL WHERE deactivated_by_id = p_user_id;

  -- 2. Clear clinic created_by and deactivated_by references
  UPDATE clinic SET created_by_id = NULL WHERE created_by_id = p_user_id;
  UPDATE clinic SET deactivated_by_id = NULL WHERE deactivated_by_id = p_user_id;

  -- 3. Delete specialist assignments for this user
  DELETE FROM specialist_assignment WHERE specialist_id = p_user_id;
  UPDATE specialist_assignment SET assigned_by_id = NULL WHERE assigned_by_id = p_user_id;

  -- 4. Delete sessions
  DELETE FROM user_session WHERE user_id = p_user_id;

  -- 5. Delete upload drafts
  DELETE FROM upload_draft WHERE specialist_id = p_user_id;

  -- 6. Safely reassign statement metadata
  UPDATE statement SET withdrawn_by_id = NULL WHERE withdrawn_by_id = p_user_id;
  IF p_fallback_admin_id IS NOT NULL THEN
    UPDATE statement SET uploaded_by_id = p_fallback_admin_id WHERE uploaded_by_id = p_user_id;
    UPDATE import_batch SET specialist_id = p_fallback_admin_id WHERE specialist_id = p_user_id;
    UPDATE remark SET author_id = p_fallback_admin_id WHERE author_id = p_user_id;
  END IF;

  -- 7. Delete audit events where this user was the actor
  DELETE FROM audit_event WHERE actor_user_id = p_user_id;

  -- 8. Finally delete the user
  DELETE FROM app_user WHERE id = p_user_id;
END;
$$;
