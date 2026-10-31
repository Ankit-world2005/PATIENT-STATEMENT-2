import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Auto-load environment variables if not already populated
const envPaths = [
  path.resolve(__dirname, '../backend/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '.env'),
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    try { process.loadEnvFile(p); } catch { /* ignore */ }
    break;
  }
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';
const databaseUrl = env.DATABASE_URL || 'postgresql://mypatient:mypatient_dev_only@localhost:5432/mypatient';

// Return DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
pg.types.setTypeParser(1082, (value) => value);

const useSsl =
  isProduction ||
  databaseUrl?.includes('sslmode=require') ||
  databaseUrl?.includes('postgres.database.azure.com') ||
  databaseUrl?.includes('supabase.co') ||
  databaseUrl?.includes('supabase.com');

const isSupabase =
  databaseUrl?.includes('supabase.co') ||
  databaseUrl?.includes('supabase.com');

const rejectUnauthorized =
  env.DB_SSL_REJECT_UNAUTHORIZED === 'false' || isSupabase ? false : true;

const cleanConnectionString = isSupabase
  ? databaseUrl.replace(/[?&]sslmode=[^&]+/, '')
  : databaseUrl;

export const pool = new pg.Pool({
  connectionString: cleanConnectionString,
  max: 10,
  ssl: useSsl ? { rejectUnauthorized } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] idle client error', err.code || err.name);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Runs fn(client) inside a transaction. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
