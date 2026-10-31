ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS is_clinic_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN app_user.is_clinic_admin IS 'When true for a clinic_user, grants clinic administrative privileges such as accessing clinic collection reports.';

