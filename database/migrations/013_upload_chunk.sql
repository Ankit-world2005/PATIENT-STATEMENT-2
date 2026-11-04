-- Ephemeral chunked uploads table for multi-part file uploads (bypassing serverless payload limits)
CREATE TABLE IF NOT EXISTS upload_chunk (
  upload_id     text NOT NULL,
  chunk_index   integer NOT NULL,
  total_chunks  integer NOT NULL,
  data          bytea NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_upload_chunk_upload_id ON upload_chunk (upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_chunk_created_at ON upload_chunk (created_at);
