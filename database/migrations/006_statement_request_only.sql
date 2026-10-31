-- Separate requests from patient statement billing ledger
ALTER TABLE statement ADD COLUMN IF NOT EXISTS is_request_only boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS statement_is_request_only_idx ON statement (clinic_id, is_request_only);

-- Mark existing placeholder request records so they do not show in statement ledger
UPDATE statement 
   SET is_request_only = true 
 WHERE balance_due = 0 
   AND source = 'pdf_upload' 
   AND import_batch_id IS NULL 
   AND NOT EXISTS (SELECT 1 FROM statement_file sf WHERE sf.statement_id = statement.id);
