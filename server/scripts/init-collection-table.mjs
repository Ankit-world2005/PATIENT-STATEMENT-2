import { query } from '../src/db/pool.js';

async function init() {
  await query(`
    CREATE TABLE IF NOT EXISTS clinic_collection (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      clinic_id UUID NOT NULL REFERENCES clinic(id) ON DELETE CASCADE,
      report_title TEXT NOT NULL,
      month_year TEXT,
      summary JSONB NOT NULL DEFAULT '{}'::jsonb,
      check_sheet JSONB NOT NULL DEFAULT '[]'::jsonb,
      line_items JSONB NOT NULL DEFAULT '[]'::jsonb,
      raw_file_name TEXT,
      uploaded_by_id UUID REFERENCES app_user(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_clinic_collection_clinic ON clinic_collection(clinic_id);
    CREATE INDEX IF NOT EXISTS idx_clinic_collection_created ON clinic_collection(created_at DESC);
  `);
  console.log('clinic_collection table created successfully!');
  process.exit(0);
}

init().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

