import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { HttpError, badRequest } from '../lib/errors.js';
import { FIELDS, validateStatement } from '../lib/statement-fields.js';
import { sha256Hex, statementFileKey, storage } from '../lib/storage.js';
import { getOwnDraft, getPublishableClinic } from '../services/access.js';
import { runCleanup } from '../services/cleanup.js';
import { checkUploadedPdf } from '../services/pdf.js';
import { findDuplicate, insertStatements, lockChainHead } from '../services/statements.js';

export const uploadsRouter = Router();

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxBytes, files: 1, fields: 40 },
});

function draftView(d, duplicate) {
  return {
    id: d.id,
    clinic: { id: d.clinic_id, name: d.clinic_name, code: d.clinic_code },
    fields: d.payload,
    fileName: d.original_filename,
    sizeBytes: d.size_bytes,
    expiresAt: d.expires_at,
    duplicate: duplicate
      ? { id: duplicate.id, version: duplicate.version, balanceDue: duplicate.balance_due, uploadedAt: duplicate.uploaded_at }
      : null,
  };
}

// --- S2: details and PDF -> draft ---------------------------------------------
uploadsRouter.post('/', upload.single('pdf'), async (req, res) => {
  await runCleanup();
  const clinic = await getPublishableClinic(pool, req, req.body?.clinicId);

  const raw = Object.fromEntries(FIELDS.map((f) => [f.key, req.body?.[f.key] ?? null]));
  const { data, errors } = validateStatement(raw);
  const fieldErrors = Object.fromEntries(errors.map((e) => [e.field, e.message]));
  if (!req.file) fieldErrors.pdf = 'Attach the statement PDF.';
  else {
    const pdfProblem = await checkUploadedPdf(req.file.buffer);
    if (pdfProblem) fieldErrors.pdf = pdfProblem;
  }
  if (Object.keys(fieldErrors).length) throw badRequest('Please correct the highlighted fields.', fieldErrors);

  const id = crypto.randomUUID();
  const key = `drafts/${id}.pdf`;
  await storage.put(key, req.file.buffer);
  await pool.query(
    `INSERT INTO upload_draft (id, specialist_id, clinic_id, payload, storage_key, original_filename, size_bytes, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, req.user.id, clinic.id, JSON.stringify(data), key, req.file.originalname.slice(0, 255), req.file.size,
      sha256Hex(req.file.buffer)],
  );
  res.status(201).json({ id });
});

// --- S3: confirm -------------------------------------------------------------
uploadsRouter.get('/:id', async (req, res) => {
  const draft = await getOwnDraft(pool, req, req.params.id);
  if (new Date(draft.expires_at) < new Date()) throw new HttpError(410, 'This upload has expired. Start again.');
  const dup = await findDuplicate(pool, draft.clinic_id, draft.payload.account_number, draft.payload.statement_date);
  res.json({ draft: draftView(draft, dup) });
});

uploadsRouter.post('/:id/publish', async (req, res) => {
  let draftKey;
  const statementId = await withTransaction(async (db) => {
    const draft = await getOwnDraft(db, req, req.params.id, { forUpdate: true });
    if (new Date(draft.expires_at) < new Date()) throw new HttpError(410, 'This upload has expired. Start again.');
    await getPublishableClinic(db, req, draft.clinic_id);

    const p = draft.payload;
    const dup = await findDuplicate(db, draft.clinic_id, p.account_number, p.statement_date);
    const head = dup ? await lockChainHead(db, dup.id) : null;

    // Copy before commit; if the transaction fails the copy is an orphan, never a row without a file (schema R-3).
    const fileKey = statementFileKey();
    await storage.copy(draft.storage_key, fileKey);

    const [created] = await insertStatements(db, [{
      ...p,
      clinic_id: draft.clinic_id,
      source: 'pdf_upload',
      import_batch_id: null,
      import_row_number: null,
      version: head ? head.version + 1 : 1,
      supersedes_id: head?.id ?? null,
      uploaded_by_id: req.user.id,
    }]);
    await db.query(
      `INSERT INTO statement_file (statement_id, storage_key, original_filename, size_bytes, sha256)
       VALUES ($1, $2, $3, $4, $5)`,
      [created.id, fileKey, draft.original_filename, draft.size_bytes, draft.sha256],
    );
    await db.query('DELETE FROM upload_draft WHERE id = $1', [draft.id]);
    await audit(db, req, { action: 'statement.upload', targetType: 'statement', targetId: created.id, clinicId: draft.clinic_id });
    draftKey = draft.storage_key;
    return created.id;
  });
  await storage.remove(draftKey).catch(() => {});
  res.status(201).json({ statementId });
});

uploadsRouter.delete('/:id', async (req, res) => {
  const draft = await getOwnDraft(pool, req, req.params.id);
  await pool.query('DELETE FROM upload_draft WHERE id = $1', [draft.id]);
  await storage.remove(draft.storage_key).catch(() => {});
  res.status(204).end();
});
