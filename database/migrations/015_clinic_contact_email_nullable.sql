-- Migration 015: Make contact_email nullable with empty default on clinic table
ALTER TABLE clinic ALTER COLUMN contact_email DROP NOT NULL;
ALTER TABLE clinic ALTER COLUMN contact_email SET DEFAULT '';
