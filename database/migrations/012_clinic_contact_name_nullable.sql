-- Make contact_name nullable with empty default on clinic table
ALTER TABLE clinic ALTER COLUMN contact_name DROP NOT NULL;
ALTER TABLE clinic ALTER COLUMN contact_name SET DEFAULT '';

