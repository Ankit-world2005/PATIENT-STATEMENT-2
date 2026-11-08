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
 *   Shows all statement updates, specialist replies, collection reports, and row remarks/flags for their clinic.
 *
 * - Specialists (role === 'specialist'):
 *   STRICTLY LOCKED to clinics they are actively assigned to via specialist_assignment.
 *
 * - Admins (role === 'admin'):
 *   Platform oversight over active clinics, with optional ?clinicId= filter for a specific clinic.
 */
notificationsRouter.get('/', async (req, res) => {
  try {
    const { role, clinic_id: userClinicId, id: userId } = req.user;
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const filterClinicId = req.query.clinicId;

    let items = [];

    if (role === 'clinic_user') {
      // Multi-tenant check: if user has no assigned clinic, return empty immediately
      if (!userClinicId) {
        return res.json({ notifications: [], totalCount: 0 });
      }

      // 1. Specialist replies for this clinic's statements
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

      const statementItems = [...replies, ...inquiries].map((r) => ({
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

      // 3. Collection reports & row updates for this clinic
      const { rows: collections } = await query(
        `SELECT col.id, col.clinic_id, col.report_title, col.month_year, col.raw_file_name,
                col.check_sheet, col.line_items, col.created_at, c.name AS clinic_name
         FROM clinic_collection col
         JOIN clinic c ON c.id = col.clinic_id
         WHERE col.clinic_id = $1
         ORDER BY col.created_at DESC
         LIMIT 6`,
        [userClinicId],
      );

      const collectionItems = [];
      for (const col of collections) {
        collectionItems.push({
          id: `col-up-${col.id}`,
          statementId: null,
          type: 'collection_upload',
          title: 'Collection Report Posted',
          patientName: col.report_title || 'Collection Report',
          accountNumber: col.month_year || '',
          clinicName: col.clinic_name,
          authorName: 'US24 Billing Specialist',
          body: `Remittance report "${col.report_title || 'Report'}" (${col.month_year || ''}) is available.`,
          createdAt: col.created_at,
          isAwaiting: false,
          link: '/collections',
        });

        // Extract row remarks, logs & flags from check_sheet
        const checks = Array.isArray(col.check_sheet) ? col.check_sheet : [];
        for (const row of checks) {
          if (Array.isArray(row.logs) && row.logs.length > 0) {
            for (const l of row.logs) {
              collectionItems.push({
                id: `col-log-${l.id}`,
                statementId: null,
                type: l.isRemark ? 'collection_remark' : l.isAudit ? 'collection_flag' : 'collection_note',
                title: l.isRemark ? 'Collection Remark Added' : l.isAudit ? 'Collection Flag Update' : 'Collection Note',
                patientName: row.payer || row.payee || 'Remittance Record',
                accountNumber: row.paymentReference || row.checkNo || '',
                clinicName: col.clinic_name,
                authorName: l.author || 'User',
                body: l.text || (row.remarks ? `Remarks: ${row.remarks}` : ''),
                createdAt: l.createdAt || col.created_at,
                isAwaiting: false,
                link: '/collections',
              });
            }
          }
        }
      }

      items = [...statementItems, ...collectionItems]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

    } else {
      // Specialist or Admin
      const whereClauses = [
        "r.type = 'clinic'",
        "st.status = 'active'",
        "c.is_active = true",
      ];
      const params = [];

      if (role === 'specialist') {
        params.push(userId);
        whereClauses.push(
          `EXISTS (SELECT 1 FROM specialist_assignment sa WHERE sa.specialist_id = $${params.length} AND sa.clinic_id = c.id)`,
        );
      }

      if (filterClinicId) {
        params.push(filterClinicId);
        whereClauses.push(`c.id = $${params.length}`);
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

      const statementItems = rows.map((r) => ({
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

      // Fetch collection updates for admin / specialist
      let colSql = `
        SELECT col.id, col.clinic_id, col.report_title, col.month_year, col.raw_file_name,
               col.check_sheet, col.line_items, col.created_at, c.name AS clinic_name
        FROM clinic_collection col
        JOIN clinic c ON c.id = col.clinic_id
      `;
      const colParams = [];
      const colWhere = ['c.is_active = true'];

      if (role === 'specialist') {
        colParams.push(userId);
        colWhere.push(
          `EXISTS (SELECT 1 FROM specialist_assignment sa WHERE sa.specialist_id = $${colParams.length} AND sa.clinic_id = c.id)`
        );
      }
      if (filterClinicId) {
        colParams.push(filterClinicId);
        colWhere.push(`c.id = $${colParams.length}`);
      }

      colSql += ` WHERE ${colWhere.join(' AND ')} ORDER BY col.created_at DESC LIMIT 6`;
      const { rows: collections } = await query(colSql, colParams);

      const collectionItems = [];
      for (const col of collections) {
        collectionItems.push({
          id: `col-up-${col.id}`,
          statementId: null,
          type: 'collection_upload',
          title: 'Collection Report Posted',
          patientName: col.report_title || 'Collection Report',
          accountNumber: col.month_year || '',
          clinicName: col.clinic_name,
          authorName: 'Billing Team',
          body: `Remittance report "${col.report_title || 'Report'}" (${col.month_year || ''}) has been posted.`,
          createdAt: col.created_at,
          isAwaiting: false,
          link: `/manage/collections?clinicId=${col.clinic_id}`,
        });

        const checks = Array.isArray(col.check_sheet) ? col.check_sheet : [];
        for (const row of checks) {
          if (Array.isArray(row.logs) && row.logs.length > 0) {
            for (const l of row.logs) {
              collectionItems.push({
                id: `col-log-${l.id}`,
                statementId: null,
                type: l.isRemark ? 'collection_remark' : l.isAudit ? 'collection_flag' : 'collection_note',
                title: l.isRemark ? 'Collection Remark Added' : l.isAudit ? 'Collection Flag' : 'Collection Note',
                patientName: row.payer || row.payee || 'Remittance Record',
                accountNumber: row.paymentReference || row.checkNo || '',
                clinicName: col.clinic_name,
                authorName: l.author || 'User',
                body: l.text || '',
                createdAt: l.createdAt || col.created_at,
                isAwaiting: false,
                link: `/manage/collections?clinicId=${col.clinic_id}`,
              });
            }
          }
        }
      }

      items = [...statementItems, ...collectionItems]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);
    }

    res.json({
      notifications: items,
      totalCount: items.length,
    });
  } catch (err) {
    console.error('[notifications] Failed to load notifications:', err);
    res.json({
      notifications: [],
      totalCount: 0,
      warning: 'Notifications could not be loaded at this time.',
    });
  }
});
