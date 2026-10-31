// Audit writer (FR-13). Call it with the same client as the action it records so
// both commit or roll back together (schema section 8).

// details must never contain patient information; only these keys are kept.
const ALLOWED_DETAIL_KEYS = new Set([
  'include_remarks', 'rows_total', 'rows_valid', 'rows_invalid', 'rows_duplicate', 'rows_published',
  'rows_failed', 'rows_updated', 'skipped', 'changed_fields', 'filters', 'remark_type', 'method',
  'part', 'reason_code', 'role', 'status',
]);

function cleanDetails(details) {
  if (!details) return null;
  const out = {};
  for (const [key, value] of Object.entries(details)) {
    if (ALLOWED_DETAIL_KEYS.has(key) && value !== undefined) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function cleanEmail(email) {
  // A password typed into the email field would otherwise be recorded (schema 13.4).
  if (typeof email !== 'string' || !email.includes('@') || email.length > 254) return null;
  return email.trim().toLowerCase();
}

export async function audit(db, req, event) {
  const user = event.user !== undefined ? event.user : req?.user;
  await db.query(
    `INSERT INTO audit_event
       (actor_user_id, actor_role, attempted_email, clinic_id, action, target_type, target_id, outcome, ip_address, details)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      user?.id ?? null,
      user?.role ?? null,
      cleanEmail(event.attemptedEmail),
      event.clinicId ?? (user?.role === 'clinic_user' ? user.clinic_id : null),
      event.action,
      event.targetType ?? null,
      event.targetId != null ? String(event.targetId) : null,
      event.outcome ?? 'success',
      req?.ip ?? null,
      cleanDetails(event.details),
    ],
  );
}
