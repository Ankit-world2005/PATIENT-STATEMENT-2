import crypto from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import { query } from '../db/pool.js';
import { parseCollectionExcel } from '../services/collection-parser.js';
import { generateCollectionExcel } from '../services/collection-exporter.js';
import { badRequest, notFound } from '../lib/errors.js';

export const collectionsRouter = Router();

function requireCollectionAccess(req, res, next) {
  if (req.user?.role === 'admin' || req.user?.role === 'specialist') {
    return next();
  }
  if (req.user?.role === 'clinic_user' && req.user?.is_clinic_admin) {
    return next();
  }
  return res.status(403).json({ error: 'Access denied. Only clinic administrators can access clinic collection reports.' });
}

collectionsRouter.use(requireCollectionAccess);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

// GET /api/collections - Get collection dashboard data for clinic
collectionsRouter.get('/', async (req, res) => {
  const clinicId = req.user.role === 'clinic_user' ? req.user.clinic_id : (req.query.clinicId || req.user.clinic_id);
  const month = req.query.month;

  let clinicName = '';
  if (clinicId) {
    const cRes = await query('SELECT name FROM clinic WHERE id = $1', [clinicId]);
    if (cRes.rows[0]) clinicName = cRes.rows[0].name;
  }

  if (!clinicId) {
    return res.json({ ok: true, collection: null, clinicName: '' });
  }

  // Find saved collection in DB for this specific clinic only
  let sql = 'SELECT * FROM clinic_collection WHERE clinic_id = $1';
  const params = [clinicId];
  if (month) {
    sql += ' AND month_year = $2';
    params.push(month);
  }
  sql += ' ORDER BY created_at DESC LIMIT 1';

  try {
    const { rows } = await query(sql, params);
    if (rows[0]) {
      const rec = rows[0];
      const monthsRes = await query(
        'SELECT DISTINCT month_year FROM clinic_collection WHERE clinic_id = $1 ORDER BY month_year DESC',
        [clinicId]
      );
      const availableMonths = monthsRes.rows.map(r => r.month_year).filter(Boolean);

      return res.json({
        ok: true,
        collection: {
          id: rec.id,
          clinicId: rec.clinic_id,
          clinicName,
          reportTitle: rec.report_title,
          monthYear: rec.month_year,
          summary: rec.summary,
          checkRows: rec.check_sheet || [],
          lineItems: rec.line_items || [],
          availableMonths: availableMonths.length > 0 ? availableMonths : [rec.month_year],
          createdAt: rec.created_at,
          isSample: false,
        },
      });
    }
  } catch (err) {
    console.warn('[collections] query error:', err.message);
  }

  // When no collection report has been uploaded yet for this clinic, return null (no dummy data)
  res.json({
    ok: true,
    collection: null,
    clinicName,
  });
});

// POST /api/collections/upload - Upload a Collection Excel sheet (Specialists & Admins only)
collectionsRouter.post('/upload', upload.single('file'), async (req, res) => {
  if (req.user.role === 'clinic_user') {
    return res.status(403).json({ error: 'Only US24 specialists can upload collection reports.' });
  }

  if (!req.file) throw badRequest('No Excel file uploaded.');

  const clinicId = req.body.clinicId || req.user.clinic_id;
  if (!clinicId) throw badRequest('Clinic ID required.');

  const cRes = await query('SELECT name FROM clinic WHERE id = $1', [clinicId]);
  const clinicName = cRes.rows[0]?.name || 'Clinic';

  const isNaperville = /naperville/i.test(clinicName);
  const parsed = await parseCollectionExcel(req.file.buffer, { clinicName, isNaperville });

  const summary = {
    detectedFormat: parsed.detectedFormat || 'prompt',
    formatLabel: parsed.formatLabel || 'Prompt Format',
    isNaperville: Boolean(parsed.isNaperville) || isNaperville,
    particulars: parsed.particulars,
    promptPosting: parsed.promptPosting,
    postingSummary: parsed.postingSummary || parsed.promptPosting,
    postingPeriods: parsed.postingPeriods || null,
    locationSummary: parsed.locationSummary,
    hybridSummaries: parsed.hybridSummaries || null,
  };

  const { rows } = await query(
    `INSERT INTO clinic_collection (clinic_id, report_title, month_year, summary, check_sheet, line_items, raw_file_name, uploaded_by_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, created_at`,
    [
      clinicId,
      parsed.reportTitle || `${clinicName} Collection Report - ${parsed.monthYear}`,
      parsed.monthYear,
      JSON.stringify(summary),
      JSON.stringify(parsed.checkRows),
      JSON.stringify(parsed.lineItems),
      req.file.originalname,
      req.user.id,
    ]
  );

  res.status(201).json({
    ok: true,
    message: 'Collection report uploaded successfully.',
    collection: {
      id: rows[0].id,
      clinicId,
      clinicName,
      reportTitle: parsed.reportTitle || `${clinicName} Collection Report - ${parsed.monthYear}`,
      monthYear: parsed.monthYear,
      summary,
      checkRows: parsed.checkRows,
      lineItems: parsed.lineItems,
      createdAt: rows[0].created_at,
      isSample: false,
    },
  });
});

// GET /api/collections/template - Download the blank 3-sheet template
collectionsRouter.get('/template', async (req, res) => {
  const clinicName = req.query.clinicName || 'Clinic';
  const monthYear = req.query.month || 'Current';
  const isNaperville = /naperville/i.test(clinicName);

  const buffer = await generateCollectionExcel({
    reportTitle: isNaperville ? 'Collection Report - October 2026' : `${clinicName} Collection Report - ${monthYear}`,
    isNaperville,
    particulars: { checkAmount: 0, patientPayment: 0, total: 0 },
    promptPosting: { insurancePayment: 0, recoupmentOffset: 0, deductible: 0, coinsurance: 0, copay: 0, grandTotal: 0 },
    checkRows: [],
    lineItems: [],
  });

  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(clinicName)}_Collection_Template.xlsx"`);
  res.send(buffer);
});

// GET /api/collections/export - Export collection data to Excel
collectionsRouter.get('/export', async (req, res) => {
  const clinicId = req.user.role === 'clinic_user' ? req.user.clinic_id : (req.query.clinicId || req.user.clinic_id);
  const month = req.query.month;

  if (!clinicId) {
    return res.status(400).json({ error: 'Clinic ID required.' });
  }

  const cRes = await query('SELECT name FROM clinic WHERE id = $1', [clinicId]);
  const clinicName = cRes.rows[0]?.name || 'Clinic';

  let colData = null;
  if (req.query.id) {
    const { rows } = await query('SELECT * FROM clinic_collection WHERE id = $1 AND clinic_id = $2', [req.query.id, clinicId]);
    if (rows[0]) colData = rows[0];
  } else {
    let sql = 'SELECT * FROM clinic_collection WHERE clinic_id = $1';
    const params = [clinicId];
    if (month) {
      sql += ' AND month_year = $2';
      params.push(month);
    }
    sql += ' ORDER BY created_at DESC LIMIT 1';
    const { rows } = await query(sql, params);
    if (rows[0]) colData = rows[0];
  }

  if (!colData) {
    return res.status(404).json({ error: `No collection report uploaded yet for ${clinicName}.` });
  }

  const payload = {
    reportTitle: colData.report_title,
    particulars: colData.summary?.particulars || {},
    promptPosting: colData.summary?.promptPosting || {},
    postingPeriods: colData.summary?.postingPeriods || null,
    isNaperville: Boolean(colData.summary?.isNaperville) || /naperville/i.test(clinicName),
    checkRows: colData.check_sheet || [],
    lineItems: colData.line_items || [],
    monthYear: colData.month_year,
  };

  const buffer = await generateCollectionExcel({
    reportTitle: payload.reportTitle || `${clinicName} Collection Report`,
    particulars: payload.particulars,
    promptPosting: payload.promptPosting,
    postingPeriods: payload.postingPeriods,
    isNaperville: payload.isNaperville,
    checkRows: payload.checkRows,
    lineItems: payload.lineItems,
  });

  const filename = `${clinicName}_Collection_Report_${(payload.monthYear || 'Report').replace(/\s+/g, '_')}.xlsx`;
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buffer);
});

// POST /api/collections/:id/rows/logs - Add isolated log entry to a specific row
collectionsRouter.post('/:id/rows/logs', async (req, res) => {
  const { id } = req.params;
  const { rowIndex, paymentReference, logText, sheetType = 'check' } = req.body;
  if (!logText || !logText.trim()) throw badRequest('Log text required.');

  let sql = 'SELECT * FROM clinic_collection WHERE id = $1';
  const params = [id];
  if (req.user.role === 'clinic_user') {
    sql += ' AND clinic_id = $2';
    params.push(req.user.clinic_id);
  }
  const { rows } = await query(sql, params);
  if (rows.length === 0) throw notFound('Collection report not found or access denied.');

  const collection = rows[0];
  const sheet = sheetType === 'lineitem' ? (collection.line_items || []) : (collection.check_sheet || []);
  if (!Array.isArray(sheet) || rowIndex < 0 || rowIndex >= sheet.length) {
    throw badRequest('Row not found in collection report.');
  }

  const targetRow = sheet[rowIndex];
  if (!Array.isArray(targetRow.logs)) {
    targetRow.logs = [];
  }

  const newLog = {
    id: crypto.randomUUID(),
    text: logText.trim(),
    author: req.user.full_name || req.user.email || 'User',
    role: req.user.role,
    createdAt: new Date().toISOString(),
  };

  targetRow.logs.push(newLog);

  const updateCol = sheetType === 'lineitem' ? 'line_items' : 'check_sheet';
  await query(`UPDATE clinic_collection SET ${updateCol} = $1 WHERE id = $2`, [JSON.stringify(sheet), id]);

  res.json({ ok: true, log: newLog, logs: targetRow.logs });
});

// POST /api/collections/:id/rows/flags - Toggle / set flag on a specific row with audit log
collectionsRouter.post('/:id/rows/flags', async (req, res) => {
  const { id } = req.params;
  const { rowIndex, paymentReference, flagType, active, reason, sheetType = 'check' } = req.body;
  if (!flagType) throw badRequest('Flag type required.');

  let sql = 'SELECT * FROM clinic_collection WHERE id = $1';
  const params = [id];
  if (req.user.role === 'clinic_user') {
    sql += ' AND clinic_id = $2';
    params.push(req.user.clinic_id);
  }
  const { rows } = await query(sql, params);
  if (rows.length === 0) throw notFound('Collection report not found or access denied.');

  const collection = rows[0];
  const sheet = sheetType === 'lineitem' ? (collection.line_items || []) : (collection.check_sheet || []);
  if (!Array.isArray(sheet) || rowIndex < 0 || rowIndex >= sheet.length) {
    throw badRequest('Row not found in collection report.');
  }

  const targetRow = sheet[rowIndex];
  if (!Array.isArray(targetRow.flags)) {
    targetRow.flags = [];
  }
  if (!Array.isArray(targetRow.logs)) {
    targetRow.logs = [];
  }

  // Remove existing flag of same type if present
  targetRow.flags = targetRow.flags.filter((f) => f.type !== flagType);
  if (active) {
    targetRow.flags.push({
      type: flagType,
      reason: reason || '',
      setBy: req.user.full_name || req.user.email || 'User',
      setAt: new Date().toISOString(),
    });
  }

  // Automatic isolated audit log entry
  targetRow.logs.push({
    id: crypto.randomUUID(),
    text: active
      ? `Flag "${flagType}" set: ${reason ? `"${reason}"` : 'Marked for follow-up'}`
      : `Flag "${flagType}" cleared / resolved`,
    author: req.user.full_name || req.user.email || 'User',
    role: req.user.role,
    isAudit: true,
    createdAt: new Date().toISOString(),
  });

  const updateCol = sheetType === 'lineitem' ? 'line_items' : 'check_sheet';
  await query(`UPDATE clinic_collection SET ${updateCol} = $1 WHERE id = $2`, [JSON.stringify(sheet), id]);

  res.json({ ok: true, flags: targetRow.flags, logs: targetRow.logs });
});

// POST /api/collections/:id/rows/remarks - Update isolated remark on a specific row
collectionsRouter.post('/:id/rows/remarks', async (req, res) => {
  const { id } = req.params;
  const { rowIndex, remarkText, sheetType = 'check' } = req.body;

  let sql = 'SELECT * FROM clinic_collection WHERE id = $1';
  const params = [id];
  if (req.user.role === 'clinic_user') {
    sql += ' AND clinic_id = $2';
    params.push(req.user.clinic_id);
  }
  const { rows } = await query(sql, params);
  if (rows.length === 0) throw notFound('Collection report not found or access denied.');

  const collection = rows[0];
  const sheet = sheetType === 'lineitem' ? (collection.line_items || []) : (collection.check_sheet || []);
  if (!Array.isArray(sheet) || rowIndex < 0 || rowIndex >= sheet.length) {
    throw badRequest('Row not found in collection report.');
  }

  const targetRow = sheet[rowIndex];
  const cleanRemark = String(remarkText || '').trim();
  targetRow.remarks = cleanRemark;

  if (!Array.isArray(targetRow.logs)) {
    targetRow.logs = [];
  }

  const newLog = {
    id: crypto.randomUUID(),
    text: cleanRemark ? `Remark updated: "${cleanRemark}"` : 'Remark cleared',
    author: req.user.full_name || req.user.email || 'User',
    role: req.user.role,
    isRemark: true,
    createdAt: new Date().toISOString(),
  };
  targetRow.logs.push(newLog);

  const updateCol = sheetType === 'lineitem' ? 'line_items' : 'check_sheet';
  await query(`UPDATE clinic_collection SET ${updateCol} = $1 WHERE id = $2`, [JSON.stringify(sheet), id]);

  res.json({ ok: true, remarks: cleanRemark, log: newLog, logs: targetRow.logs });
});

