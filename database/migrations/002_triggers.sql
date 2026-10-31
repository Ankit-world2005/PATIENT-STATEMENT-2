-- Defence-in-depth rules enforced by the database itself (schema 7.3, 11.2 "0008_triggers").
-- They apply to every role, so a mistaken manual statement fails too.

-- Audit events are insert-only (FR-13.4).
CREATE FUNCTION reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% on % is not allowed', TG_OP, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION reject_change();
CREATE TRIGGER trg_audit_no_truncate
  BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION reject_change();

-- Remarks are insert-only (FR-11.6) and cannot be added to withdrawn statements (I-09).
CREATE TRIGGER trg_remark_immutable
  BEFORE UPDATE OR DELETE ON remark
  FOR EACH ROW EXECUTE FUNCTION reject_change();

CREATE FUNCTION remark_statement_active() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT status FROM statement WHERE id = NEW.statement_id) <> 'active' THEN
    RAISE EXCEPTION 'Remarks cannot be added to a withdrawn statement' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_remark_statement_active
  BEFORE INSERT ON remark
  FOR EACH ROW EXECUTE FUNCTION remark_statement_active();

-- Statement files are insert-only.
CREATE TRIGGER trg_statement_file_immutable
  BEFORE UPDATE OR DELETE ON statement_file
  FOR EACH ROW EXECUTE FUNCTION reject_change();

-- Statement data cannot be edited after publishing (PRD A10). Only status,
-- withdrawal fields and the derived flags may change. DELETE is refused.
CREATE FUNCTION statement_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Statements cannot be deleted; withdraw instead' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (OLD.id, OLD.clinic_id, OLD.patient_name, OLD.account_number, OLD.statement_date, OLD.balance_due,
      OLD.patient_dob, OLD.service_date_from, OLD.service_date_to, OLD.cpt_codes, OLD.billed_amount,
      OLD.insurance_paid, OLD.adjustments, OLD.insurance_name, OLD.source, OLD.import_batch_id,
      OLD.import_row_number, OLD.version, OLD.supersedes_id, OLD.uploaded_by_id, OLD.uploaded_at, OLD.created_at)
     IS DISTINCT FROM
     (NEW.id, NEW.clinic_id, NEW.patient_name, NEW.account_number, NEW.statement_date, NEW.balance_due,
      NEW.patient_dob, NEW.service_date_from, NEW.service_date_to, NEW.cpt_codes, NEW.billed_amount,
      NEW.insurance_paid, NEW.adjustments, NEW.insurance_name, NEW.source, NEW.import_batch_id,
      NEW.import_row_number, NEW.version, NEW.supersedes_id, NEW.uploaded_by_id, NEW.uploaded_at, NEW.created_at)
  THEN
    RAISE EXCEPTION 'Statement data cannot be edited after publishing' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'withdrawn' AND NEW.status <> 'withdrawn' THEN
    RAISE EXCEPTION 'A withdrawn statement cannot be reactivated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_statement_immutable
  BEFORE UPDATE OR DELETE ON statement
  FOR EACH ROW EXECUTE FUNCTION statement_immutable();

-- Only specialists can be assigned to clinics (FR-2.3).
CREATE FUNCTION assignment_role_check() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (SELECT role FROM app_user WHERE id = NEW.specialist_id) IS DISTINCT FROM 'specialist' THEN
    RAISE EXCEPTION 'Only specialists can be assigned to clinics' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_assignment_role_check
  BEFORE INSERT OR UPDATE ON specialist_assignment
  FOR EACH ROW EXECUTE FUNCTION assignment_role_check();
