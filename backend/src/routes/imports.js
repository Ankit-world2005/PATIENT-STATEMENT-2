import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { parseOrThrow } from '../lib/errors.js';
import { storage } from '../lib/storage.js';
import {
  cancelImport, checkImport, getErrorReport, getImportDetail, publishImport, setDuplicateDecisions,
} from '../services/imports/service.js';
import { templateCsv, templateXlsx } from '../services/imports/template.js';
import multer from 'multer';
import { upload } from './uploads.js';

export const importsRouter = Router();

const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 2, fields: 40 },
}).fields([
  { name: 'file', maxCount: 1 },
  { name: 'zip', maxCount: 1 },
]);

const chunkUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('chunk');

// Chunked upload for statement ZIP files (bypasses serverless 4.5MB payload limit)
importsRouter.post('/chunk', (req, res, next) => {
  chunkUpload(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res, next) => {
  try {
    const uploadId = req.body?.uploadId;
    const chunkIndex = parseInt(req.body?.chunkIndex, 10);
    const totalChunks = parseInt(req.body?.totalChunks, 10);
    const file = req.file;

    if (!uploadId || isNaN(chunkIndex) || isNaN(totalChunks) || !file) {
      return res.status(400).json({ error: 'Missing chunk upload parameters.' });
    }

    await pool.query(
      `INSERT INTO upload_chunk (upload_id, chunk_index, total_chunks, data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (upload_id, chunk_index) DO UPDATE SET data = EXCLUDED.data`,
      [uploadId, chunkIndex, totalChunks, file.buffer],
    );

    const countRes = await pool.query(
      `SELECT count(*)::int AS count FROM upload_chunk WHERE upload_id = $1`,
      [uploadId],
    );
    const receivedCount = countRes.rows[0]?.count || 0;

    if (receivedCount === totalChunks) {
      const { rows } = await pool.query(
        `SELECT data FROM upload_chunk WHERE upload_id = $1 ORDER BY chunk_index ASC`,
        [uploadId],
      );

      const totalBuffer = Buffer.concat(rows.map((r) => r.data));
      const zipKey = `imports/zip/${uploadId}.zip`;
      await storage.put(zipKey, totalBuffer);

      await pool.query('DELETE FROM upload_chunk WHERE upload_id = $1', [uploadId]);

      return res.json({ completed: true, zipKey, size: totalBuffer.length });
    }

    res.json({ completed: false, chunkIndex, totalChunks, receivedCount });
  } catch (err) {
    next(err);
  }
});

// FR-7.2: downloadable template.
importsRouter.get('/template.xlsx', async (_req, res) => {
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .set('Content-Disposition', 'attachment; filename="statement-import-template.xlsx"')
    .send(await templateXlsx());
});

importsRouter.get('/template.csv', (_req, res) => {
  res.type('text/csv')
    .set('Content-Disposition', 'attachment; filename="statement-import-template.csv"')
    .send(templateCsv());
});

// S4: check file & zip.
importsRouter.post('/', (req, res, next) => {
  importUpload(req, res, (err) => {
    if (err) return next(err);
    next();
  });
}, async (req, res, next) => {
  try {
    const file = req.files?.file?.[0] || req.file;
    const zipFile = req.files?.zip?.[0];
    const zipKey = req.body?.zipKey;
    const zipName = req.body?.zipName;
    const result = await checkImport(req, {
      clinicId: req.body?.clinicId,
      file,
      zipFile,
      zipKey,
      zipName,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// S5 / S6.
importsRouter.get('/:id', async (req, res) => {
  res.json(await getImportDetail(req, req.params.id));
});

const decisionSchema = z.object({
  decision: z.enum(['update', 'skip']),
  rowNumbers: z.array(z.number().int().positive()).max(5000).optional(),
});

importsRouter.patch('/:id/duplicates', async (req, res) => {
  const input = parseOrThrow(decisionSchema, req.body ?? {});
  res.json(await setDuplicateDecisions(req, req.params.id, input));
});

importsRouter.post('/:id/publish', async (req, res) => {
  res.json(await publishImport(req, req.params.id));
});

importsRouter.post('/:id/cancel', async (req, res) => {
  res.json(await cancelImport(req, req.params.id));
});

importsRouter.get('/:id/error-report', async (req, res) => {
  const report = await getErrorReport(req, req.params.id);
  if (!report) return res.status(404).json({ error: 'There are no failed rows to report.' });
  res.type('text/csv').set('Content-Disposition', `attachment; filename="${report.filename}"`).send(report.buffer);
});
