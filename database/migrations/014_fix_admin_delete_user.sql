-- Migration 014: Fix admin_delete_user and reject_change trigger for user deletion
-- 1. reject_change must return NEW on UPDATE so that reassigning remarks/statements/batches/attachments succeeds.
-- 2. admin_delete_user must safely reassign attachment.uploader_id and clinic_collection.uploaded_by_id to fallback admin.

CREATE OR REPLACE FUNCTION public.reject_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF current_setting('app.allow_clinic_deletion', true) = 'true'
     OR current_setting('app.allow_user_deletion', true) = 'true'
     OR current_setting('app.allow_statement_deletion', true) = 'true' THEN
    IF TG_OP = 'UPDATE' THEN
      RETURN NEW;
    ELSE
      RETURN OLD;
    END IF;
  END IF;
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid, p_fallback_admin_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
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

  -- 6. Safely reassign statement, batch, remark, and attachment metadata
  UPDATE statement SET withdrawn_by_id = NULL WHERE withdrawn_by_id = p_user_id;
  IF p_fallback_admin_id IS NOT NULL THEN
    UPDATE statement SET uploaded_by_id = p_fallback_admin_id WHERE uploaded_by_id = p_user_id;
    UPDATE import_batch SET specialist_id = p_fallback_admin_id WHERE specialist_id = p_user_id;
    UPDATE remark SET author_id = p_fallback_admin_id WHERE author_id = p_user_id;
    UPDATE attachment SET uploader_id = p_fallback_admin_id WHERE uploader_id = p_user_id;
    UPDATE clinic_collection SET uploaded_by_id = p_fallback_admin_id WHERE uploaded_by_id = p_user_id;
  END IF;

  -- 7. Delete audit events where this user was the actor
  DELETE FROM audit_event WHERE actor_user_id = p_user_id;

  -- 8. Finally delete the user
  DELETE FROM app_user WHERE id = p_user_id;
END;
$function$;
