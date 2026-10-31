import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

export async function migrate({ reset = false } = {}) {
  const client = await pool.connect();
  try {
    if (reset) {
      if (process.env.NODE_ENV === 'production') throw new Error('Refusing to reset the database in production.');
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('[migrate] schema reset');
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));

    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`[migrate] applying ${file}...`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        count++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[migrate] FAILED on ${file}:`, err.message);
        throw err;
      }
    }
    console.log(`[migrate] up to date (${count} new applied)`);
  } finally {
    client.release();
  }
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntry) {
  const reset = process.argv.includes('--reset');
  migrate({ reset })
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
