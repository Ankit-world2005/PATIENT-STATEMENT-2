import { pool } from '../db/pool.js';
import { storage } from '../lib/storage.js';

// Removes short-lived records that hold patient data (schema 10.2). Runs
// opportunistically at sign-in and at the start of each upload or import
// (implementation plan C-1); a nightly scheduled run can call the same function.

let lastRun = 0;

export async function runCleanup({ force = false } = {}) {
  if (!force && Date.now() - lastRun < 60_000) return;
  lastRun = Date.now();
  try {
    await pool.query('DELETE FROM user_session WHERE expires_at < now() - interval \'1 day\'');
    await pool.query(`DELETE FROM login_attempt
                       WHERE (locked_until IS NULL OR locked_until < now())
                         AND window_started_at < now() - interval '1 day'`);

    // Expired import previews become cancelled; their staged rows are removed.
    await pool.query(`
      WITH expired AS (
        UPDATE import_batch SET status = 'cancelled', cancelled_at = now()
         WHERE status = 'previewed' AND preview_expires_at < now()
        RETURNING id)
      DELETE FROM import_row WHERE batch_id IN (SELECT id FROM expired)`);

    const { rows } = await pool.query('DELETE FROM upload_draft WHERE expires_at < now() RETURNING storage_key');
    await Promise.all(rows.map((r) => storage.remove(r.storage_key).catch(() => {})));
  } catch (err) {
    console.error('[cleanup] failed', err.code || err.name);
  }
}
