import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { pool } from '../db/pool.js';

// Private file storage. Keys are random and never contain file names or patient
// data (schema 9.2).
//
// The storage_object table is the durable copy: serverless instances (Vercel)
// each have their own temporary disk, so a file written only to disk would be
// lost. The local disk is just a per-instance cache, and keys it can't hold
// (unexpected extensions, path segments like "..") simply skip the cache.

const KEY_PATTERN = /^[a-z0-9_-]+(\/[a-z0-9_.-]+)*\.(pdf|csv|xlsx|xls|png|jpg|jpeg|gif|webp|doc|docx|txt|bin|zip)$/i;

/** Local cache path for a key, or null when the key must not touch the disk. */
function cachePath(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) return null;
  const segments = key.split('/');
  if (segments.some((s) => s === '.' || s === '..')) return null;
  return path.join(config.storageDir, ...segments);
}

async function writeCache(key, buffer) {
  const file = cachePath(key);
  if (!file) return;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer);
  } catch {
    // The cache is optional; the database copy is authoritative.
  }
}

function notFoundError(key) {
  const err = new Error(`File not found: ${key}`);
  err.code = 'ENOENT';
  return err;
}

export const storage = {
  /** Saves a file. Throws if the durable copy can't be written, so callers never record a file that doesn't exist. */
  async put(key, buffer) {
    await pool.query(
      `INSERT INTO storage_object (key, data, size_bytes, sha256)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256`,
      [key, buffer, buffer.length, sha256Hex(buffer)],
    );
    await writeCache(key, buffer);
  },

  /** Returns the file's bytes. Throws an error with code 'ENOENT' when the file doesn't exist. */
  async get(key) {
    const file = cachePath(key);
    if (file) {
      try {
        return await readFile(file);
      } catch {
        // Not cached on this instance; fall through to the database.
      }
    }
    const { rows } = await pool.query('SELECT data FROM storage_object WHERE key = $1', [key]);
    if (!rows[0]?.data) throw notFoundError(key);
    const buffer = Buffer.isBuffer(rows[0].data) ? rows[0].data : Buffer.from(rows[0].data);
    await writeCache(key, buffer);
    return buffer;
  },

  /** Copies a file to a new key. Throws if the source doesn't exist. */
  async copy(fromKey, toKey) {
    const { rowCount } = await pool.query(
      `INSERT INTO storage_object (key, data, size_bytes, sha256)
       SELECT $2, data, size_bytes, sha256 FROM storage_object WHERE key = $1
       ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, size_bytes = EXCLUDED.size_bytes, sha256 = EXCLUDED.sha256`,
      [fromKey, toKey],
    );
    // Older files may exist only in a local cache; get() finds them there or throws.
    if (!rowCount) await storage.put(toKey, await storage.get(fromKey));
  },

  async remove(key) {
    await pool.query('DELETE FROM storage_object WHERE key = $1', [key]);
    const file = cachePath(key);
    if (file) await rm(file, { force: true }).catch(() => {});
  },
};

export function statementFileKey() {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `statements/${now.getUTCFullYear()}/${mm}/${crypto.randomUUID()}.pdf`;
}

export const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
