import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireRole } from '../middleware/guards.js';

export const dashboardRouter = Router();

// C1: clinic home, with the count of unopened statements (N4) and total active statements.
dashboardRouter.get('/home', requireRole('clinic_user'), async (req, res) => {
  const { rows } = await query(
    `SELECT count(*)::int AS total_count,
            count(*) FILTER (WHERE first_opened_by_clinic_at IS NULL)::int AS new_count
       FROM statement
      WHERE clinic_id = $1 AND status = 'active'`,
    [req.user.clinic_id],
  );
  res.json({
    clinic: { id: req.user.clinic_id, name: req.user.clinic_name, code: req.user.clinic_code },
    totalCount: rows[0]?.total_count || 0,
    newCount: rows[0]?.new_count || 0,
  });
});

// S1: specialist dashboard (FR-5.1).
dashboardRouter.get('/dashboard', requireRole('specialist'), async (req, res) => {
  const me = req.user.id;
  const [clinics, uploads, imports, unanswered] = await Promise.all([
    query(
      `SELECT c.id, c.name, c.clinic_code, c.is_active,
              count(s.id) FILTER (WHERE s.status = 'active')::int AS statement_count,
              count(s.id) FILTER (WHERE s.status = 'active' AND s.first_opened_by_clinic_at IS NULL)::int AS unopened_count,
              count(s.id) FILTER (WHERE s.status = 'active' AND s.awaiting_reply_since IS NOT NULL)::int AS awaiting_count
         FROM specialist_assignment a
         JOIN clinic c ON c.id = a.clinic_id
         LEFT JOIN statement s ON s.clinic_id = c.id
        WHERE a.specialist_id = $1
        GROUP BY c.id
        ORDER BY c.is_active DESC, lower(c.name)`,
      [me],
    ),
    query(
      `SELECT s.id, s.uploaded_at, s.patient_name, s.account_number, s.status, c.name AS clinic_name
         FROM statement s JOIN clinic c ON c.id = s.clinic_id
        WHERE s.uploaded_by_id = $1 AND s.source = 'pdf_upload'
          AND s.clinic_id IN (SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $1)
        ORDER BY s.uploaded_at DESC LIMIT 10`,
      [me],
    ),
    query(
      `SELECT b.id, b.created_at, b.original_filename, b.status, b.total_rows, b.published_rows,
              b.published_new_versions, b.invalid_rows, b.skipped_duplicates, c.name AS clinic_name
         FROM import_batch b JOIN clinic c ON c.id = b.clinic_id
        WHERE b.specialist_id = $1
          AND b.clinic_id IN (SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $1)
        ORDER BY b.created_at DESC LIMIT 10`,
      [me],
    ),
    query(
      `SELECT s.id, s.patient_name, s.account_number, c.name AS clinic_name,
              r.body, r.author_name, r.created_at
         FROM statement s
         JOIN clinic c ON c.id = s.clinic_id
         JOIN LATERAL (
           SELECT rm.body, u.full_name AS author_name, rm.created_at
             FROM remark rm JOIN app_user u ON u.id = rm.author_id
            WHERE rm.statement_id = s.id AND rm.type = 'clinic'
            ORDER BY rm.created_at DESC, rm.id DESC LIMIT 1
         ) r ON true
        WHERE s.awaiting_reply_since IS NOT NULL AND s.status = 'active'
          AND s.clinic_id IN (SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $1)
        ORDER BY r.created_at DESC LIMIT 50`,
      [me],
    ),
  ]);

  const recent = [
    ...uploads.rows.map((u) => ({
      kind: 'upload',
      id: u.id,
      at: u.uploaded_at,
      clinicName: u.clinic_name,
      status: u.status === 'withdrawn' ? 'withdrawn' : 'published',
      label: `${u.patient_name} · ${u.account_number}`,
    })),
    ...imports.rows.map((b) => ({
      kind: 'import',
      id: b.id,
      at: b.created_at,
      clinicName: b.clinic_name,
      status: b.status,
      label: b.original_filename,
      counts: {
        total: b.total_rows,
        published: (b.published_rows ?? 0) + (b.published_new_versions ?? 0),
        failed: b.invalid_rows,
        skipped: b.skipped_duplicates,
      },
    })),
  ]
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .slice(0, 12);

  res.json({
    clinics: clinics.rows.map((c) => ({
      id: c.id, name: c.name, code: c.clinic_code, isActive: c.is_active,
      statementCount: c.statement_count, unopenedCount: c.unopened_count, awaitingCount: c.awaiting_count,
    })),
    recent,
    unanswered: unanswered.rows.map((u) => ({
      statementId: u.id, patientName: u.patient_name, accountNumber: u.account_number, clinicName: u.clinic_name,
      excerpt: u.body.length > 160 ? `${u.body.slice(0, 157)}…` : u.body, authorName: u.author_name, createdAt: u.created_at,
    })),
  });
});

// Clinics a specialist can publish to: assigned and active (S2, S4 pickers).
dashboardRouter.get('/publishable-clinics', requireRole('specialist'), async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.name, c.clinic_code FROM specialist_assignment a JOIN clinic c ON c.id = a.clinic_id
      WHERE a.specialist_id = $1 AND c.is_active ORDER BY lower(c.name)`,
    [req.user.id],
  );
  res.json({ clinics: rows.map((c) => ({ id: c.id, name: c.name, code: c.clinic_code })) });
});
