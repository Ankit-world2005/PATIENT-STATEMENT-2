-- Migration 009: Add attachments support to remarks and requests
-- Supports photos, PDFs, Excel files, and docs

ALTER TABLE remark ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS attachment (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename     varchar(255) NOT NULL,
  content_type varchar(128) NOT NULL,
  size_bytes   integer NOT NULL,
  storage_key  text NOT NULL,
  uploader_id  uuid NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  statement_id uuid REFERENCES statement (id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachment_uploader ON attachment (uploader_id);
CREATE INDEX IF NOT EXISTS idx_attachment_statement ON attachment (statement_id);
