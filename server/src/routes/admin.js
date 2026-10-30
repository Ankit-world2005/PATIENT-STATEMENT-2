import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { signLink } from '../lib/crypto.js';
import { HttpError, badRequest, conflict, notFound, parseOrThrow } from '../lib/errors.js';
import { mail } from '../lib/mailer.js';
import { endAllSessions } from '../middleware/session.js';
import { isUuid } from '../services/access.js';

// Admin area (F5, F13). Every route here is admin-only (mounted behind requireRole('admin')).
export const adminRouter = Router();

const AUDIT_ACTIONS = [
  'auth.login.success', 'auth.login.failure', 'auth.lockout', 'auth.logout', 'auth.session_timeout',
  'auth.otp.sent', 'auth.otp.success', 'auth.otp.failure', 'auth.otp.too_many', 'auth.totp.enrolled',
  'auth.password.reset_requested', 'auth.password.reset_completed', 'auth.invitation.accepted',
  'statement.view', 'statement.upload', 'statement.download', 'statement.print', 'statement.withdraw',
  'import.check', 'import.publish', 'import.cancel', 'import.error_report.download', 'remark.create',
  'user.invite', 'user.invite.resend', 'user.update', 'user.deactivate', 'user.reactivate', 'user.otp_reset',
  'clinic.create', 'clinic.update', 'clinic.deactivate', 'clinic.reactivate',
  'assignment.create', 'assignment.delete', 'access.blocked', 'audit.export',
];

function requireUuid(id) {
  if (!isUuid(id)) throw notFound();
  return id;
}

// --- M1 ----------------------------------------------------------------------
adminRouter.get('/summary', async (_req, res) => {
  const { rows } = await query(`
    SELECT (SELECT count(*) FROM clinic WHERE is_active)::int AS active_clinics,
           (SELECT count(*) FROM app_user WHERE status = 'active')::int AS active_users,
           (SELECT count(*) FROM app_user WHERE status = 'invited')::int AS invited_users,
           (SELECT count(*) FROM statement WHERE status = 'active')::int AS active_statements,
           (SELECT count(*) FROM audit_event)::int AS total_audit_events,
           (SELECT count(*) FROM audit_event WHERE action = 'access.blocked' AND occurred_at > now() - interval '7 days')::int AS blocked_7d,
           (SELECT count(*) FROM remark)::int AS total_remarks,
           (SELECT count(*) FROM statement WHERE awaiting_reply_since IS NOT NULL AND status = 'active')::int AS awaiting_remarks,
           (SELECT count(*) FROM statement WHERE last_remark_at > now() - interval '7 days')::int AS recent_remarks_7d`);
  res.json(rows[0]);
});

// --- M2-M4: clinics ------------------------------------------------------------
const clinicSchema = z.object({
  name: z.string().trim().min(1, 'Enter the clinic name.').max(200),
  clinicCode: z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/, 'Use 1-32 letters, digits, - or _.'),
  addressLine1: z.string().trim().min(1, 'Enter the street address.').max(200),
  addressLine2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(1, 'Enter the city.').max(100),
  state: z.string().trim().regex(/^[A-Za-z]{2}$/, 'Use the 2-letter state code.').transform((s) => s.toUpperCase()),
  postalCode: z.string().trim().regex(/^\d{5}(-\d{4})?$/, 'Use a 5-digit ZIP code.'),
  contactName: z.string().trim().max(200).optional().default(''),
  contactPhone: z.string().trim().max(32).refine((v) => v.replace(/\D/g, '').length === 10, 'Enter a 10-digit phone number.'),
  contactEmail: z.email('Enter a valid email address.').max(254).transform((s) => s.toLowerCase()),
});

const CLINIC_COLUMNS = {
  name: 'name', clinicCode: 'clinic_code', addressLine1: 'address_line1', addressLine2: 'address_line2', city: 'city',
  state: 'state', postalCode: 'postal_code', contactName: 'contact_name', contactPhone: 'contact_phone',
  contactEmail: 'contact_email',
};

function clinicView(c) {
  return {
    id: c.id, name: c.name, clinicCode: c.clinic_code, addressLine1: c.address_line1, addressLine2: c.address_line2,
    city: c.city, state: c.state, postalCode: c.postal_code, contactName: c.contact_name, contactPhone: c.contact_phone,
    contactEmail: c.contact_email, isActive: c.is_active, deactivatedAt: c.deactivated_at, createdAt: c.created_at,
  };
}

function uniqueViolation(err, constraintPart) {
  return err.code === '23505' && String(err.constraint || '').includes(constraintPart);
}

adminRouter.get('/clinics', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const status = ['active', 'inactive'].includes(req.query.status) ? req.query.status : 'all';
  const params = [];
  const where = ['TRUE'];
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    where.push(`(lower(c.name) LIKE $${params.length} OR lower(c.clinic_code::text) LIKE $${params.length})`);
  }
  if (status !== 'all') where.push(status === 'active' ? 'c.is_active' : 'NOT c.is_active');
  const { rows } = await query(
    `SELECT c.*,
            (SELECT count(*) FROM app_user u WHERE u.clinic_id = c.id AND u.status <> 'deactivated')::int AS user_count,
            (SELECT string_agg(u.full_name, ', ' ORDER BY u.full_name) FROM specialist_assignment a
               JOIN app_user u ON u.id = a.specialist_id WHERE a.clinic_id = c.id) AS specialists
       FROM clinic c WHERE ${where.join(' AND ')}
      ORDER BY c.is_active DESC, lower(c.name) LIMIT 500`,
    params,
  );
  res.json({ clinics: rows.map((c) => ({ ...clinicView(c), userCount: c.user_count, specialists: c.specialists })) });
});

adminRouter.post('/clinics', async (req, res) => {
  const v = parseOrThrow(clinicSchema, req.body ?? {});
  try {
    const id = await withTransaction(async (db) => {
      const { rows } = await db.query(
        `INSERT INTO clinic (name, clinic_code, address_line1, address_line2, city, state, postal_code,
                             contact_name, contact_phone, contact_email, created_by_id)
         VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [v.name, v.clinicCode, v.addressLine1, v.addressLine2, v.city, v.state, v.postalCode, v.contactName,
          v.contactPhone, v.contactEmail, req.user.id],
      );
      await audit(db, req, { action: 'clinic.create', targetType: 'clinic', targetId: rows[0].id, clinicId: rows[0].id });
      return rows[0].id;
    });
    res.status(201).json({ id });
  } catch (err) {
    if (uniqueViolation(err, 'clinic_code')) throw badRequest('That clinic ID is already in use.', { clinicCode: 'That clinic ID is already in use.' });
    throw err;
  }
});

adminRouter.get('/clinics/:id', async (req, res) => {
  const id = requireUuid(req.params.id);
  const { rows } = await query('SELECT * FROM clinic WHERE id = $1', [id]);
  if (!rows[0]) throw notFound();
  const [users, specialists, available, stats] = await Promise.all([
    query(`SELECT id, full_name, email, status, last_login FROM app_user WHERE clinic_id = $1
            ORDER BY status = 'deactivated', lower(full_name)`, [id]),
    query(`SELECT u.id, u.full_name, u.email, u.status, a.assigned_at FROM specialist_assignment a
             JOIN app_user u ON u.id = a.specialist_id WHERE a.clinic_id = $1 ORDER BY lower(u.full_name)`, [id]),
    query(`SELECT id, full_name, email FROM app_user
            WHERE role = 'specialist' AND status <> 'deactivated'
              AND id NOT IN (SELECT specialist_id FROM specialist_assignment WHERE clinic_id = $1)
            ORDER BY lower(full_name)`, [id]),
    query(`SELECT count(*) FILTER (WHERE status = 'active')::int AS active_statements FROM statement WHERE clinic_id = $1`, [id]),
  ]);
  res.json({
    clinic: clinicView(rows[0]),
    users: users.rows.map((u) => ({ id: u.id, fullName: u.full_name, email: u.email, status: u.status, lastLogin: u.last_login })),
    specialists: specialists.rows.map((u) => ({ id: u.id, fullName: u.full_name, email: u.email, status: u.status, assignedAt: u.assigned_at })),
    availableSpecialists: available.rows.map((u) => ({ id: u.id, fullName: u.full_name, email: u.email })),
    activeStatements: stats.rows[0].active_statements,
  });
});

adminRouter.put('/clinics/:id', async (req, res) => {
  const id = requireUuid(req.params.id);
  const v = parseOrThrow(clinicSchema, req.body ?? {});
  try {
    await withTransaction(async (db) => {
      const { rows } = await db.query('SELECT * FROM clinic WHERE id = $1 FOR UPDATE', [id]);
      const current = rows[0];
      if (!current) throw notFound();
      const changed = Object.entries(CLINIC_COLUMNS)
        .filter(([key, col]) => String(current[col] ?? '') !== String(v[key] ?? ''))
        .map(([, col]) => col);
      if (!changed.length) return;
      await db.query(
        `UPDATE clinic SET name = $2, clinic_code = $3, address_line1 = $4, address_line2 = NULLIF($5, ''), city = $6,
                state = $7, postal_code = $8, contact_name = $9, contact_phone = $10, contact_email = $11, updated_at = now()
          WHERE id = $1`,
        [id, v.name, v.clinicCode, v.addressLine1, v.addressLine2, v.city, v.state, v.postalCode, v.contactName,
          v.contactPhone, v.contactEmail],
      );
      await audit(db, req, { action: 'clinic.update', targetType: 'clinic', targetId: id, clinicId: id, details: { changed_fields: changed } });
    });
    res.json({ ok: true });
  } catch (err) {
    if (uniqueViolation(err, 'clinic_code')) throw badRequest('That clinic ID is already in use.', { clinicCode: 'That clinic ID is already in use.' });
    throw err;
  }
});

// FR-4.6: deactivating a clinic signs out and blocks all of its users; statements are kept.
adminRouter.post('/clinics/:id/deactivate', async (req, res) => {
  const id = requireUuid(req.params.id);
  await withTransaction(async (db) => {
    const { rowCount } = await db.query(
      `UPDATE clinic SET is_active = false, deactivated_at = now(), deactivated_by_id = $2, updated_at = now()
        WHERE id = $1 AND is_active`,
      [id, req.user.id],
    );
    if (!rowCount) throw conflict('This clinic is already inactive.');
    await db.query('DELETE FROM user_session WHERE user_id IN (SELECT id FROM app_user WHERE clinic_id = $1)', [id]);
    await audit(db, req, { action: 'clinic.deactivate', targetType: 'clinic', targetId: id, clinicId: id });
  });
  res.json({ ok: true });
});

adminRouter.post('/clinics/:id/reactivate', async (req, res) => {
  const id = requireUuid(req.params.id);
  await withTransaction(async (db) => {
    const { rowCount } = await db.query(
      `UPDATE clinic SET is_active = true, deactivated_at = NULL, deactivated_by_id = NULL, updated_at = now()
        WHERE id = $1 AND NOT is_active`,
      [id],
    );
    if (!rowCount) throw conflict('This clinic is already active.');
    await audit(db, req, { action: 'clinic.reactivate', targetType: 'clinic', targetId: id, clinicId: id });
  });
  res.json({ ok: true });
});

// Admin clinic permanent deletion: cleans up dependent statements, remarks, files, batches, users, and assignments.
adminRouter.delete('/clinics/:id', async (req, res) => {
  const id = requireUuid(req.params.id);
  const { rows } = await query('SELECT id, name, clinic_code FROM clinic WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Clinic not found.');
  const clinic = rows[0];

  await withTransaction(async (db) => {
    await db.query('SELECT admin_delete_clinic($1)', [id]);
    await audit(db, req, {
      action: 'clinic.deactivate',
      targetType: 'clinic',
      targetId: id,
      details: { deleted: true, name: clinic.name, code: clinic.clinic_code },
    }).catch(() => {});
  });

  res.json({ ok: true, message: `Clinic "${clinic.name}" and all associated data have been deleted.` });
});

// FR-4.3: assign / unassign specialists. Access changes on the very next request.
async function assign(req, specialistId, clinicId) {
  requireUuid(specialistId);
  requireUuid(clinicId);
  await withTransaction(async (db) => {
    const { rows: users } = await db.query('SELECT role, status FROM app_user WHERE id = $1', [specialistId]);
    if (users[0]?.role !== 'specialist' || users[0].status === 'deactivated') throw badRequest('Choose an active specialist.');
    const { rows: clinics } = await db.query('SELECT id FROM clinic WHERE id = $1', [clinicId]);
    if (!clinics[0]) throw notFound();
    const { rows } = await db.query(
      `INSERT INTO specialist_assignment (specialist_id, clinic_id, assigned_by_id) VALUES ($1, $2, $3)
       ON CONFLICT (specialist_id, clinic_id) DO NOTHING RETURNING id`,
      [specialistId, clinicId, req.user.id],
    );
    if (rows[0]) {
      await audit(db, req, { action: 'assignment.create', targetType: 'specialist_assignment', targetId: rows[0].id, clinicId });
    }
  });
}

async function unassign(req, specialistId, clinicId) {
  requireUuid(specialistId);
  requireUuid(clinicId);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      'DELETE FROM specialist_assignment WHERE specialist_id = $1 AND clinic_id = $2 RETURNING id',
      [specialistId, clinicId],
    );
    if (rows[0]) {
      await audit(db, req, { action: 'assignment.delete', targetType: 'specialist_assignment', targetId: rows[0].id, clinicId });
    }
  });
}

adminRouter.post('/clinics/:id/specialists', async (req, res) => {
  await assign(req, req.body?.specialistId, req.params.id);
  res.status(201).json({ ok: true });
});
adminRouter.delete('/clinics/:id/specialists/:specialistId', async (req, res) => {
  await unassign(req, req.params.specialistId, req.params.id);
  res.status(204).end();
});

// --- M5-M7: users ---------------------------------------------------------------
function userView(u) {
  return {
    id: u.id, fullName: u.full_name, email: u.email, role: u.role, status: u.status,
    clinic: u.clinic_id ? { id: u.clinic_id, name: u.clinic_name } : null,
    lastLogin: u.last_login, invitedAt: u.invited_at, activatedAt: u.activated_at, deactivatedAt: u.deactivated_at,
    hasTotp: Boolean(u.totp_confirmed_at),
  };
}

adminRouter.get('/users', async (req, res) => {
  const params = [];
  const where = ['TRUE'];
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    where.push(`(lower(u.full_name) LIKE $${params.length} OR lower(u.email::text) LIKE $${params.length})`);
  }
  if (['admin', 'specialist', 'clinic_user'].includes(req.query.role)) {
    params.push(req.query.role);
    where.push(`u.role = $${params.length}`);
  }
  if (['invited', 'active', 'deactivated'].includes(req.query.status)) {
    params.push(req.query.status);
    where.push(`u.status = $${params.length}`);
  }
  if (isUuid(req.query.clinicId)) {
    params.push(req.query.clinicId);
    where.push(`u.clinic_id = $${params.length}`);
  }
  const { rows } = await query(
    `SELECT u.*, c.name AS clinic_name FROM app_user u LEFT JOIN clinic c ON c.id = u.clinic_id
      WHERE ${where.join(' AND ')} ORDER BY u.status = 'deactivated', lower(u.full_name) LIMIT 500`,
    params,
  );
  res.json({ users: rows.map(userView) });
});

const inviteSchema = z
  .object({
    fullName: z.string().trim().min(1, 'Enter the full name.').max(200),
    email: z.email('Enter a valid email address.').max(254).transform((s) => s.toLowerCase()),
    role: z.enum(['admin', 'specialist', 'clinic_user'], { message: 'Choose a role.' }),
    clinicId: z.string().optional().default(''),
  })
  .refine((v) => v.role !== 'clinic_user' || isUuid(v.clinicId), { message: 'Choose the clinic.', path: ['clinicId'] });

async function sendInvitation(user) {
  const token = signLink({
    userId: user.id,
    purpose: 'invite',
    ttlSeconds: config.tokens.inviteHours * 3600,
    fingerprint: `${user.status}|${user.invited_at.toISOString()}`,
  });
  return mail.invitation(user.email, user.full_name, `${config.appUrl}/invite/${token}`);
}

adminRouter.post('/users', async (req, res) => {
  const v = parseOrThrow(inviteSchema, { ...req.body, email: String(req.body?.email ?? '').trim() });
  const existing = await query('SELECT id FROM app_user WHERE email = $1', [v.email]);
  if (existing.rows[0]) {
    throw new HttpError(400, 'A user with this email already exists.', {
      fieldErrors: { email: 'A user with this email already exists.' }, existingUserId: existing.rows[0].id,
    });
  }
  const user = await withTransaction(async (db) => {
    let clinicId = null;
    if (v.role === 'clinic_user') {
      const { rows } = await db.query('SELECT is_active FROM clinic WHERE id = $1', [v.clinicId]);
      if (!rows[0]?.is_active) throw badRequest('Choose an active clinic.', { clinicId: 'Choose an active clinic.' });
      clinicId = v.clinicId;
    }
    const { rows } = await db.query(
      `INSERT INTO app_user (email, full_name, role, clinic_id, status, invited_by_id)
       VALUES ($1, $2, $3, $4, 'invited', $5) RETURNING *`,
      [v.email, v.fullName, v.role, clinicId, req.user.id],
    );
    await audit(db, req, {
      action: 'user.invite', targetType: 'app_user', targetId: rows[0].id, clinicId: clinicId ?? undefined, details: { role: v.role },
    });
    return rows[0];
  });
  const sent = await sendInvitation(user);
  res.status(201).json({ id: user.id, emailFailed: !sent });
});

adminRouter.get('/users/:id', async (req, res) => {
  const id = requireUuid(req.params.id);
  const { rows } = await query(
    `SELECT u.*, c.name AS clinic_name FROM app_user u LEFT JOIN clinic c ON c.id = u.clinic_id WHERE u.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound();
  const user = rows[0];
  let assignments = [];
  let availableClinics = [];
  if (user.role === 'specialist') {
    const [a, b] = await Promise.all([
      query(`SELECT c.id, c.name, c.clinic_code, c.is_active FROM specialist_assignment a JOIN clinic c ON c.id = a.clinic_id
              WHERE a.specialist_id = $1 ORDER BY lower(c.name)`, [id]),
      query(`SELECT id, name, clinic_code FROM clinic
              WHERE id NOT IN (SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $1)
              ORDER BY lower(name)`, [id]),
    ]);
    assignments = a.rows.map((c) => ({ id: c.id, name: c.name, code: c.clinic_code, isActive: c.is_active }));
    availableClinics = b.rows.map((c) => ({ id: c.id, name: c.name, code: c.clinic_code }));
  }
  res.json({ user: userView(user), assignments, availableClinics, isSelf: id === req.user.id });
});

adminRouter.post('/users/:id/resend-invite', async (req, res) => {
  const id = requireUuid(req.params.id);
  const user = await withTransaction(async (db) => {
    // A new invited_at invalidates the previous link (schema 3.3).
    const { rows } = await db.query(
      `UPDATE app_user SET invited_at = now(), updated_at = now() WHERE id = $1 AND status = 'invited' RETURNING *`,
      [id],
    );
    if (!rows[0]) throw conflict('Only invited users can be sent a new invitation.');
    await audit(db, req, { action: 'user.invite.resend', targetType: 'app_user', targetId: id, clinicId: rows[0].clinic_id ?? undefined });
    return rows[0];
  });
  const sent = await sendInvitation(user);
  res.json({ ok: true, emailFailed: !sent });
});

adminRouter.post('/users/:id/reset-2fa', async (req, res) => {
  const id = requireUuid(req.params.id);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE app_user SET totp_secret_enc = NULL, totp_confirmed_at = NULL, updated_at = now() WHERE id = $1 RETURNING clinic_id`,
      [id],
    );
    if (!rows[0]) throw notFound();
    await audit(db, req, { action: 'user.otp_reset', targetType: 'app_user', targetId: id, clinicId: rows[0].clinic_id ?? undefined });
  });
  res.json({ ok: true });
});

// FR-4.4: deactivation ends the user's sessions immediately. Never yourself or the last admin (I-19).
adminRouter.post('/users/:id/deactivate', async (req, res) => {
  const id = requireUuid(req.params.id);
  if (id === req.user.id) throw badRequest("You can't deactivate your own account.");
  await withTransaction(async (db) => {
    const { rows } = await db.query('SELECT * FROM app_user WHERE id = $1 FOR UPDATE', [id]);
    const user = rows[0];
    if (!user) throw notFound();
    if (user.status === 'deactivated') throw conflict('This user is already deactivated.');
    if (user.role === 'admin') {
      const { rows: admins } = await db.query(`SELECT id FROM app_user WHERE role = 'admin' AND status = 'active' FOR UPDATE`);
      if (admins.filter((a) => a.id !== id).length === 0) throw badRequest("You can't deactivate the last active admin.");
    }
    await db.query(
      `UPDATE app_user SET status = 'deactivated', deactivated_at = now(), deactivated_by_id = $2, updated_at = now() WHERE id = $1`,
      [id, req.user.id],
    );
    await endAllSessions(db, id);
    await audit(db, req, { action: 'user.deactivate', targetType: 'app_user', targetId: id, clinicId: user.clinic_id ?? undefined });
  });
  res.json({ ok: true });
});

adminRouter.post('/users/:id/reactivate', async (req, res) => {
  const id = requireUuid(req.params.id);
  await withTransaction(async (db) => {
    const { rows } = await db.query(
      `UPDATE app_user
          SET status = CASE WHEN password_hash IS NULL THEN 'invited' ELSE 'active' END,
              deactivated_at = NULL, deactivated_by_id = NULL, updated_at = now()
        WHERE id = $1 AND status = 'deactivated' RETURNING clinic_id, status`,
      [id],
    );
    if (!rows[0]) throw conflict('This user is not deactivated.');
    await audit(db, req, {
      action: 'user.reactivate', targetType: 'app_user', targetId: id, clinicId: rows[0].clinic_id ?? undefined,
      details: { status: rows[0].status },
    });
  });
  res.json({ ok: true });
});

// Admin user permanent deletion: cascades sessions, assignments, drafts, and removes the user from the database.
adminRouter.delete('/users/:id', async (req, res) => {
  const id = requireUuid(req.params.id);
  if (id === req.user.id) throw badRequest("You can't delete your own account.");

  const { rows } = await query('SELECT id, full_name, email, role, clinic_id FROM app_user WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('User not found.');
  const targetUser = rows[0];

  if (targetUser.role === 'admin') {
    const { rows: admins } = await query("SELECT id FROM app_user WHERE role = 'admin' AND status = 'active'");
    if (admins.filter((a) => a.id !== id).length === 0) {
      throw badRequest("You can't delete the last active admin.");
    }
  }

  // Find a fallback admin (other than the target user)
  const { rows: fallbackAdmins } = await query(
    "SELECT id FROM app_user WHERE role = 'admin' AND id != $1 AND status = 'active' LIMIT 1",
    [id],
  );
  const fallbackAdminId = fallbackAdmins[0]?.id || req.user.id;

  await withTransaction(async (db) => {
    await db.query('SELECT admin_delete_user($1, $2)', [id, fallbackAdminId]);
    await audit(db, req, {
      action: 'user.deactivate',
      targetType: 'app_user',
      targetId: id,
      details: { deleted: true, name: targetUser.full_name, email: targetUser.email, role: targetUser.role },
    }).catch(() => {});
  });

  res.json({ ok: true, message: `User "${targetUser.full_name}" has been deleted from the database.` });
});

adminRouter.post('/users/:id/clinics', async (req, res) => {
  await assign(req, req.params.id, req.body?.clinicId);
  res.status(201).json({ ok: true });
});
adminRouter.delete('/users/:id/clinics/:clinicId', async (req, res) => {
  await unassign(req, req.params.id, req.params.clinicId);
  res.status(204).end();
});

// --- M8: audit log (FR-13.3) -----------------------------------------------------
const auditFilterSchema = z.object({
  userId: z.string().optional().default(''),
  clinicId: z.string().optional().default(''),
  action: z.string().optional().default(''),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).default(''),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')).default(''),
  page: z.coerce.number().int().min(1).max(100000).optional().default(1),
});

function auditWhere(f) {
  const params = [];
  const where = ['TRUE'];
  if (isUuid(f.userId)) {
    params.push(f.userId);
    where.push(`e.actor_user_id = $${params.length}`);
  }
  if (isUuid(f.clinicId)) {
    params.push(f.clinicId);
    where.push(`e.clinic_id = $${params.length}`);
  }
  if (AUDIT_ACTIONS.includes(f.action)) {
    params.push(f.action);
    where.push(`e.action = $${params.length}`);
  } else if (f.action && /^[a-z]+$/.test(f.action)) {
    params.push(`${f.action}.%`);
    where.push(`e.action LIKE $${params.length}`);
  }
  if (f.from) {
    params.push(f.from);
    where.push(`e.occurred_at >= $${params.length}::date`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`e.occurred_at < $${params.length}::date + 1`);
  }
  return { sql: where.join(' AND '), params };
}

const AUDIT_SELECT = `
  SELECT e.id, e.occurred_at, e.actor_role, e.attempted_email, e.action, e.target_type, e.target_id, e.outcome,
         host(e.ip_address) AS ip, e.details, u.full_name AS actor_name, u.email AS actor_email, c.name AS clinic_name
    FROM audit_event e
    LEFT JOIN app_user u ON u.id = e.actor_user_id
    LEFT JOIN clinic c ON c.id = e.clinic_id`;

adminRouter.get('/audit', async (req, res) => {
  const f = parseOrThrow(auditFilterSchema, req.query);
  const { sql, params } = auditWhere(f);
  const pageSize = 50;
  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM audit_event e WHERE ${sql}`, params);
  const total = countRows[0].total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(f.page, totalPages);
  const { rows } = await query(
    `${AUDIT_SELECT} WHERE ${sql} ORDER BY e.occurred_at DESC, e.id DESC LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  res.json({
    events: rows.map((e) => ({
      id: String(e.id), occurredAt: e.occurred_at, actorName: e.actor_name, actorEmail: e.actor_email ?? e.attempted_email,
      actorRole: e.actor_role, clinicName: e.clinic_name, action: e.action, targetType: e.target_type, targetId: e.target_id,
      outcome: e.outcome, ip: e.ip, details: e.details,
    })),
    page, pageSize, total, totalPages,
  });
});

adminRouter.get('/audit/options', async (_req, res) => {
  const [users, clinics] = await Promise.all([
    query('SELECT id, full_name, email FROM app_user ORDER BY lower(full_name)'),
    query('SELECT id, name FROM clinic ORDER BY lower(name)'),
  ]);
  res.json({
    actions: AUDIT_ACTIONS,
    users: users.rows.map((u) => ({ id: u.id, label: `${u.full_name} (${u.email})` })),
    clinics: clinics.rows.map((c) => ({ id: c.id, label: c.name })),
  });
});

function csvCell(value) {
  let s = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const EXPORT_LIMIT = 100_000;

adminRouter.get('/audit/export.csv', async (req, res) => {
  const f = parseOrThrow(auditFilterSchema, req.query);
  const { sql, params } = auditWhere(f);
  const { rows: countRows } = await query(`SELECT count(*)::int AS total FROM audit_event e WHERE ${sql}`, params);
  if (countRows[0].total > EXPORT_LIMIT) throw badRequest('Narrow the date range to export (limit 100,000 events).');

  // The export itself is recorded before any data leaves (I-20).
  await audit(pool, req, {
    action: 'audit.export',
    targetType: 'audit_event',
    details: { filters: { userId: f.userId || null, clinicId: f.clinicId || null, action: f.action || null, from: f.from || null, to: f.to || null } },
  });
  const { rows } = await query(`${AUDIT_SELECT} WHERE ${sql} ORDER BY e.occurred_at DESC, e.id DESC`, params);
  const header = ['occurred_at_utc', 'user', 'email', 'role', 'clinic', 'action', 'target_type', 'target_id', 'outcome', 'ip', 'details'];
  const lines = [header.join(',')];
  for (const e of rows) {
    lines.push([
      e.occurred_at.toISOString(), e.actor_name, e.actor_email ?? e.attempted_email, e.actor_role, e.clinic_name, e.action,
      e.target_type, e.target_id, e.outcome, e.ip, e.details,
    ].map(csvCell).join(','));
  }
  res.type('text/csv')
    .set('Content-Disposition', `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(`\uFEFF${lines.join('\r\n')}\r\n`);
});

// --- M6: clinic remarks & updates -------------------------------------------
adminRouter.get('/remarks', async (req, res) => {
  const clinicId = req.query.clinicId ? String(req.query.clinicId) : null;
  const type = ['clinic', 'specialist', 'insurance'].includes(req.query.type) ? req.query.type : 'all';
  const awaiting = req.query.awaiting === 'true' || req.query.awaiting === '1';
  const recent7d = req.query.recent7d === 'true' || req.query.recent7d === '1';
  const q = String(req.query.q ?? '').trim().toLowerCase().slice(0, 100);
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(req.query.limit || '20', 10)));
  const offset = (page - 1) * limit;

  const where = ['TRUE'];
  const params = [];

  if (clinicId && isUuid(clinicId)) {
    params.push(clinicId);
    where.push(`st.clinic_id = $${params.length}`);
  }

  if (type !== 'all') {
    params.push(type);
    where.push(`r.type = $${params.length}`);
  }

  if (awaiting) {
    where.push(`st.awaiting_reply_since IS NOT NULL`);
  }

  if (recent7d) {
    where.push(`r.created_at > now() - interval '7 days'`);
  }

  if (q) {
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`);
    where.push(`(lower(st.patient_name) LIKE $${params.length} OR lower(st.account_number) LIKE $${params.length} OR lower(r.body) LIKE $${params.length} OR lower(c.name) LIKE $${params.length})`);
  }

  const countQuery = `
    SELECT count(*)::int AS total
    FROM remark r
    JOIN statement st ON st.id = r.statement_id
    JOIN clinic c ON c.id = st.clinic_id
    WHERE ${where.join(' AND ')}
  `;
  const { rows: countRows } = await query(countQuery, params);
  const total = countRows[0]?.total || 0;

  params.push(limit, offset);
  const dataQuery = `
    SELECT r.id, r.statement_id, r.type, r.body, r.insurance_name, r.insurance_reference, r.created_at,
           r.author_role, u.full_name AS author_name, u.email AS author_email,
           st.patient_name, st.account_number, st.statement_date, st.current_balance, st.balance_due,
           st.pr_type, st.ledger_status, st.awaiting_reply_since,
           c.id AS clinic_id, c.name AS clinic_name, c.clinic_code
    FROM remark r
    JOIN statement st ON st.id = r.statement_id
    JOIN clinic c ON c.id = st.clinic_id
    LEFT JOIN app_user u ON u.id = r.author_id
    WHERE ${where.join(' AND ')}
    ORDER BY r.created_at DESC
    LIMIT $${params.length - 1} OFFSET $${params.length}
  `;
  const { rows: items } = await query(dataQuery, params);

  // Clinic list for filter dropdown
  const { rows: clinics } = await query(`SELECT id, name, clinic_code FROM clinic WHERE is_active = true ORDER BY name ASC`);

  // Overall stats
  const { rows: statsRows } = await query(`
    SELECT
      (SELECT count(*) FROM remark)::int AS total_remarks,
      (SELECT count(*) FROM statement WHERE awaiting_reply_since IS NOT NULL AND status = 'active')::int AS awaiting_count,
      (SELECT count(*) FROM remark WHERE created_at > now() - interval '7 days')::int AS recent_7d_count
  `);

  res.json({
    items: items.map((r) => ({
      id: r.id,
      statementId: r.statement_id,
      type: r.type,
      body: r.body,
      insuranceName: r.insurance_name,
      insuranceReference: r.insurance_reference,
      createdAt: r.created_at,
      authorRole: r.author_role,
      authorName: r.author_name || 'System',
      authorEmail: r.author_email,
      patientName: r.patient_name,
      accountNumber: r.account_number,
      statementDate: r.statement_date,
      currentBalance: r.current_balance ?? r.balance_due,
      prType: r.pr_type,
      ledgerStatus: r.ledger_status,
      awaitingReply: Boolean(r.awaiting_reply_since),
      clinic: {
        id: r.clinic_id,
        name: r.clinic_name,
        code: r.clinic_code,
      },
    })),
    clinics: clinics.map((c) => ({ id: c.id, name: c.name, code: c.clinic_code })),
    stats: statsRows[0] || { total_remarks: 0, awaiting_count: 0, recent_7d_count: 0 },
    total,
    page,
    pageCount: Math.ceil(total / limit) || 1,
  });
});

