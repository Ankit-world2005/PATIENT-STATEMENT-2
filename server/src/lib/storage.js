import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

// Private file storage. Keys are random and never contain file names or patient
// data (schema 9.2). This local-disk driver is for development; production
// swaps in an encrypted, private S3 bucket behind the same four functions.

import { pool } from '../db/pool.js';

const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(pdf|csv|xlsx)$/;

function resolveKey(key) {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
  return path.join(config.storageDir, ...key.split('/'));
}

export const storage = {
  async put(key, buffer) {
    const sha = sha256Hex(buffer);
    // 1. Persist to PostgreSQL database (essential for serverless environments like Vercel)
    try {
      if (pool) {
        await pool.query(
          `INSERT INTO storage_object (key, data, size_bytes, sha256)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256`,
          [key, buffer, buffer.length, sha],
        );
      }
    } catch (dbErr) {
      console.warn('[storage] DB put warning for key', key, dbErr.message);
    }

    // 2. Also write to local disk cache if available
    try {
      const file = resolveKey(key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, buffer);
    } catch (fsErr) {
      // Local disk failure is non-fatal in serverless environments
      if (!pool) throw fsErr;
    }
  },

  async get(key) {
    // 1. Try local disk cache first (fastest)
    try {
      return await readFile(resolveKey(key));
    } catch (fsErr) {
      if (fsErr.code !== 'ENOENT') throw fsErr;
    }

    // 2. Query persistent PostgreSQL database storage
    try {
      if (pool) {
        const { rows } = await pool.query('SELECT data FROM storage_object WHERE key = $1', [key]);
        if (rows[0]?.data) {
          const buffer = Buffer.isBuffer(rows[0].data) ? rows[0].data : Buffer.from(rows[0].data);
          // Cache locally for subsequent requests in the same container
          try {
            const file = resolveKey(key);
            await mkdir(path.dirname(file), { recursive: true });
            await writeFile(file, buffer);
          } catch {
            // Ignore cache write errors
          }
          return buffer;
        }
      }
    } catch (dbErr) {
      console.warn('[storage] DB get warning for key', key, dbErr.message);
    }

    const notFound = new Error(`File not found: ${key}`);
    notFound.code = 'ENOENT';
    throw notFound;
  },

  async copy(fromKey, toKey) {
    try {
      if (pool) {
        await pool.query(
          `INSERT INTO storage_object (key, data, size_bytes, sha256)
           SELECT $2, data, size_bytes, sha256 FROM storage_object WHERE key = $1
           ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256`,
          [fromKey, toKey],
        );
      }
    } catch (dbErr) {
      console.warn('[storage] DB copy warning', dbErr.message);
    }

    try {
      const to = resolveKey(toKey);
      await mkdir(path.dirname(to), { recursive: true });
      await copyFile(resolveKey(fromKey), to);
    } catch {
      // Ignore if local copy fails but DB copy succeeded
    }
  },

  async remove(key) {
    try {
      if (pool) {
        await pool.query('DELETE FROM storage_object WHERE key = $1', [key]);
      }
    } catch (dbErr) {
      console.warn('[storage] DB remove warning', dbErr.message);
    }

    try {
      await rm(resolveKey(key), { force: true });
    } catch {
      // Ignore local removal error
    }
  },
};

export function statementFileKey() {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `statements/${now.getUTCFullYear()}/${mm}/${crypto.randomUUID()}.pdf`;
}

export const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
