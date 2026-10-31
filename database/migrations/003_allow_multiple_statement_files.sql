-- Allow multiple statement files (e.g. 1st, 2nd, 3rd cycle statements) per statement
ALTER TABLE statement_file DROP CONSTRAINT IF EXISTS statement_file_statement_id_key;
CREATE INDEX IF NOT EXISTS idx_statement_file_statement_id ON statement_file (statement_id);
