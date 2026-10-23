import pg from 'pg';
import { config } from '../config.js';

// Return DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
pg.types.setTypeParser(1082, (value) => value);

const useSsl =
  config.isProduction ||
  config.databaseUrl?.includes('sslmode=require') ||
  config.databaseUrl?.includes('postgres.database.azure.com') ||
  config.databaseUrl?.includes('supabase.co') ||
  config.databaseUrl?.includes('supabase.com');

const isSupabase =
  config.databaseUrl?.includes('supabase.co') ||
  config.databaseUrl?.includes('supabase.com');

const rejectUnauthorized =
  process.env.DB_SSL_REJECT_UNAUTHORIZED === 'false' || isSupabase ? false : true;

const cleanConnectionString = isSupabase
  ? config.databaseUrl.replace(/[?&]sslmode=[^&]+/, '')
  : config.databaseUrl;

export const pool = new pg.Pool({
  connectionString: cleanConnectionString,
  max: 10,
  ssl: useSsl ? { rejectUnauthorized } : undefined,
});

pool.on('error', (err) => {
  // Log the code only: driver errors can echo query parameters (patient data).
  console.error('[db] idle client error', err.code || err.name);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Runs fn(client) inside a transaction. Audit writes made with the same client commit or roll back together. */
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
