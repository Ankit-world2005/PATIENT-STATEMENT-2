import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { query } from '../db/pool.js';
import { cleanFilename, contentDisposition, describeFile } from '../lib/attachment-files.js';
import { HttpError, badRequest, notFound } from '../lib/errors.js';
import { storage } from '../lib/storage.js';
import { isUuid } from '../services/access.js';

// Remark and request attachments: photos, PDFs, spreadsheets, documents.
export const attachmentsRouter = Router();

// Keep in sync with MAX_ATTACHMENT_BYTES in frontend/src/components/RemarkAttachments.jsx.
const MAX_BYTES = 15 * 1024 * 1024;
const TOO_LARGE = 'Attach files up to 15 MB.';
// Large files arrive in pieces so each request stays under Vercel's 4.5 MB body limit.
const MAX_CHUNK_BYTES = 3 * 1024 * 1024;
const MAX_CHUNKS = 16;

/** Runs a multer handler and turns its size error into a clear message. */
function receive(handler, sizeMessage) {
  return (req, res, next) =>
    handler(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') return next(badRequest(sizeMessage));
      next(err);
    });
}

// defParamCharset: browsers send file names as UTF-8; multer's default would garble accented names.
const receiveFile = receive(
  multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 }, defParamCharset: 'utf8' }).single('file'),
  TOO_LARGE,
);
const receiveChunk = receive(
  multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_CHUNK_BYTES, files: 1, fields: 10 }, defParamCharset: 'utf8' })
    .single('chunk'),
  'The upload could not be read. Please attach the file again.',
);

async function saveAttachment(buffer, rawName, user) {
  if (!buffer?.length) throw badRequest('This file is empty.');
  if (buffer.length > MAX_BYTES) throw badRequest(TOO_LARGE);

  const name = cleanFilename(rawName);
  const type = describeFile(name, buffer);
  const id = crypto.randomUUID();
  const storageKey = `attachments/${id}.${type.storageExt}`;

  await storage.put(storageKey, buffer);
  try {
    await query(
      `INSERT INTO attachment (id, filename, content_type, size_bytes, storage_key, uploader_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, name, type.mime, buffer.length, storageKey, user.id],
    );
  } catch (err) {
    await storage.remove(storageKey).catch(() => {});
    throw err;
  }
  return { id, name, contentType: type.mime, size: buffer.length, url: `/api/attachments/${id}` };
}

// POST /api/attachments - upload a whole file (small files).
attachmentsRouter.post('/', receiveFile, async (req, res) => {
  if (!req.file) throw badRequest('Choose a file to attach.');
  const attachment = await saveAttachment(req.file.buffer, req.file.originalname, req.user);
  res.status(201).json({ ok: true, attachment });
});

// POST /api/attachments/chunk - upload a large file in pieces; the last piece creates the attachment.
attachmentsRouter.post('/chunk', receiveChunk, async (req, res) => {
  const uploadId = req.body?.uploadId;
  const index = Number(req.body?.chunkIndex);
  const total = Number(req.body?.totalChunks);
  if (
    !isUuid(uploadId) || !Number.isInteger(index) || !Number.isInteger(total)
    || total < 1 || total > MAX_CHUNKS || index < 0 || index >= total || !req.file?.buffer?.length
  ) {
    throw badRequest('The upload could not be read. Please attach the file again.');
  }

  // Pieces are keyed by user, so nobody can add to or collect someone else's upload.
  const key = `attachment:${req.user.id}:${uploadId}`;
  await query(
    `INSERT INTO upload_chunk (upload_id, chunk_index, total_chunks, data) VALUES ($1, $2, $3, $4)
     ON CONFLICT (upload_id, chunk_index) DO UPDATE SET data = EXCLUDED.data, total_chunks = EXCLUDED.total_chunks`,
    [key, index, total, req.file.buffer],
  );
  const { rows: sums } = await query(
    'SELECT count(*)::int AS count, coalesce(sum(length(data)), 0)::bigint AS bytes FROM upload_chunk WHERE upload_id = $1',
    [key],
  );
  if (Number(sums[0].bytes) > MAX_BYTES) {
    await query('DELETE FROM upload_chunk WHERE upload_id = $1', [key]);
    throw badRequest(TOO_LARGE);
  }
  if (sums[0].count < total) return res.json({ completed: false, received: sums[0].count, totalChunks: total });

  // DELETE ... RETURNING claims the pieces, so a retried last piece can't create the file twice.
  const { rows } = await query('DELETE FROM upload_chunk WHERE upload_id = $1 RETURNING chunk_index, data', [key]);
  rows.sort((a, b) => a.chunk_index - b.chunk_index);
  if (rows.length !== total || rows.some((r, i) => r.chunk_index !== i)) {
    throw badRequest('Part of the file went missing during upload. Please attach it again.');
  }
  const attachment = await saveAttachment(Buffer.concat(rows.map((r) => r.data)), req.body?.fileName, req.user);
  res.status(201).json({ completed: true, attachment });
});

// GET /api/attachments/:id - view (images, PDFs, text) or download (everything else, or ?download=1).
attachmentsRouter.get('/:id', async (req, res) => {
  if (!isUuid(req.params.id)) throw notFound();
  const { rows } = await query('SELECT filename, storage_key FROM attachment WHERE id = $1', [req.params.id]);
  if (!rows[0]) throw notFound();

  let buffer;
  try {
    buffer = await storage.get(rows[0].storage_key);
  } catch (err) {
    if (err.code === 'ENOENT') throw new HttpError(404, 'This file is no longer available.');
    throw err;
  }

  // Worked out from the file itself; older rows may hold whatever type the uploader's browser claimed.
  const type = describeFile(rows[0].filename, buffer);
  const download = !type.inline || req.query.download === '1' || req.query.download === 'true';
  const csp = type.mime === 'application/pdf'
    ? "default-src 'self'; object-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'self'"
    : "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; frame-ancestors 'self'";

  res.set({
    'Content-Type': type.mime,
    'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', rows[0].filename),
    // Patient documents must not stay in the browser cache (TRD 5.3).
    'Cache-Control': 'private, no-store',
    'Content-Security-Policy': csp,
    'X-Frame-Options': 'SAMEORIGIN',
  });
  res.send(buffer);
});
