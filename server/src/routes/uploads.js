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
import { checkUploadedPdf, renderStatementPdf } from '../services/pdf.js';
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
  const clinicId = req.body?.clinicId ?? req.body?.clinic_id;
  const clinic = await getPublishableClinic(pool, req, clinicId);

  const raw = Object.fromEntries(FIELDS.map((f) => [f.key, req.body?.[f.key] ?? null]));
  if (req.body?.remarks && !raw.us24_notes) {
    raw.us24_notes = req.body.remarks;
  }
  if (req.body?.location && !raw.location_name) {
    raw.location_name = req.body.location;
  }
  if (req.body?.patient && !raw.patient_name) {
    raw.patient_name = req.body.patient;
  }
  if (req.body?.status && !raw.status) {
    raw.status = req.body.status;
  }
  if (!raw.balance_due && !raw.cycle1_balance && !raw.current_balance) {
    raw.balance_due = '0.00';
    raw.current_balance = '0.00';
  }

  const { data, errors } = validateStatement(raw);
  const fieldErrors = Object.fromEntries(errors.map((e) => {
    let field = e.field;
    if (field === 'statement_date') field = 'cycle1_date';
    if (field === 'balance_due') field = 'cycle1_balance';
    return [field, e.message];
  }));

  let fileBuffer;
  let filename;
  let fileSize;
  if (req.file) {
    const pdfProblem = await checkUploadedPdf(req.file.buffer);
    if (pdfProblem) fieldErrors.pdf = pdfProblem;
    fileBuffer = req.file.buffer;
    filename = req.file.originalname.slice(0, 255);
    fileSize = req.file.size;
  } else if (!Object.keys(fieldErrors).length) {
    fileBuffer = await renderStatementPdf(data, clinic);
    filename = `${(data.patient_name || 'statement').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
    fileSize = fileBuffer.length;
  }

  if (Object.keys(fieldErrors).length) throw badRequest('Please correct the highlighted fields.', fieldErrors);

  const id = crypto.randomUUID();
  const key = `drafts/${id}.pdf`;
  await storage.put(key, fileBuffer);
  await pool.query(
    `INSERT INTO upload_draft (id, specialist_id, clinic_id, payload, storage_key, original_filename, size_bytes, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, req.user.id, clinic.id, JSON.stringify(data), key, filename, fileSize, sha256Hex(fileBuffer)],
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
    if (p.us24_notes) {
      await db.query(
        `INSERT INTO remark (statement_id, author_id, author_role, type, body)
         VALUES ($1, $2, 'specialist', 'specialist', $3)`,
        [created.id, req.user.id, p.us24_notes],
      );
    }
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
