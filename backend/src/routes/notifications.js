import { Router } from 'express';
import { query } from '../db/pool.js';
import { requireVerified } from '../middleware/guards.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireVerified);

/**
 * GET /api/notifications
 * 
 * Strict Multi-Tenant Privacy Isolation:
 * - Clinic users (role === 'clinic_user'):
 *   STRICTLY LOCKED to req.user.clinic_id.
 *   They can ONLY see notifications (specialist replies, status alerts) for statements
 *   belonging to their own clinic. They can NEVER see, query, or infer data from another clinic.
 * 
 * - Specialists (role === 'specialist'):
 *   STRICTLY LOCKED to clinics they are actively assigned to via specialist_assignment.
 *   They can NEVER receive notifications for clinics they are not assigned to.
 * 
 * - Admins (role === 'admin'):
 *   Platform oversight over active clinics only.
 */
notificationsRouter.get('/', async (req, res) => {
  const { role, clinic_id: userClinicId, id: userId } = req.user;
  const limit = Math.min(Math.max(Number(req.query.limit) || 15, 1), 50);

  let items = [];

  if (role === 'clinic_user') {
    // Multi-tenant check: if user has no assigned clinic, return empty immediately
    if (!userClinicId) {
      return res.json({ notifications: [], totalCount: 0 });
    }

    // 1. Specialist replies for this clinic's statements only
    const { rows: replies } = await query(
      `SELECT
        r.id,
        r.statement_id,
        r.type,
        r.body,
        r.created_at,
        COALESCE(u.full_name, 'US24 Specialist') AS author_name,
        st.patient_name,
        st.account_number,
        st.awaiting_reply_since,
        c.id AS clinic_id,
        c.name AS clinic_name
       FROM remark r
       JOIN statement st ON st.id = r.statement_id
       JOIN clinic c ON c.id = st.clinic_id
       LEFT JOIN app_user u ON u.id = r.author_id
      WHERE st.clinic_id = $1 
        AND c.id = $1 
        AND st.status = 'active'
        AND c.is_active = true
        AND r.type = 'specialist'
      ORDER BY r.created_at DESC
      LIMIT $2`,
      [userClinicId, limit],
    );

    // 2. Inquiries and requests initiated by this clinic
    const { rows: inquiries } = await query(
      `SELECT
        r.id,
        r.statement_id,
        r.type,
        r.body,
        r.created_at,
        COALESCE(u.full_name, c.name) AS author_name,
        st.patient_name,
        st.account_number,
        st.awaiting_reply_since,
        c.id AS clinic_id,
        c.name AS clinic_name
       FROM remark r
       JOIN statement st ON st.id = r.statement_id
       JOIN clinic c ON c.id = st.clinic_id
       LEFT JOIN app_user u ON u.id = r.author_id
      WHERE st.clinic_id = $1 
        AND c.id = $1 
        AND st.status = 'active'
        AND c.is_active = true
        AND r.type = 'clinic'
      ORDER BY r.created_at DESC
      LIMIT $2`,
      [userClinicId, limit],
    );

    // Combine and order chronologically (newest first)
    const combined = [...replies, ...inquiries]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, limit);

    items = combined.map((r) => ({
      id: String(r.id),
      statementId: r.statement_id,
      type: r.type === 'specialist' ? 'reply' : 'request',
      title: r.type === 'specialist' ? 'Specialist Replied' : 'Your Clinic Inquiry',
      patientName: r.patient_name || 'Patient',
      accountNumber: r.account_number || '',
      clinicName: r.clinic_name || '',
      authorName: r.author_name,
      body: r.body || '',
      createdAt: r.created_at,
      isAwaiting: Boolean(r.awaiting_reply_since),
      link: '/requests',
    }));
  } else {
    // Specialist or Admin: clinic inquiries and statements needing replies
    const whereClauses = [
      "r.type = 'clinic'",
      "st.status = 'active'",
      "c.is_active = true",
    ];
    const params = [];

    if (role === 'specialist') {
      params.push(userId);
      // Strictly isolate to clinics assigned to this specialist
      whereClauses.push(
        `EXISTS (SELECT 1 FROM specialist_assignment sa WHERE sa.specialist_id = $${params.length} AND sa.clinic_id = c.id)`,
      );
    }

    params.push(limit);
    const sql = `
      SELECT
        r.id,
        r.statement_id,
        r.type,
        r.body,
        r.created_at,
        COALESCE(u.full_name, c.name) AS author_name,
        st.patient_name,
        st.account_number,
        st.awaiting_reply_since,
        c.id AS clinic_id,
        c.name AS clinic_name
       FROM remark r
       JOIN statement st ON st.id = r.statement_id
       JOIN clinic c ON c.id = st.clinic_id
       LEFT JOIN app_user u ON u.id = r.author_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY r.created_at DESC
      LIMIT $${params.length}
    `;

    const { rows } = await query(sql, params);

    items = rows.map((r) => ({
      id: String(r.id),
      statementId: r.statement_id,
      type: 'request',
      title: r.awaiting_reply_since ? 'Inquiry Awaiting Reply' : 'Clinic Inquiry',
      patientName: r.patient_name || 'Patient',
      accountNumber: r.account_number || '',
      clinicName: r.clinic_name || '',
      authorName: r.author_name,
      body: r.body || '',
      createdAt: r.created_at,
      isAwaiting: Boolean(r.awaiting_reply_since),
      link: '/requests',
    }));
  }

  res.json({
    notifications: items,
    totalCount: items.length,
  });
});
