-- Storage objects table for persistent binary file storage across serverless instances
CREATE TABLE IF NOT EXISTS storage_object (
  key         varchar(255) PRIMARY KEY,
  data        bytea NOT NULL,
  size_bytes  integer NOT NULL,
  sha256      char(64) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storage_object_created_at ON storage_object (created_at);
