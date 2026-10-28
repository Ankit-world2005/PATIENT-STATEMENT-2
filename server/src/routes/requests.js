import { Router } from 'express';
import { z } from 'zod';
import { pool, query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { HttpError, badRequest, notFound, parseOrThrow } from '../lib/errors.js';
import { isUuid } from '../services/access.js';
import { insertRemark } from '../services/statements.js';

export const requestsRouter = Router();

// Helper to determine clinic scope based on user role
function getUserClinicScope(user) {
  if (user.role === 'clinic_user') {
    return { sql: 'st.clinic_id = $1', params: [user.clinic_id] };
  }
  if (user.role === 'specialist') {
    return {
      sql: 'st.clinic_id IN (SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $1)',
      params: [user.id],
    };
  }
  // admin
  return { sql: 'TRUE', params: [] };
}

// GET /api/requests/statements — Search recent statements for the "+ New Request" modal
requestsRouter.get('/statements', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(25, Math.max(5, parseInt(req.query.limit || '15', 10)));

  const scope = getUserClinicScope(req.user);
  const where = ['st.status = \'active\'', scope.sql];
  const params = [...scope.params];

  if (req.query.clinicId && isUuid(req.query.clinicId) && req.user.role !== 'clinic_user') {
    params.push(req.query.clinicId);
    where.push(`st.clinic_id = $${params.length}`);
  }

  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    where.push(`(lower(st.patient_name) LIKE $${params.length} OR lower(st.account_number) LIKE $${params.length})`);
  }

  params.push(limit);
  const sql = `
    SELECT st.id, st.patient_name, st.account_number, st.statement_date,
           COALESCE(st.current_balance, st.cycle1_balance, st.balance_due) AS current_balance,
           c.name AS clinic_name, c.clinic_code
      FROM statement st
      JOIN clinic c ON c.id = st.clinic_id
     WHERE ${where.join(' AND ')}
     ORDER BY st.statement_date DESC, lower(st.patient_name) ASC
     LIMIT $${params.length}
  `;

  const { rows } = await query(sql, params);
  res.json({
    statements: rows.map((r) => ({
      id: r.id,
      patientName: r.patient_name,
      accountNumber: r.account_number,
      statementDate: r.statement_date,
      currentBalance: r.current_balance,
      clinicName: r.clinic_name,
      clinicCode: r.clinic_code,
    })),
  });
});

// GET /api/requests — List all client requests with status, filters, and replies
requestsRouter.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 100);
  const clinicId = req.query.clinicId ? String(req.query.clinicId) : null;
  const status = ['awaiting', 'answered', 'all'].includes(req.query.status) ? req.query.status : 'all';
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const scope = getUserClinicScope(req.user);
  const where = ['TRUE', scope.sql];
  const params = [...scope.params];

  if (clinicId && isUuid(clinicId) && req.user.role !== 'clinic_user') {
    params.push(clinicId);
    where.push(`st.clinic_id = $${params.length}`);
  }

  if (status === 'awaiting') {
    where.push('st.awaiting_reply_since IS NOT NULL');
  } else if (status === 'answered') {
    where.push('st.awaiting_reply_since IS NULL');
  }

  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    where.push(`(lower(st.patient_name) LIKE $${params.length} OR lower(st.account_number) LIKE $${params.length} OR lower(r.body) LIKE $${params.length} OR lower(c.name) LIKE $${params.length})`);
  }

  // Count query
  const countSql = `
    SELECT count(*)::int AS total
      FROM remark r
      JOIN statement st ON st.id = r.statement_id
      JOIN clinic c ON c.id = st.clinic_id
     WHERE ${where.join(' AND ')}
  `;
  const { rows: countRows } = await query(countSql, params);
  const total = countRows[0]?.total || 0;

  // Stat metrics query
  const statParams = [...scope.params];
  const statSql = `
    SELECT
      count(*)::int AS total_requests,
      count(*) FILTER (WHERE st.awaiting_reply_since IS NOT NULL)::int AS awaiting_count,
      count(*) FILTER (WHERE st.awaiting_reply_since IS NULL)::int AS answered_count
    FROM remark r
    JOIN statement st ON st.id = r.statement_id
    JOIN clinic c ON c.id = st.clinic_id
    WHERE ${scope.sql}
  `;
  const { rows: statRows } = await query(statSql, statParams);
  const stats = statRows[0] || { total_requests: 0, awaiting_count: 0, answered_count: 0 };

  // Data query with latest specialist reply subquery
  params.push(limit, offset);
  const dataSql = `
    SELECT r.id, r.statement_id, r.type, r.body, r.created_at,
           r.author_role, u.full_name AS author_name,
           st.patient_name, st.account_number, st.statement_date,
           COALESCE(st.current_balance, st.cycle1_balance, st.balance_due) AS current_balance,
           st.pr_type, st.ledger_status, st.awaiting_reply_since,
           c.id AS clinic_id, c.name AS clinic_name, c.clinic_code,
           reply.body AS latest_reply_body,
           reply.author_name AS latest_reply_author,
           reply.created_at AS latest_reply_at
      FROM remark r
      JOIN statement st ON st.id = r.statement_id
      JOIN clinic c ON c.id = st.clinic_id
      LEFT JOIN app_user u ON u.id = r.author_id
      LEFT JOIN LATERAL (
        SELECT sr.body, su.full_name AS author_name, sr.created_at
          FROM remark sr
          LEFT JOIN app_user su ON su.id = sr.author_id
         WHERE sr.statement_id = st.id AND sr.type = 'specialist' AND sr.created_at >= r.created_at
         ORDER BY sr.created_at DESC LIMIT 1
      ) reply ON true
     WHERE ${where.join(' AND ')}
     ORDER BY (st.awaiting_reply_since IS NOT NULL) DESC, r.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows: items } = await query(dataSql, params);

  // Available clinics for filter dropdown
  let clinics = [];
  if (req.user.role === 'admin') {
    const { rows } = await query('SELECT id, name, clinic_code FROM clinic WHERE is_active = true ORDER BY name ASC');
    clinics = rows;
  } else if (req.user.role === 'specialist') {
    const { rows } = await query(
      `SELECT c.id, c.name, c.clinic_code
         FROM specialist_assignment a
         JOIN clinic c ON c.id = a.clinic_id
        WHERE a.specialist_id = $1 AND c.is_active = true
        ORDER BY c.name ASC`,
      [req.user.id],
    );
    clinics = rows;
  }

  res.json({
    requests: items.map((r) => {
      // Parse structured category and priority if present in format "[Category] (Priority) Body"
      let category = 'General Request';
      let priority = 'Normal';
      let cleanBody = r.body;

      const catMatch = r.body.match(/^\[REQUEST:\s*([^\]]+)\]/i) || r.body.match(/^\[([^\]]+)\]/);
      if (catMatch) {
        category = catMatch[1].trim();
        cleanBody = cleanBody.replace(catMatch[0], '').trim();
      }

      const prioMatch = cleanBody.match(/^\((Normal|High|Urgent)\)/i) || cleanBody.match(/^\[(Normal|High|Urgent)\]/i);
      if (prioMatch) {
        priority = prioMatch[1].charAt(0).toUpperCase() + prioMatch[1].slice(1).toLowerCase();
        cleanBody = cleanBody.replace(prioMatch[0], '').trim();
      }

      return {
        id: String(r.id),
        statementId: r.statement_id,
        patientName: r.patient_name,
        accountNumber: r.account_number,
        statementDate: r.statement_date,
        currentBalance: r.current_balance,
        prType: r.pr_type,
        ledgerStatus: r.ledger_status,
        clinicId: r.clinic_id,
        clinicName: r.clinic_name,
        clinicCode: r.clinic_code,
        type: r.type,
        category,
        priority,
        rawBody: r.body,
        body: cleanBody || r.body,
        authorName: r.author_name || (r.type === 'clinic' ? 'Clinic User' : 'US24 Specialist'),
        authorRole: r.author_role,
        createdAt: r.created_at,
        isAwaiting: Boolean(r.awaiting_reply_since),
        awaitingReplySince: r.awaiting_reply_since,
        latestReply: r.latest_reply_body ? {
          body: r.latest_reply_body,
          authorName: r.latest_reply_author || 'US24 Specialist',
          createdAt: r.latest_reply_at,
        } : null,
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1,
    metrics: {
      totalRequests: stats.total_requests,
      awaitingCount: stats.awaiting_count,
      answeredCount: stats.answered_count,
    },
    clinics,
  });
});

// POST /api/requests — Submit a new request or specialist reply
const requestCreateSchema = z.object({
  statementId: z.string().uuid('Please select a valid statement.'),
  category: z.string().trim().max(100).optional().default('General Request'),
  priority: z.enum(['Normal', 'High', 'Urgent']).optional().default('Normal'),
  body: z.string().trim().min(1, 'Please enter request details.').max(2000, 'Requests are limited to 2,000 characters.'),
  isReply: z.boolean().optional().default(false),
});

requestsRouter.post('/', async (req, res) => {
  const input = parseOrThrow(requestCreateSchema, req.body);

  const result = await withTransaction(async (db) => {
    // 1. Verify statement exists and user has access
    const { rows: stRows } = await db.query(
      'SELECT id, clinic_id, patient_name, account_number, status, awaiting_reply_since FROM statement WHERE id = $1 FOR UPDATE',
      [input.statementId],
    );
    const statement = stRows[0];
    if (!statement) throw notFound('Statement not found.');
    if (statement.status === 'withdrawn') throw badRequest('Requests cannot be added to a withdrawn statement.');

    // Clinic user can only submit for their own clinic
    if (req.user.role === 'clinic_user' && statement.clinic_id !== req.user.clinic_id) {
      throw new HttpError(403, 'You do not have access to this clinic\'s statements.');
    }

    // Specialist can only submit/reply for assigned clinics
    if (req.user.role === 'specialist') {
      const { rows: assignRows } = await db.query(
        'SELECT 1 FROM specialist_assignment WHERE specialist_id = $1 AND clinic_id = $2',
        [req.user.id, statement.clinic_id],
      );
      if (!assignRows[0]) throw new HttpError(403, 'You are not assigned to this clinic.');
    }

    // Determine type: if specialist/admin, type is specialist. If clinic_user, type is clinic.
    const remarkType = req.user.role === 'clinic_user' ? 'clinic' : 'specialist';

    // Format body with category and priority if it's a new request from clinic
    let formattedBody = input.body;
    if (remarkType === 'clinic' && !input.isReply) {
      formattedBody = `[REQUEST: ${input.category}] (${input.priority}) ${input.body}`;
    }

    const remark = await insertRemark(db, {
      statementId: statement.id,
      author: req.user,
      type: remarkType,
      body: formattedBody,
    });

    await audit(db, req, {
      action: 'remark.create',
      targetType: 'statement',
      targetId: statement.id,
      clinicId: statement.clinic_id,
      details: {
        is_request: true,
        category: input.category,
        priority: input.priority,
        is_reply: input.isReply || remarkType === 'specialist',
      },
    });

    return {
      id: String(remark.id),
      statementId: statement.id,
      patientName: statement.patient_name,
      accountNumber: statement.account_number,
      body: formattedBody,
      type: remarkType,
      authorName: req.user.full_name,
      createdAt: remark.created_at,
    };
  });

  res.status(201).json({ ok: true, request: result });
});
