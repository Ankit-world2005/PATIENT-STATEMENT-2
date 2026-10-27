import crypto from 'node:crypto';
import { pool, withTransaction } from '../../db/pool.js';
import { audit } from '../../lib/audit.js';
import { badRequest, conflict } from '../../lib/errors.js';
import { storage, sha256Hex, statementFileKey } from '../../lib/storage.js';
import { getOwnImportBatch, getPublishableClinic } from '../access.js';
import { insertStatements, lockChainHead, updateStatement } from '../statements.js';
import { buildErrorReportCsv } from './report.js';
import { markDuplicates, validateRows } from './validate.js';
import { extractPdfsFromZip, matchPdfsToRows } from './zip.js';

// Bulk statement import (F8), following schema transactions T4-T6:
//   check   -> batch 'previewed' (or 'failed') with staged import_row records
//   decide  -> Skip / Publish as new version for each possible duplicate
//   publish -> statements created, error report saved, staged rows removed
//   cancel  -> nothing published, staged rows removed

const PREVIEW_HOURS = 24;

async function insertImportRows(db, batchId, rows) {
  for (let i = 0; i < rows.length; i += 1000) {
    const chunk = rows.slice(i, i + 1000);
    const params = [];
    const tuples = chunk.map((r) => {
      params.push(
        batchId,
        r.rowNumber,
        r.outcome,
        JSON.stringify(r.data),
        r.errors ? JSON.stringify(r.errors) : null,
        r.duplicateOf ?? null,
        r.duplicateDecision ?? (r.outcome === 'duplicate' ? 'new_version' : null),
      );
      const n = params.length;
      return `($${n - 6}, $${n - 5}, $${n - 4}, $${n - 3}::jsonb, $${n - 2}::jsonb, $${n - 1}, $${n})`;
    });
    await db.query(
      `INSERT INTO import_row (batch_id, row_number, outcome, data, errors, duplicate_of_statement_id, duplicate_decision)
       VALUES ${tuples.join(', ')}`,
      params,
    );
  }
}

/** S4 "Check file": validates the spreadsheet and extracts/matches PDFs from zip. Nothing is published. */
export async function checkImport(req, { clinicId, file, zipFile }) {
  await runCleanup();
  const clinic = await getPublishableClinic(pool, req, clinicId);
  if (!file) throw badRequest('Choose a file to import.', { file: 'Choose an .xlsx or .csv file.' });
  if (!zipFile) {
    throw badRequest('Upload the ZIP file containing patient statement PDFs.', {
      zip: 'Upload a .zip file containing patient statement PDFs.',
    });
  }

  let format;
  try {
    format = detectFormat(file.originalname, file.buffer);
  } catch (err) {
    if (err instanceof ImportFileError) throw badRequest(err.message, { file: err.message });
    throw err;
  }
  if (!format) throw badRequest('Upload an .xlsx or .csv file.', { file: 'Upload an .xlsx or .csv file.' });

  // Extract statement PDFs from ZIP
  const pdfEntries = await extractPdfsFromZip(zipFile.buffer);

  let parsed = null;
  let failureReason = null;
  try {
    parsed = await parseImportFile(file.buffer, file.originalname);
  } catch (err) {
    if (!(err instanceof ImportFileError)) throw err;
    failureReason = err.message.slice(0, 500);
  }

  let rows = [];
  let matchedPdfCount = 0;
  if (parsed) {
    rows = validateRows(parsed.rows);
    await markDuplicates(pool, clinic.id, rows);

    // Match extracted PDFs to rows (supporting multi-cycle: 1st, 2nd, 3rd)
    const matchResult = matchPdfsToRows(pdfEntries, rows);
    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      const pIndices = matchResult.rowPdfs?.get(rIdx) ||
        (matchResult.assignments?.has(rIdx) ? [matchResult.assignments.get(rIdx)] : []);

      if (pIndices.length > 0) {
        row.data.matched_pdfs = [];
        for (const pIdx of pIndices) {
          const pdf = pdfEntries[pIdx];
          const storageKey = statementFileKey();
          await storage.put(storageKey, pdf.buffer);
          row.data.matched_pdfs.push({
            storage_key: storageKey,
            original_filename: pdf.originalFilename,
            size_bytes: pdf.sizeBytes,
            sha256: pdf.sha256,
          });
        }
        const primary = row.data.matched_pdfs[0];
        row.data.matched_pdf_storage_key = primary.storage_key;
        row.data.matched_pdf_name = primary.original_filename;
        row.data.matched_pdf_size = primary.size_bytes;
        row.data.matched_pdf_sha256 = primary.sha256;
      }
    }
    matchedPdfCount = matchResult.matchedPdfsCount || matchResult.matchedCount;
  }
  const counts = {
    total: rows.length,
    valid: rows.filter((r) => r.outcome === 'valid').length,
    invalid: rows.filter((r) => r.outcome === 'invalid').length,
    duplicate: rows.filter((r) => r.outcome === 'duplicate').length,
  };

  const batchId = crypto.randomUUID();
  const sourceKey = `imports/source/${batchId}.${format}`;
  await storage.put(sourceKey, file.buffer);

  await withTransaction(async (db) => {
    await db.query(
      `INSERT INTO import_batch
         (id, clinic_id, specialist_id, original_filename, file_format, size_bytes, sha256, source_storage_key,
          status, failure_reason, total_rows, valid_rows, invalid_rows, duplicate_rows, checked_at, preview_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), $15)`,
      [
        batchId, clinic.id, req.user.id, file.originalname.slice(0, 255), format, file.size, sha256Hex(file.buffer),
        sourceKey, failureReason ? 'failed' : 'previewed', failureReason,
        parsed ? counts.total : null, parsed ? counts.valid : null,
        parsed ? counts.invalid : null, parsed ? counts.duplicate : null,
        failureReason ? null : new Date(Date.now() + PREVIEW_HOURS * 3600_000),
      ],
    );
    if (rows.length) await insertImportRows(db, batchId, rows);
    await audit(db, req, {
      action: 'import.check',
      outcome: failureReason ? 'failure' : 'success',
      targetType: 'import_batch',
      targetId: batchId,
      clinicId: clinic.id,
      details: {
        rows_total: counts.total,
        rows_valid: counts.valid,
        rows_invalid: counts.invalid,
        rows_duplicate: counts.duplicate,
        pdfs_total: pdfEntries.length,
        pdfs_matched: matchedPdfCount,
        zip_name: zipFile.originalname,
      },
    });
  });

  return {
    id: batchId,
    status: failureReason ? 'failed' : 'previewed',
    failureReason,
    ignoredColumns: parsed?.ignoredColumns ?? [],
    zipSummary: {
      totalPdfs: pdfEntries.length,
      matchedPdfs: matchedPdfCount,
      zipFilename: zipFile.originalname,
    },
  };
}

function publicBatch(b) {
  return {
    id: b.id,
    clinic: { id: b.clinic_id, name: b.clinic_name, code: b.clinic_code },
    originalFilename: b.original_filename,
    fileFormat: b.file_format,
    status: b.status,
    failureReason: b.failure_reason,
    totals: {
      total: b.total_rows, valid: b.valid_rows, invalid: b.invalid_rows, duplicate: b.duplicate_rows,
      published: b.published_rows, newVersions: b.published_new_versions, skipped: b.skipped_duplicates,
    },
    hasErrorReport: Boolean(b.error_report_storage_key) || (b.status === 'previewed' && b.invalid_rows > 0),
    specialistName: b.specialist_name,
    createdAt: b.created_at,
    publishedAt: b.published_at,
    cancelledAt: b.cancelled_at,
    previewExpiresAt: b.preview_expires_at,
  };
}

async function expireIfStale(db, batch) {
  if (batch.status === 'previewed' && new Date(batch.preview_expires_at) < new Date()) {
    await db.query(`UPDATE import_batch SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [batch.id]);
    await db.query('DELETE FROM import_row WHERE batch_id = $1', [batch.id]);
    return { ...batch, status: 'cancelled', cancelled_at: new Date() };
  }
  return batch;
}

/** S5 / S6 data for one batch. */
export async function getImportDetail(req, batchId) {
  let batch = await getOwnImportBatch(pool, req, batchId);
  batch = await expireIfStale(pool, batch);
  batch.specialist_name = req.user.full_name;
  const result = { batch: publicBatch(batch) };

  if (batch.status === 'previewed') {
    const invalid = await pool.query(
      `SELECT row_number, data, errors FROM import_row
        WHERE batch_id = $1 AND outcome = 'invalid' ORDER BY row_number LIMIT 500`,
      [batch.id],
    );
    const duplicates = await pool.query(
      `SELECT r.row_number, r.data, r.duplicate_decision, s.id AS existing_id, s.version AS existing_version,
              s.balance_due AS existing_balance, s.uploaded_at AS existing_uploaded_at
         FROM import_row r JOIN statement s ON s.id = r.duplicate_of_statement_id
        WHERE r.batch_id = $1 AND r.outcome = 'duplicate' ORDER BY r.row_number`,
      [batch.id],
    );
    const sample = await pool.query(
      `SELECT row_number, data FROM import_row WHERE batch_id = $1 AND outcome = 'valid' ORDER BY row_number LIMIT 10`,
      [batch.id],
    );
    const matchedCountRes = await pool.query(
      `SELECT count(*)::int AS count FROM import_row WHERE batch_id = $1 AND data ? 'matched_pdf_storage_key'`,
      [batch.id],
    );
    result.matchedPdfsCount = matchedCountRes.rows[0]?.count || 0;
    result.invalidRows = invalid.rows.map((r) => ({ rowNumber: r.row_number, data: r.data, errors: r.errors }));
    result.duplicates = duplicates.rows.map((r) => ({
      rowNumber: r.row_number,
      data: r.data,
      decision: r.duplicate_decision,
      existing: {
        id: r.existing_id, version: r.existing_version, balanceDue: r.existing_balance, uploadedAt: r.existing_uploaded_at,
      },
    }));
    result.sampleRows = sample.rows.map((r) => ({ rowNumber: r.row_number, data: r.data }));
  }
  return result;
}

/** S5: choose Skip or Update existing for one, several or all duplicates. */
export async function setDuplicateDecisions(req, batchId, { decision, rowNumbers }) {
  if (!['skip', 'new_version', 'update'].includes(decision)) throw badRequest('Choose Skip or Update existing.');
  return withTransaction(async (db) => {
    let batch = await getOwnImportBatch(db, req, batchId, { forUpdate: true });
    batch = await expireIfStale(db, batch);
    if (batch.status !== 'previewed') throw conflict('This import is no longer waiting to be published.');
    const params = [batch.id, decision];
    let filter = '';
    if (Array.isArray(rowNumbers)) {
      params.push(rowNumbers.map(Number).filter(Number.isInteger));
      filter = 'AND row_number = ANY($3::int[])';
    }
    const { rowCount } = await db.query(
      `UPDATE import_row SET duplicate_decision = $2 WHERE batch_id = $1 AND outcome = 'duplicate' ${filter}`,
      params,
    );
    return { updated: rowCount };
  });
}

/** S5 "Publish valid rows" (schema T6). Safe against double-clicks: the batch row is locked and its status checked. */
export async function publishImport(req, batchId) {
  return withTransaction(async (db) => {
    let batch = await getOwnImportBatch(db, req, batchId, { forUpdate: true });
    batch = await expireIfStale(db, batch);
    if (['published', 'partially_imported'].includes(batch.status)) return { id: batch.id, status: batch.status, alreadyPublished: true };
    if (batch.status === 'cancelled') throw conflict('This preview has expired or was cancelled. Check the file again.');
    if (batch.status !== 'previewed') throw conflict('This import is no longer waiting to be published.');

    await getPublishableClinic(db, req, batch.clinic_id);

    const { rows } = await db.query(
      `SELECT row_number, outcome, data, errors, duplicate_of_statement_id, duplicate_decision
         FROM import_row WHERE batch_id = $1 ORDER BY row_number`,
      [batch.id],
    );
    const duplicates = rows.filter((r) => r.outcome === 'duplicate');
    // Default all undecided duplicates to 'update' existing patient statement
    for (const d of duplicates) {
      if (!d.duplicate_decision) d.duplicate_decision = 'update';
    }

    const base = { clinic_id: batch.clinic_id, source: 'import', import_batch_id: batch.id, uploaded_by_id: req.user.id };
    const items = rows
      .filter((r) => r.outcome === 'valid')
      .map((r) => ({ ...base, ...r.data, import_row_number: r.row_number, version: 1, supersedes_id: null }));

    // 1. Insert new statements for brand new patients
    const createdStatements = await insertStatements(db, items);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const created = createdStatements[i];
      const remarkBody = it.remarks || it.us24_notes;
      if (remarkBody && created?.id) {
        await db.query(
          `INSERT INTO remark (statement_id, author_id, author_role, type, body)
           VALUES ($1, $2, 'specialist', 'specialist', $3)`,
          [created.id, req.user.id, remarkBody],
        );
        await db.query(
          `UPDATE statement SET last_remark_at = now() WHERE id = $1`,
          [created.id],
        );
      }
      if (created?.id) {
        const pdfsToInsert = it.matched_pdfs && Array.isArray(it.matched_pdfs) && it.matched_pdfs.length > 0
          ? it.matched_pdfs
          : (it.matched_pdf_storage_key ? [{
              storage_key: it.matched_pdf_storage_key,
              original_filename: it.matched_pdf_name,
              size_bytes: it.matched_pdf_size,
              sha256: it.matched_pdf_sha256,
            }] : []);

        for (const pdf of pdfsToInsert) {
          await db.query(
            `INSERT INTO statement_file (statement_id, storage_key, original_filename, size_bytes, sha256)
             VALUES ($1, $2, $3, $4, $5)`,
            [created.id, pdf.storage_key, pdf.original_filename, pdf.size_bytes, pdf.sha256],
          );
        }
      }
    }

    // 2. Update existing statements in place with latest ledger data, cycle balances, remarks, and attached PDFs
    const toUpdate = duplicates.filter((r) => r.duplicate_decision === 'update' || r.duplicate_decision === 'new_version');
    for (const r of toUpdate) {
      const targetStatementId = r.duplicate_of_statement_id;
      if (targetStatementId) {
        await updateStatement(db, targetStatementId, r.data);
        const remarkBody = r.data.remarks || r.data.us24_notes;
        if (remarkBody) {
          await db.query(
            `INSERT INTO remark (statement_id, author_id, author_role, type, body)
             VALUES ($1, $2, 'specialist', 'specialist', $3)`,
            [targetStatementId, req.user.id, remarkBody],
          );
          await db.query(
            `UPDATE statement SET last_remark_at = now() WHERE id = $1`,
            [targetStatementId],
          );
        }
        const pdfsToInsert = r.data.matched_pdfs && Array.isArray(r.data.matched_pdfs) && r.data.matched_pdfs.length > 0
          ? r.data.matched_pdfs
          : (r.data.matched_pdf_storage_key ? [{
              storage_key: r.data.matched_pdf_storage_key,
              original_filename: r.data.matched_pdf_name,
              size_bytes: r.data.matched_pdf_size,
              sha256: r.data.matched_pdf_sha256,
            }] : []);

        for (const pdf of pdfsToInsert) {
          const existingFile = await db.query(
            `SELECT id FROM statement_file WHERE statement_id = $1 AND (storage_key = $2 OR original_filename = $3)`,
            [targetStatementId, pdf.storage_key, pdf.original_filename],
          );
          if (!existingFile.rows.length) {
            await db.query(
              `INSERT INTO statement_file (statement_id, storage_key, original_filename, size_bytes, sha256)
               VALUES ($1, $2, $3, $4, $5)`,
              [targetStatementId, pdf.storage_key, pdf.original_filename, pdf.size_bytes, pdf.sha256],
            );
          }
        }
      }
    }

    // 3. Attach matched PDFs to existing statements even if a duplicate row was marked skip
    const skipped = duplicates.filter((r) => r.duplicate_decision === 'skip');
    for (const sRow of skipped) {
      if (sRow.duplicate_of_statement_id) {
        const it = sRow.data || {};
        const pdfsToInsert = it.matched_pdfs && Array.isArray(it.matched_pdfs) && it.matched_pdfs.length > 0
          ? it.matched_pdfs
          : (it.matched_pdf_storage_key ? [{
              storage_key: it.matched_pdf_storage_key,
              original_filename: it.matched_pdf_name,
              size_bytes: it.matched_pdf_size,
              sha256: it.matched_pdf_sha256,
            }] : []);

        for (const pdf of pdfsToInsert) {
          const existingFile = await db.query(
            `SELECT id FROM statement_file WHERE statement_id = $1 AND (storage_key = $2 OR original_filename = $3)`,
            [sRow.duplicate_of_statement_id, pdf.storage_key, pdf.original_filename],
          );
          if (!existingFile.rows.length) {
            await db.query(
              `INSERT INTO statement_file (statement_id, storage_key, original_filename, size_bytes, sha256)
               VALUES ($1, $2, $3, $4, $5)`,
              [sRow.duplicate_of_statement_id, pdf.storage_key, pdf.original_filename, pdf.size_bytes, pdf.sha256],
            );
          }
        }
      }
    }

    const failed = rows.filter((r) => r.outcome === 'invalid');
    let reportKey = null;
    if (failed.length || skipped.length) {
      // Written before commit: a storage failure aborts the publish (schema T6).
      reportKey = `imports/error-reports/${batch.id}.csv`;
      await storage.put(reportKey, buildErrorReportCsv([...failed, ...skipped].sort((a, b) => a.row_number - b.row_number)));
    }

    const status = failed.length || skipped.length ? 'partially_imported' : 'published';
    await db.query(
      `UPDATE import_batch
          SET status = $2, published_at = now(), published_rows = $3, published_new_versions = $4,
              skipped_duplicates = $5, error_report_storage_key = $6
        WHERE id = $1`,
      [batch.id, status, items.length, toUpdate.length, skipped.length, reportKey],
    );
    await db.query('DELETE FROM import_row WHERE batch_id = $1', [batch.id]);
    await audit(db, req, {
      action: 'import.publish',
      targetType: 'import_batch',
      targetId: batch.id,
      clinicId: batch.clinic_id,
      details: {
        rows_total: rows.length,
        rows_published: items.length,
        new_versions: newVersions.length,
        skipped: skipped.length,
        rows_failed: failed.length,
      },
    });
    return { id: batch.id, status };
  });
}

export async function cancelImport(req, batchId) {
  return withTransaction(async (db) => {
    const batch = await getOwnImportBatch(db, req, batchId, { forUpdate: true });
    if (batch.status !== 'previewed') return { id: batch.id, status: batch.status };
    await db.query(`UPDATE import_batch SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [batch.id]);
    await db.query('DELETE FROM import_row WHERE batch_id = $1', [batch.id]);
    await audit(db, req, { action: 'import.cancel', targetType: 'import_batch', targetId: batch.id, clinicId: batch.clinic_id });
    return { id: batch.id, status: 'cancelled' };
  });
}

/** Error report: the saved file after publish, or failed rows generated on demand during preview. */
export async function getErrorReport(req, batchId) {
  return withTransaction(async (db) => {
    const batch = await getOwnImportBatch(db, req, batchId);
    let buffer;
    if (batch.error_report_storage_key) {
      buffer = await storage.get(batch.error_report_storage_key);
    } else if (batch.status === 'previewed') {
      const { rows } = await db.query(
        `SELECT row_number, outcome, data, errors FROM import_row
          WHERE batch_id = $1 AND outcome = 'invalid' ORDER BY row_number`,
        [batch.id],
      );
      if (!rows.length) return null;
      buffer = buildErrorReportCsv(rows);
    } else {
      return null;
    }
    await audit(db, req, {
      action: 'import.error_report.download', targetType: 'import_batch', targetId: batch.id, clinicId: batch.clinic_id,
    });
    return { buffer, filename: `import-errors-${batch.created_at.toISOString().slice(0, 10)}.csv` };
  });
}
