import { mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

// Private file storage. Keys are random and never contain file names or patient
// data (schema 9.2). This local-disk driver is for development; production
// swaps in an encrypted, private S3 bucket behind the same four functions.

const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(pdf|csv|xlsx)$/;

function resolveKey(key) {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
  return path.join(config.storageDir, ...key.split('/'));
}

export const storage = {
  async put(key, buffer) {
    const file = resolveKey(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer, { flag: 'wx' });
  },
  async get(key) {
    return readFile(resolveKey(key));
  },
  async copy(fromKey, toKey) {
    const to = resolveKey(toKey);
    await mkdir(path.dirname(to), { recursive: true });
    await copyFile(resolveKey(fromKey), to);
  },
  async remove(key) {
    await rm(resolveKey(key), { force: true });
  },
};

export function statementFileKey() {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `statements/${now.getUTCFullYear()}/${mm}/${crypto.randomUUID()}.pdf`;
}

export const sha256Hex = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
