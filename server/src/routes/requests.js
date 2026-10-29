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

async function getDefaultClinicId(db, user) {
  if (user.clinic_id) return user.clinic_id;
  if (user.role === 'specialist') {
    const { rows } = await db.query(
      'SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $1 LIMIT 1',
      [user.id],
    );
    return rows[0]?.clinic_id || null;
  }
  const { rows } = await db.query('SELECT id FROM clinic WHERE is_active = true ORDER BY name ASC LIMIT 1');
  return rows[0]?.id || null;
}

// GET /api/requests/statements — Search statements for autocomplete suggestions
requestsRouter.get('/statements', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const limit = Math.min(10, Math.max(1, parseInt(req.query.limit || '5', 10)));

  // If query is empty, do not return statements to avoid cluttering UI
  if (!q) {
    return res.json({ statements: [] });
  }

  const scope = getUserClinicScope(req.user);
  const where = ['st.status = \'active\'', scope.sql];
  const params = [...scope.params];

  if (req.query.clinicId && isUuid(req.query.clinicId) && req.user.role !== 'clinic_user') {
    params.push(req.query.clinicId);
    where.push(`st.clinic_id = $${params.length}`);
  }

  params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
  where.push(`(lower(st.patient_name) LIKE $${params.length} OR lower(st.account_number) LIKE $${params.length})`);

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
  const where = ['TRUE', scope.sql, "r.type = 'clinic'"];
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
    SELECT count(DISTINCT r.id)::int AS total
      FROM remark r
      JOIN statement st ON st.id = r.statement_id
      JOIN clinic c ON c.id = st.clinic_id
     WHERE ${where.join(' AND ')}
  `;
  const { rows: countRows } = await query(countSql, params);
  const total = countRows[0]?.total || 0;

  // Metrics query
  const metricsScope = getUserClinicScope(req.user);
  const metricsWhere = ['TRUE', metricsScope.sql, "r.type = 'clinic'"];
  const metricsParams = [...metricsScope.params];
  if (clinicId && isUuid(clinicId) && req.user.role !== 'clinic_user') {
    metricsParams.push(clinicId);
    metricsWhere.push(`st.clinic_id = $${metricsParams.length}`);
  }

  const metricsSql = `
    SELECT
      count(DISTINCT r.id)::int AS total_requests,
      count(DISTINCT CASE WHEN st.awaiting_reply_since IS NOT NULL THEN r.id END)::int AS awaiting_count,
      count(DISTINCT CASE WHEN st.awaiting_reply_since IS NULL THEN r.id END)::int AS answered_count
    FROM remark r
    JOIN statement st ON st.id = r.statement_id
    JOIN clinic c ON c.id = st.clinic_id
    WHERE ${metricsWhere.join(' AND ')}
  `;
  const { rows: metricsRows } = await query(metricsSql, metricsParams);
  const stats = metricsRows[0] || { total_requests: 0, awaiting_count: 0, answered_count: 0 };

  // Data query with latest specialist response joined
  params.push(limit);
  params.push(offset);

  const dataSql = `
    SELECT
      r.id,
      r.statement_id,
      r.body,
      r.type,
      r.author_role,
      r.created_at,
      u.full_name AS author_name,
      st.patient_name,
      st.account_number,
      st.statement_date,
      COALESCE(st.current_balance, st.cycle1_balance, st.balance_due) AS current_balance,
      st.pr_type,
      st.ledger_status,
      st.awaiting_reply_since,
      c.id AS clinic_id,
      c.name AS clinic_name,
      c.clinic_code,
      latest_reply.body AS latest_reply_body,
      latest_reply.created_at AS latest_reply_at,
      reply_u.full_name AS latest_reply_author,
      thread_replies.replies_list AS replies_json
    FROM remark r
    JOIN statement st ON st.id = r.statement_id
    JOIN clinic c ON c.id = st.clinic_id
    LEFT JOIN app_user u ON u.id = r.author_id
    LEFT JOIN LATERAL (
      SELECT r2.body, r2.created_at, r2.author_id
        FROM remark r2
       WHERE r2.statement_id = r.statement_id
         AND r2.type = 'specialist'
         AND r2.created_at >= r.created_at
         AND NOT EXISTS (
           SELECT 1 FROM remark r_next
            WHERE r_next.statement_id = r.statement_id
              AND r_next.type = 'clinic'
              AND r_next.created_at > r.created_at
              AND r2.created_at > r_next.created_at
         )
       ORDER BY r2.created_at DESC
       LIMIT 1
    ) latest_reply ON true
    LEFT JOIN app_user reply_u ON reply_u.id = latest_reply.author_id
    LEFT JOIN LATERAL (
      SELECT json_agg(
        json_build_object(
          'id', r3.id,
          'body', r3.body,
          'createdAt', r3.created_at,
          'authorName', COALESCE(r3_u.full_name, 'US24 Specialist')
        ) ORDER BY r3.created_at ASC
      ) AS replies_list
      FROM remark r3
      LEFT JOIN app_user r3_u ON r3_u.id = r3.author_id
      WHERE r3.statement_id = r.statement_id
        AND r3.type = 'specialist'
        AND r3.created_at >= r.created_at
        AND NOT EXISTS (
          SELECT 1 FROM remark r_next
           WHERE r_next.statement_id = r.statement_id
             AND r_next.type = 'clinic'
             AND r_next.created_at > r.created_at
             AND r3.created_at > r_next.created_at
        )
    ) thread_replies ON true
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
      let priority = 'Normal';
      let cleanBody = r.body;

      // Clean legacy category tag if present in existing remarks
      const catMatch = r.body.match(/^\[REQUEST:\s*([^\]]+)\]/i) || r.body.match(/^\[([^\]]+)\]/);
      if (catMatch) {
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
        priority,
        rawBody: r.body,
        body: cleanBody || r.body,
        authorName: r.author_name || (r.type === 'clinic' ? 'Clinic User' : 'US24 Specialist'),
        authorRole: r.author_role,
        createdAt: r.created_at,
        isAwaiting: Boolean(r.awaiting_reply_since),
        awaitingReplySince: r.awaiting_reply_since,
        replies: r.replies_json || (r.latest_reply_body ? [{
          body: r.latest_reply_body,
          authorName: r.latest_reply_author || 'US24 Specialist',
          createdAt: r.latest_reply_at,
        }] : []),
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
  statementId: z.string().uuid('Please select a valid statement.').optional().nullable(),
  patientName: z.string().trim().min(1, 'Please enter patient name.').max(200).optional().nullable(),
  accountNumber: z.string().trim().max(64).optional().nullable(),
  priority: z.enum(['Normal', 'High', 'Urgent']).optional().default('Normal'),
  body: z.string().trim().min(1, 'Please enter request details.').max(2000, 'Requests are limited to 2,000 characters.'),
  isReply: z.boolean().optional().default(false),
  clinicId: z.string().uuid().optional().nullable(),
});

requestsRouter.post('/', async (req, res) => {
  const input = parseOrThrow(requestCreateSchema, req.body);

  const result = await withTransaction(async (db) => {
    let statement = null;

    // 1. If statementId was provided, verify it exists and user has access
    if (input.statementId) {
      const { rows: stRows } = await db.query(
        'SELECT id, clinic_id, patient_name, account_number, status, awaiting_reply_since FROM statement WHERE id = $1 FOR UPDATE',
        [input.statementId],
      );
      statement = stRows[0];
      if (!statement) throw notFound('Statement not found.');
      if (statement.status === 'withdrawn') throw badRequest('Requests cannot be added to a withdrawn statement.');
    }

    const clinicId = req.user.role === 'clinic_user'
      ? req.user.clinic_id
      : (statement?.clinic_id || input.clinicId || (await getDefaultClinicId(db, req.user)));

    if (!clinicId) throw badRequest('Clinic ID is required.');

    // Clinic user can only submit for their own clinic
    if (req.user.role === 'clinic_user' && statement && statement.clinic_id !== req.user.clinic_id) {
      throw new HttpError(403, 'You do not have access to this clinic\'s statements.');
    }

    // Specialist can only submit/reply for assigned clinics
    if (req.user.role === 'specialist') {
      const { rows: assignRows } = await db.query(
        'SELECT 1 FROM specialist_assignment WHERE specialist_id = $1 AND clinic_id = $2',
        [req.user.id, clinicId],
      );
      if (!assignRows[0]) throw new HttpError(403, 'You are not assigned to this clinic.');
    }

    // 2. If no statementId, search for matching statement for this patient in the clinic
    if (!statement && input.patientName) {
      const params = [clinicId, `%${input.patientName.trim()}%`];
      let matchSql = `
        SELECT id, clinic_id, patient_name, account_number, status, awaiting_reply_since
          FROM statement
         WHERE clinic_id = $1 AND status != 'withdrawn' AND lower(patient_name) LIKE lower($2)
      `;
      if (input.accountNumber) {
        params.push(input.accountNumber.trim());
        matchSql += ` AND lower(account_number) = lower($${params.length})`;
      }
      matchSql += ' ORDER BY statement_date DESC, id DESC LIMIT 1 FOR UPDATE';

      const { rows } = await db.query(matchSql, params);
      if (rows[0]) {
        statement = rows[0];
      }
    }

    // 3. If still no statement found (manually entered patient without existing uploaded statement),
    // create a statement record so foreign key constraint and auditing succeed
    if (!statement) {
      const pName = input.patientName?.trim() || 'Patient';
      const cleanInit = pName.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'PAT';
      const accNum = input.accountNumber?.trim() || `ACC-${cleanInit}-${Date.now().toString().slice(-4)}`;

      const { rows: specRows } = await db.query(
        `SELECT specialist_id FROM specialist_assignment WHERE clinic_id = $1
         UNION ALL
         SELECT id FROM app_user WHERE role IN ('specialist', 'admin') AND status = 'active'
         LIMIT 1`,
        [clinicId],
      );
      const uploaderId = specRows[0]?.specialist_id || specRows[0]?.id || req.user.id;

      const { rows: newStRows } = await db.query(
        `INSERT INTO statement (
           clinic_id, patient_name, account_number, statement_date, balance_due,
           source, import_batch_id, import_row_number, version, supersedes_id,
           uploaded_by_id, status, ledger_status, awaiting_reply_since
         ) VALUES (
           $1, $2, $3, CURRENT_DATE, 0.00,
           'pdf_upload', NULL, NULL, 1, NULL,
           $4, 'active', 'Active', now()
         ) RETURNING id, clinic_id, patient_name, account_number, status, awaiting_reply_since`,
        [clinicId, pName, accNum, uploaderId],
      );
      statement = newStRows[0];
    }

    // Inquiries submitted to specialists are clinic requests
    const remarkType = 'clinic';
    const authorRole = 'clinic_user';
    const formattedBody = `(${input.priority}) ${input.body}`;
    const remark = await insertRemark(db, {
      statementId: statement.id,
      author: { ...req.user, role: authorRole },
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

// POST /api/requests/:id/reply — Fast shortcut to reply to a specific request
requestsRouter.post('/:id/reply', async (req, res) => {
  const remarkId = parseInt(req.params.id, 10);
  if (!remarkId || isNaN(remarkId)) throw badRequest('Invalid request ID.');

  const bodySchema = z.object({
    body: z.string().trim().min(1, 'Please enter a reply.').max(2000),
  });
  const input = parseOrThrow(bodySchema, req.body);

  const result = await withTransaction(async (db) => {
    // 1. Fetch remark and statement
    const { rows } = await db.query(
      `SELECT r.id, r.statement_id, st.clinic_id, st.patient_name, st.account_number
         FROM remark r
         JOIN statement st ON st.id = r.statement_id
        WHERE r.id = $1`,
      [remarkId],
    );
    const orig = rows[0];
    if (!orig) throw notFound('Request not found.');

    const replyType = req.user.role === 'clinic_user' ? 'clinic' : 'specialist';
    const authorRole = req.user.role === 'clinic_user' ? 'clinic_user' : 'specialist';

    const replyRemark = await insertRemark(db, {
      statementId: orig.statement_id,
      author: { ...req.user, role: authorRole },
      type: replyType,
      body: input.body,
    });

    await audit(db, req, {
      action: 'remark.create',
      targetType: 'statement',
      targetId: orig.statement_id,
      clinicId: orig.clinic_id,
      details: {
        is_reply: true,
        reply_to_remark_id: orig.id,
      },
    });

    return {
      id: String(replyRemark.id),
      statementId: orig.statement_id,
      body: input.body,
      createdAt: replyRemark.created_at,
      authorName: req.user.full_name,
    };
  });

  res.status(201).json({ ok: true, reply: result });
});
