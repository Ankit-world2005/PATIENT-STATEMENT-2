import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import { pool, query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { HttpError, badRequest, conflict, parseOrThrow } from '../lib/errors.js';
import { storage, sha256Hex } from '../lib/storage.js';
import { requireRole } from '../middleware/guards.js';
import { getVisibleClinic, getVisibleStatement, statementScope } from '../services/access.js';
import { renderStatementPdf } from '../services/pdf.js';
import { insertRemark } from '../services/statements.js';

export const statementsRouter = Router();

const PAGE_SIZE = 25; // FR-9.5

const SORTS = {
  name_asc: 'lower(s.patient_name) ASC, s.statement_date DESC',
  name_desc: 'lower(s.patient_name) DESC, s.statement_date DESC',
  date_desc: 's.statement_date DESC, s.version DESC, s.id',
  date_asc: 's.statement_date ASC, s.version DESC, s.id',
  balance_desc: 'COALESCE(s.current_balance, s.balance_due) DESC, s.statement_date DESC',
  balance_asc: 'COALESCE(s.current_balance, s.balance_due) ASC, s.statement_date DESC',
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');
const listSchema = z.object({
  clinicId: z.string().optional(),
  q: z.string().trim().max(100).optional().default(''),
  from: isoDate.optional().or(z.literal('')).default(''),
  to: isoDate.optional().or(z.literal('')).default(''),
  sort: z.enum(Object.keys(SORTS)).optional().default('name_asc'),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
  status: z.enum(['active', 'withdrawn', 'all']).optional().default('active'),
});

export function remarkView(r) {
  return {
    id: String(r.id),
    type: r.type,
    body: r.body,
    authorName: r.author_name,
    authorRole: r.author_role,
    insuranceName: r.insurance_name,
    insuranceReference: r.insurance_reference,
    createdAt: r.created_at,
  };
}

// --- P1: list and search (F9) ------------------------------------------------
statementsRouter.get('/', async (req, res) => {
  const f = parseOrThrow(listSchema, req.query);
  if (f.from && f.to && f.from > f.to) {
    throw badRequest("The 'from' date must be before the 'to' date.", { from: "The 'from' date must be before the 'to' date." });
  }

  // Clinic users always see their own clinic; staff choose one of theirs.
  const clinicId = req.user.role === 'clinic_user' ? req.user.clinic_id : f.clinicId;
  const clinic = await getVisibleClinic(pool, req, clinicId);

  const params = [clinic.id];
  const where = ['s.clinic_id = $1', statementScope(req.user, 's', params)];
  if (req.user.role !== 'clinic_user' && f.status !== 'all') {
    params.push(f.status);
    where.push(`s.status = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(lower(s.patient_name) LIKE $${params.length} OR lower(s.account_number) LIKE $${params.length})`);
  }
  if (f.from) {
    params.push(f.from);
    where.push(`s.statement_date >= $${params.length}`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`s.statement_date <= $${params.length}`);
  }
  const whereSql = where.join(' AND ');

  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM statement s WHERE ${whereSql}`, params);
  const total = countRows[0].total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(f.page, totalPages); // past the end shows the last page

  const { rows } = await query(
    `SELECT s.id, s.clinic_id, COALESCE(s.location_name, c.name) AS location_name,
            s.patient_name, s.account_number, s.statement_date, s.balance_due,
            s.cycle1_date, s.cycle1_balance, s.cycle1_payment,
            s.cycle2_date, s.cycle2_balance, s.cycle2_payment,
            s.cycle3_date, s.cycle3_balance, s.cycle3_payment,
            s.current_balance, s.pr_type, COALESCE(s.ledger_status, s.status) AS status,
            COALESCE((
              SELECT r.body FROM remark r JOIN statement st ON st.id = r.statement_id
               WHERE (st.id = s.id OR (st.patient_name = s.patient_name AND st.clinic_id = s.clinic_id)) AND r.type = 'specialist'
               ORDER BY r.created_at DESC, r.id DESC LIMIT 1
            ), s.us24_notes) AS us24_notes,
            COALESCE((
              SELECT r.body FROM remark r JOIN statement st ON st.id = r.statement_id
               WHERE (st.id = s.id OR (st.patient_name = s.patient_name AND st.clinic_id = s.clinic_id)) AND r.type = 'clinic'
               ORDER BY r.created_at DESC, r.id DESC LIMIT 1
            ), s.client_response) AS client_response,
            COALESCE((
              SELECT r.body FROM remark r JOIN statement st ON st.id = r.statement_id
               WHERE (st.id = s.id OR (st.patient_name = s.patient_name AND st.clinic_id = s.clinic_id)) AND r.type = 'insurance'
               ORDER BY r.created_at DESC, r.id DESC LIMIT 1
            ), s.vob_notes) AS vob_notes,
            s.last_remark_at, s.version,
            s.first_opened_by_clinic_at IS NULL AS is_new,
            s.awaiting_reply_since IS NOT NULL AS awaiting_reply,
            EXISTS (SELECT 1 FROM statement n WHERE n.supersedes_id = s.id) AS has_newer_version
       FROM statement s
       JOIN clinic c ON c.id = s.clinic_id
      WHERE ${whereSql}
      ORDER BY ${SORTS[f.sort]}
      LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
    params,
  );

  res.json({
    clinic: { id: clinic.id, name: clinic.name, code: clinic.clinic_code, isActive: clinic.is_active },
    items: rows.map((r) => ({
      id: r.id,
      location: r.location_name,
      patientName: r.patient_name,
      accountNumber: r.account_number,
      statementDate: r.statement_date,
      balanceDue: r.balance_due,
      // 1st Electronic Statement
      cycle1Date: r.cycle1_date || r.statement_date,
      cycle1Balance: r.cycle1_balance !== null && r.cycle1_balance !== undefined ? r.cycle1_balance : r.balance_due,
      cycle1Payment: r.cycle1_payment || '0.00',
      // 2nd Electronic Statement
      cycle2Date: r.cycle2_date || null,
      cycle2Balance: r.cycle2_balance !== null && r.cycle2_balance !== undefined ? r.cycle2_balance : null,
      cycle2Payment: r.cycle2_payment !== null && r.cycle2_payment !== undefined ? r.cycle2_payment : null,
      // 3rd Electronic Statement
      cycle3Date: r.cycle3_date || null,
      cycle3Balance: r.cycle3_balance !== null && r.cycle3_balance !== undefined ? r.cycle3_balance : null,
      cycle3Payment: r.cycle3_payment !== null && r.cycle3_payment !== undefined ? r.cycle3_payment : null,
      // Current Outstanding Balance & Responsibility
      currentBalance: r.current_balance !== null && r.current_balance !== undefined ? r.current_balance : r.balance_due,
      prType: r.pr_type || 'Copay',
      status: r.status,
      // Ledger Notes
      us24Notes: r.us24_notes || '',
      remarks: r.us24_notes || '',
      clientResponse: r.client_response || '',
      vobNotes: r.vob_notes || '',
      // Metadata
      lastRemarkAt: r.last_remark_at,
      version: r.version,
      isNew: r.is_new && r.status === 'active',
      awaitingReply: req.user.role === 'clinic_user' ? undefined : r.awaiting_reply,
      hasNewerVersion: r.has_newer_version,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages,
  });
});

// --- P1.5: export 17-column Excel workbook -----------------------------------
statementsRouter.get('/export', async (req, res) => {
  const f = parseOrThrow(listSchema.omit({ page: true }), req.query);
  if (f.from && f.to && f.from > f.to) {
    throw badRequest("The 'from' date must be before the 'to' date.", { from: "The 'from' date must be before the 'to' date." });
  }

  const clinicId = req.user.role === 'clinic_user' ? req.user.clinic_id : f.clinicId;
  const clinic = await getVisibleClinic(pool, req, clinicId);

  const params = [clinic.id];
  const where = ['s.clinic_id = $1', statementScope(req.user, 's', params)];
  if (req.user.role !== 'clinic_user' && f.status !== 'all') {
    params.push(f.status);
    where.push(`s.status = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
    where.push(`(lower(s.patient_name) LIKE $${params.length} OR lower(s.account_number) LIKE $${params.length})`);
  }
  if (f.from) {
    params.push(f.from);
    where.push(`s.statement_date >= $${params.length}`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`s.statement_date <= $${params.length}`);
  }
  const whereSql = where.join(' AND ');

  const { rows } = await query(
    `SELECT s.id, s.clinic_id, COALESCE(s.location_name, c.name) AS location_name,
            s.patient_name, s.account_number, s.statement_date, s.balance_due,
            s.cycle1_date, s.cycle1_balance, s.cycle1_payment,
            s.cycle2_date, s.cycle2_balance, s.cycle2_payment,
            s.cycle3_date, s.cycle3_balance, s.cycle3_payment,
            s.current_balance, s.pr_type, COALESCE(s.ledger_status, s.status) AS status,
            COALESCE((
              SELECT r.body FROM remark r JOIN statement st ON st.id = r.statement_id
               WHERE (st.id = s.id OR (st.patient_name = s.patient_name AND st.clinic_id = s.clinic_id)) AND r.type = 'specialist'
               ORDER BY r.created_at DESC, r.id DESC LIMIT 1
            ), s.us24_notes) AS us24_notes,
            COALESCE((
              SELECT r.body FROM remark r JOIN statement st ON st.id = r.statement_id
               WHERE (st.id = s.id OR (st.patient_name = s.patient_name AND st.clinic_id = s.clinic_id)) AND r.type = 'clinic'
               ORDER BY r.created_at DESC, r.id DESC LIMIT 1
            ), s.client_response) AS client_response,
            COALESCE((
              SELECT r.body FROM remark r JOIN statement st ON st.id = r.statement_id
               WHERE (st.id = s.id OR (st.patient_name = s.patient_name AND st.clinic_id = s.clinic_id)) AND r.type = 'insurance'
               ORDER BY r.created_at DESC, r.id DESC LIMIT 1
            ), s.vob_notes) AS vob_notes
       FROM statement s
       JOIN clinic c ON c.id = s.clinic_id
      WHERE ${whereSql}
      ORDER BY ${SORTS[f.sort]}
      LIMIT 10000`,
    params,
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'US24 Solutions';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Patient Statements');

  sheet.columns = [
    { header: 'LOCATION', key: 'location', width: 22 },
    { header: 'PATIENT NAME', key: 'patientName', width: 26 },
    { header: '1ST ELECTRONIC STATEMENT', key: 'cycle1Date', width: 22 },
    { header: 'BALANCE DUE AMOUNT', key: 'cycle1Balance', width: 18 },
    { header: 'PAYMENT RECEIVED', key: 'cycle1Payment', width: 18 },
    { header: '2ND ELECTRONIC STATEMENT', key: 'cycle2Date', width: 22 },
    { header: 'BALANCE DUE AMOUNT', key: 'cycle2Balance', width: 18 },
    { header: 'PAYMENT RECEIVED', key: 'cycle2Payment', width: 18 },
    { header: '3RD ELECTRONIC STATEMENT', key: 'cycle3Date', width: 22 },
    { header: 'BALANCE DUE AMOUNT', key: 'cycle3Balance', width: 18 },
    { header: 'PAYMENT RECEIVED', key: 'cycle3Payment', width: 18 },
    { header: 'CURRENT OUTSTANDING BALANCE', key: 'currentBalance', width: 26 },
    { header: 'PR TYPE', key: 'prType', width: 14 },
    { header: 'US24 NOTES', key: 'us24Notes', width: 36 },
    { header: 'CLIENT RESPONSE', key: 'clientResponse', width: 36 },
    { header: 'AS PER VOB- NOTES', key: 'vobNotes', width: 36 },
    { header: 'STATUS', key: 'status', width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1D4ED8' },
    };
    cell.font = {
      name: 'Calibri',
      size: 10,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: 'center',
      wrapText: true,
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1E40AF' } },
      left: { style: 'thin', color: { argb: 'FF1E40AF' } },
      bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
      right: { style: 'thin', color: { argb: 'FF1E40AF' } },
    };
  });

  const moneyCols = [4, 5, 7, 8, 10, 11, 12];
  const dateCols = [3, 6, 9];

  rows.forEach((r) => {
    const row = sheet.addRow({
      location: r.location_name,
      patientName: r.patient_name,
      cycle1Date: r.cycle1_date || r.statement_date,
      cycle1Balance: r.cycle1_balance !== null && r.cycle1_balance !== undefined ? Number(r.cycle1_balance) : Number(r.balance_due),
      cycle1Payment: r.cycle1_payment !== null && r.cycle1_payment !== undefined ? Number(r.cycle1_payment) : 0,
      cycle2Date: r.cycle2_date || '',
      cycle2Balance: r.cycle2_balance !== null && r.cycle2_balance !== undefined ? Number(r.cycle2_balance) : '',
      cycle2Payment: r.cycle2_payment !== null && r.cycle2_payment !== undefined ? Number(r.cycle2_payment) : '',
      cycle3Date: r.cycle3_date || '',
      cycle3Balance: r.cycle3_balance !== null && r.cycle3_balance !== undefined ? Number(r.cycle3_balance) : '',
      cycle3Payment: r.cycle3_payment !== null && r.cycle3_payment !== undefined ? Number(r.cycle3_payment) : '',
      currentBalance: r.current_balance !== null && r.current_balance !== undefined ? Number(r.current_balance) : Number(r.balance_due),
      prType: r.pr_type || 'Copay',
      us24Notes: r.us24_notes || '',
      clientResponse: r.client_response || '',
      vobNotes: r.vob_notes || '',
      status: r.status === 'withdrawn' ? 'Withdrawn' : 'Active',
    });

    row.height = 24;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10 };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };
      if (moneyCols.includes(colNumber)) {
        if (typeof cell.value === 'number') {
          cell.numFmt = '$#,##0.00;($#,##0.00);"$0.00"';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      } else if (dateCols.includes(colNumber)) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colNumber === 13 || colNumber === 17) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  await audit(pool, req, {
    action: 'statement.download',
    targetType: 'clinic',
    targetId: clinic.id,
    clinicId: clinic.id,
    details: { format: 'excel', rows_count: rows.length, clinic_code: clinic.clinic_code },
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const safeClinicName = (clinic.name || 'clinic').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const filename = `${safeClinicName}-patient-statements-${new Date().toISOString().slice(0, 10)}.xlsx`;

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
});

// --- P2: detail with remarks (F10, F11) --------------------------------------
statementsRouter.get('/:id', async (req, res) => {
  const result = await withTransaction(async (db) => {
    const s = await getVisibleStatement(db, req, req.params.id);
    await audit(db, req, { action: 'statement.view', targetType: 'statement', targetId: s.id, clinicId: s.clinic_id });
    let wasNew = false;
    if (req.user.role === 'clinic_user' && !s.first_opened_by_clinic_at) {
      const upd = await db.query(
        'UPDATE statement SET first_opened_by_clinic_at = now() WHERE id = $1 AND first_opened_by_clinic_at IS NULL',
        [s.id],
      );
      wasNew = upd.rowCount === 1;
    }

    const [clinic, file, remarks, people, others] = await Promise.all([
      db.query('SELECT * FROM clinic WHERE id = $1', [s.clinic_id]),
      db.query('SELECT original_filename, size_bytes FROM statement_file WHERE statement_id = $1', [s.id]),
      db.query(
        `SELECT r.*, u.full_name AS author_name FROM remark r JOIN app_user u ON u.id = r.author_id
          WHERE r.statement_id = $1 ORDER BY r.created_at, r.id`,
        [s.id],
      ),
      db.query('SELECT id, full_name FROM app_user WHERE id = ANY($1::uuid[])', [[s.uploaded_by_id, s.withdrawn_by_id].filter(Boolean)]),
      (() => {
        const params = [s.clinic_id, s.account_number, s.id];
        const scope = statementScope(req.user, 'o', params);
        return db.query(
          `SELECT o.id, o.statement_date, o.balance_due, o.version, o.status, o.supersedes_id
             FROM statement o
            WHERE o.clinic_id = $1 AND o.account_number = $2 AND o.id <> $3 AND ${scope}
            ORDER BY o.statement_date DESC, o.version DESC LIMIT 50`,
          params,
        );
      })(),
    ]);
    const nameOf = Object.fromEntries(people.rows.map((p) => [p.id, p.full_name]));
    const newer = others.rows.find((o) => o.supersedes_id === s.id);
    const earlier = others.rows.find((o) => o.id === s.supersedes_id);
    const c = clinic.rows[0];

    return {
      statement: {
        id: s.id,
        patientName: s.patient_name,
        patient_name: s.patient_name,
        accountNumber: s.account_number,
        account_number: s.account_number,
        locationName: s.location_name,
        location_name: s.location_name,
        statementDate: s.statement_date,
        statement_date: s.statement_date,
        balanceDue: s.balance_due,
        balance_due: s.balance_due,
        cycle1Date: s.cycle1_date || s.statement_date,
        cycle1_date: s.cycle1_date || s.statement_date,
        cycle1Balance: s.cycle1_balance ?? s.balance_due,
        cycle1_balance: s.cycle1_balance ?? s.balance_due,
        cycle1Payment: s.cycle1_payment ?? '0.00',
        cycle1_payment: s.cycle1_payment ?? '0.00',
        cycle2Date: s.cycle2_date ?? null,
        cycle2_date: s.cycle2_date ?? null,
        cycle2Balance: s.cycle2_balance ?? null,
        cycle2_balance: s.cycle2_balance ?? null,
        cycle2Payment: s.cycle2_payment ?? null,
        cycle2_payment: s.cycle2_payment ?? null,
        cycle3Date: s.cycle3_date ?? null,
        cycle3_date: s.cycle3_date ?? null,
        cycle3Balance: s.cycle3_balance ?? null,
        cycle3_balance: s.cycle3_balance ?? null,
        cycle3Payment: s.cycle3_payment ?? null,
        cycle3_payment: s.cycle3_payment ?? null,
        currentBalance: s.current_balance ?? s.balance_due,
        current_balance: s.current_balance ?? s.balance_due,
        prType: s.pr_type ?? 'Patient',
        pr_type: s.pr_type ?? 'Patient',
        us24Notes: s.us24_notes ?? '',
        us24_notes: s.us24_notes ?? '',
        remarks: s.us24_notes ?? '',
        clientResponse: s.client_response ?? '',
        client_response: s.client_response ?? '',
        vobNotes: s.vob_notes ?? '',
        vob_notes: s.vob_notes ?? '',
        patientDob: s.patient_dob,
        serviceDateFrom: s.service_date_from,
        serviceDateTo: s.service_date_to,
        cptCodes: s.cpt_codes ?? [],
        billedAmount: s.billed_amount,
        insurancePaid: s.insurance_paid,
        adjustments: s.adjustments,
        insuranceName: s.insurance_name,
        source: s.source,
        version: s.version,
        status: s.status,
        ledgerStatus: s.ledger_status || s.status,
        withdrawnAt: s.withdrawn_at,
        withdrawnByName: s.withdrawn_by_id ? nameOf[s.withdrawn_by_id] : null,
        // Withdrawal reasons may contain PHI and are for staff only.
        withdrawalReason: req.user.role === 'clinic_user' ? null : s.withdrawal_reason,
        uploadedAt: s.uploaded_at,
        uploadedByName: nameOf[s.uploaded_by_id],
        wasNew,
        file: file.rows[0] ? { name: file.rows[0].original_filename, sizeBytes: file.rows[0].size_bytes } : null,
        earlierVersionId: earlier?.id ?? null,
        newerVersionId: newer?.id ?? null,
      },
      clinic: {
        id: c.id, name: c.name, code: c.clinic_code, addressLine1: c.address_line1, addressLine2: c.address_line2,
        city: c.city, state: c.state, postalCode: c.postal_code, phone: c.contact_phone,
      },
      remarks: remarks.rows.length > 0
        ? remarks.rows.map(remarkView)
        : (s.us24_notes ? [{
            id: 'initial',
            type: 'specialist',
            body: s.us24_notes,
            authorName: nameOf[s.uploaded_by_id] || 'US24 Specialist',
            authorRole: 'specialist',
            insuranceName: null,
            insuranceReference: null,
            createdAt: s.uploaded_at,
          }] : []),
      otherStatements: others.rows.map((o) => ({
        id: o.id, statementDate: o.statement_date, balanceDue: o.balance_due, version: o.version, status: o.status,
      })),
    };
  });
  res.json(result);
});

// --- Files: inline view, download, print (F12) -------------------------------
async function loadForFile(req, action, details) {
  // The audit entry commits before any content leaves (schema T10).
  return withTransaction(async (db) => {
    const s = await getVisibleStatement(db, req, req.params.id);
    await audit(db, req, { action, targetType: 'statement', targetId: s.id, clinicId: s.clinic_id, details });
    return s;
  });
}

async function readStatementFile(s) {
  const { rows } = await query('SELECT storage_key, sha256 FROM statement_file WHERE statement_id = $1', [s.id]);
  if (!rows[0]) return null;
  const buffer = await storage.get(rows[0].storage_key);
  if (sha256Hex(buffer) !== rows[0].sha256) throw new HttpError(500, 'The stored file failed its integrity check.');
  return buffer;
}

statementsRouter.get('/:id/file', async (req, res) => {
  const s = await loadForFile(req, 'statement.view', { part: 'pdf' });
  let buffer = s.source === 'pdf_upload' ? await readStatementFile(s) : null;
  if (!buffer) {
    const { rows } = await query('SELECT * FROM clinic WHERE id = $1', [s.clinic_id]);
    buffer = await renderStatementPdf(s, rows[0]);
  }
  if (!buffer) throw new HttpError(404, 'This statement has no PDF available.');
  // This one response may be shown inside the portal's own page (implementation plan C-2).
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'");
  res.type('application/pdf').set('Content-Disposition', 'inline; filename="statement.pdf"').send(buffer);
});

statementsRouter.get('/:id/download', async (req, res) => {
  const s = await loadForFile(req, 'statement.download');
  let buffer = s.source === 'pdf_upload' ? await readStatementFile(s) : null;
  if (!buffer) {
    const { rows } = await query('SELECT * FROM clinic WHERE id = $1', [s.clinic_id]);
    buffer = await renderStatementPdf(s, rows[0]);
  }
  // No patient name in the file name (schema Q-7).
  res.type('application/pdf')
    .set('Content-Disposition', `attachment; filename="statement-${s.statement_date}.pdf"`)
    .send(buffer);
});

statementsRouter.post('/:id/print', async (req, res) => {
  const includeRemarks = Boolean(req.body?.includeRemarks);
  await loadForFile(req, 'statement.print', { include_remarks: includeRemarks });
  res.json({ ok: true });
});

// --- Remarks (F11) -------------------------------------------------------------
const remarkSchema = z
  .object({
    type: z.enum(['clinic', 'specialist', 'insurance']),
    body: z.string().trim().min(1, 'Enter a remark.').max(2000, 'Remarks are limited to 2,000 characters.'),
    insuranceName: z.string().trim().max(200).optional().default(''),
    insuranceReference: z.string().trim().max(100).optional().default(''),
  })
  .refine((v) => v.type !== 'insurance' || v.insuranceName.length > 0, {
    message: 'Enter the insurance company name.',
    path: ['insuranceName'],
  });

statementsRouter.post('/:id/remarks', requireRole('clinic_user', 'specialist'), async (req, res) => {
  const input = parseOrThrow(remarkSchema, {
    ...req.body,
    type: req.user.role === 'clinic_user' ? 'clinic' : req.body?.type,
  });
  if (req.user.role === 'specialist' && input.type === 'clinic') throw badRequest('Choose Specialist or Insurance.');

  const remark = await withTransaction(async (db) => {
    const s = await getVisibleStatement(db, req, req.params.id, { forUpdate: true });
    if (s.status?.toLowerCase() === 'withdrawn') throw conflict('Remarks cannot be added to a withdrawn statement.');
    const isInsurance = input.type === 'insurance';
    const r = await insertRemark(db, {
      statementId: s.id,
      author: req.user,
      type: input.type,
      body: input.body,
      insuranceName: isInsurance ? input.insuranceName : null,
      insuranceReference: isInsurance && input.insuranceReference ? input.insuranceReference : null,
    });
    await audit(db, req, {
      action: 'remark.create', targetType: 'remark', targetId: r.id, clinicId: s.clinic_id, details: { remark_type: input.type },
    });
    return {
      id: r.id, type: input.type, body: input.body, author_name: req.user.full_name, author_role: req.user.role,
      insurance_name: isInsurance ? input.insuranceName : null,
      insurance_reference: isInsurance ? input.insuranceReference || null : null, created_at: r.created_at,
    };
  });
  res.status(201).json({ remark: remarkView(remark) });
});

// --- D1: withdraw (FR-10.4) ----------------------------------------------------
statementsRouter.post('/:id/withdraw', requireRole('specialist'), async (req, res) => {
  const { reason } = parseOrThrow(
    z.object({ reason: z.string().trim().min(1, 'Enter a reason.').max(1000, 'Use 1,000 characters or fewer.') }),
    req.body ?? {},
  );
  await withTransaction(async (db) => {
    const s = await getVisibleStatement(db, req, req.params.id, { forUpdate: true });
    if (s.status === 'withdrawn') throw conflict('This statement was already withdrawn.');
    await db.query(
      `UPDATE statement SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by_id = $2, withdrawal_reason = $3,
              awaiting_reply_since = NULL
        WHERE id = $1`,
      [s.id, req.user.id, reason],
    );
    await audit(db, req, { action: 'statement.withdraw', targetType: 'statement', targetId: s.id, clinicId: s.clinic_id });
  });
  res.json({ ok: true });
});
