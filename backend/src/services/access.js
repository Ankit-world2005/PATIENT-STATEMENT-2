import { audit } from '../lib/audit.js';
import { HttpError, notFound } from '../lib/errors.js';

// The one place that decides which clinics and statements a user may see
// (TRD 2.2, schema 4.2). Routes never query statements without these helpers.
// Anything out of scope is reported as "not found" and logged (FR-2.5).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => typeof v === 'string' && UUID.test(v);

async function blocked(db, req, targetType, targetId, clinicId) {
  await audit(db, req, {
    action: 'access.blocked',
    outcome: 'blocked',
    targetType,
    targetId: String(targetId ?? '').slice(0, 64),
    clinicId: clinicId ?? undefined,
  });
  return notFound();
}

/**
 * SQL condition limiting statements (aliased `alias`) to the user's scope.
 * Pushes its parameters onto `params`.
 */
export function statementScope(user, alias, params) {
  if (user.role === 'admin') return 'TRUE';
  if (user.role === 'specialist') {
    params.push(user.id);
    return `${alias}.clinic_id IN (SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $${params.length})`;
  }
  // Clinic users: own clinic, active statements only (FR-9.1, FR-10.4).
  params.push(user.clinic_id);
  return `(${alias}.clinic_id = $${params.length} AND ${alias}.status = 'active')`;
}

/** Clinics the user can see: null means all (admin). */
export async function visibleClinicIds(db, user) {
  if (user.role === 'admin') return null;
  if (user.role === 'clinic_user') return [user.clinic_id];
  const { rows } = await db.query('SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $1', [user.id]);
  return rows.map((r) => r.clinic_id);
}

export async function getVisibleClinic(db, req, clinicId) {
  if (!isUuid(clinicId)) throw await blocked(db, req, 'clinic', clinicId);
  const ids = await visibleClinicIds(db, req.user);
  if (ids && !ids.includes(clinicId)) throw await blocked(db, req, 'clinic', clinicId);
  const { rows } = await db.query('SELECT * FROM clinic WHERE id = $1', [clinicId]);
  if (!rows[0]) throw notFound();
  return rows[0];
}

/**
 * Specialists may publish only to assigned, active clinics (FR-6.1, schema 7.2).
 * Checked when a draft or import starts and again inside the publish transaction.
 */
export async function getPublishableClinic(db, req, clinicId) {
  if (req.user.role !== 'specialist' || !isUuid(clinicId)) throw await blocked(db, req, 'clinic', clinicId);
  const { rows } = await db.query(
    `SELECT c.* FROM clinic c
       JOIN specialist_assignment a ON a.clinic_id = c.id AND a.specialist_id = $2
      WHERE c.id = $1`,
    [clinicId, req.user.id],
  );
  const clinic = rows[0];
  if (!clinic) {
    await audit(db, req, { action: 'access.blocked', outcome: 'blocked', targetType: 'clinic', targetId: clinicId });
    throw new HttpError(403, 'You no longer have access to this clinic.');
  }
  if (!clinic.is_active) throw new HttpError(403, 'This clinic is inactive. Statements cannot be published to it.');
  return clinic;
}

/** Loads a statement the user may see, optionally locking it, or throws "not found". */
export async function getVisibleStatement(db, req, statementId, { forUpdate = false } = {}) {
  if (!isUuid(statementId)) throw await blocked(db, req, 'statement', statementId);
  const params = [statementId];
  const scope = statementScope(req.user, 's', params);
  const { rows } = await db.query(
    `SELECT s.* FROM statement s WHERE s.id = $1 AND ${scope}${forUpdate ? ' FOR UPDATE OF s' : ''}`,
    params,
  );
  if (!rows[0]) {
    const owner = await db.query('SELECT clinic_id FROM statement WHERE id = $1', [statementId]);
    throw await blocked(db, req, 'statement', statementId, owner.rows[0]?.clinic_id);
  }
  return rows[0];
}

/** Import batches and upload drafts are visible only to the specialist who created them (schema 7.2). */
export async function getOwnImportBatch(db, req, batchId, { forUpdate = false } = {}) {
  if (!isUuid(batchId)) throw await blocked(db, req, 'import_batch', batchId);
  const { rows } = await db.query(
    `SELECT b.*, c.name AS clinic_name, c.clinic_code
       FROM import_batch b JOIN clinic c ON c.id = b.clinic_id
      WHERE b.id = $1 AND b.specialist_id = $2
        AND b.clinic_id IN (SELECT clinic_id FROM specialist_assignment WHERE specialist_id = $2)
      ${forUpdate ? 'FOR UPDATE OF b' : ''}`,
    [batchId, req.user.id],
  );
  if (!rows[0]) throw await blocked(db, req, 'import_batch', batchId);
  return rows[0];
}

export async function getOwnDraft(db, req, draftId, { forUpdate = false } = {}) {
  if (!isUuid(draftId)) throw await blocked(db, req, 'upload_draft', draftId);
  const { rows } = await db.query(
    `SELECT d.*, c.name AS clinic_name, c.clinic_code
       FROM upload_draft d JOIN clinic c ON c.id = d.clinic_id
      WHERE d.id = $1 AND d.specialist_id = $2 ${forUpdate ? 'FOR UPDATE OF d' : ''}`,
    [draftId, req.user.id],
  );
  if (!rows[0]) throw await blocked(db, req, 'upload_draft', draftId);
  return rows[0];
}
