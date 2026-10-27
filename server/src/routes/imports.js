import { Router } from 'express';
import { z } from 'zod';
import { parseOrThrow } from '../lib/errors.js';
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
    const result = await checkImport(req, { clinicId: req.body?.clinicId, file, zipFile });
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
