import { config } from '../config.js';
import { pool, query } from '../db/pool.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { audit } from '../lib/audit.js';

// Server-side sessions (schema 5.4). The cookie carries a random token; the
// database stores only its hash, plus the user id so every session of a user
// can be ended at once (FR-4.4).

const COOKIE = 'mp_sid';
const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'strict',
  secure: config.isProduction,
  path: '/',
});

const idleInterval = `${config.session.idleMinutes} minutes`;

export async function createSession(db, res, userId, ip) {
  const token = randomToken();
  const idHash = sha256(token);
  await db.query(
    `INSERT INTO user_session (id_hash, user_id, stage, ip_address, expires_at)
     VALUES ($1, $2, 'password', $3, now() + $4::interval)`,
    [idHash, userId, ip ?? null, idleInterval],
  );
  res.cookie(COOKIE, token, cookieOptions());
  return idHash;
}

export function clearSessionCookie(res) {
  res.clearCookie(COOKIE, cookieOptions());
}

export async function destroySession(db, idHash) {
  await db.query('DELETE FROM user_session WHERE id_hash = $1', [idHash]);
}

export async function endAllSessions(db, userId) {
  await db.query('DELETE FROM user_session WHERE user_id = $1', [userId]);
}

/** Loads req.session and req.user. Never rejects; route guards decide what is allowed. */
export async function loadSession(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next();

  const idHash = sha256(token);
  const { rows } = await query(
    `SELECT s.id_hash, s.stage, s.otp_hash, s.otp_expires_at, s.otp_sent_at, s.otp_failures,
            s.totp_pending_enc, s.expires_at < now() AS expired,
            u.id, u.email, u.full_name, u.role, u.is_clinic_admin, u.clinic_id, u.status, u.totp_secret_enc,
            u.totp_confirmed_at IS NOT NULL AS has_totp,
            c.name AS clinic_name, c.clinic_code, c.is_active AS clinic_active
       FROM user_session s
       JOIN app_user u ON u.id = s.user_id
       LEFT JOIN clinic c ON c.id = u.clinic_id
      WHERE s.id_hash = $1`,
    [idHash],
  );
  const row = rows[0];
  if (!row) {
    clearSessionCookie(res);
    return next();
  }

  const user = {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role, is_clinic_admin: Boolean(row.is_clinic_admin),
    clinic_id: row.clinic_id,
    clinic_name: row.clinic_name,
    clinic_code: row.clinic_code,
    has_totp: row.has_totp,
    totp_secret_enc: row.totp_secret_enc,
  };

  const blocked = row.status !== 'active' || (row.role === 'clinic_user' && !row.clinic_active);
  if (row.expired || blocked) {
    await destroySession(pool, idHash);
    if (row.expired && row.stage === 'verified') {
      await audit(pool, req, { user, action: 'auth.session_timeout' });
    }
    clearSessionCookie(res);
    req.sessionEnded = row.expired ? 'timeout' : 'ended';
    return next();
  }

  req.session = {
    idHash,
    stage: row.stage,
    otpHash: row.otp_hash,
    otpExpiresAt: row.otp_expires_at,
    otpSentAt: row.otp_sent_at,
    otpFailures: row.otp_failures,
    totpPendingEnc: row.totp_pending_enc,
  };
  req.user = user;

  // Sliding inactivity window (FR-1.9). The status poll must not count as activity.
  if (row.stage === 'verified' && req.path !== '/api/auth/session-status') {
    await query(
      `UPDATE user_session SET last_activity_at = now(), expires_at = now() + $2::interval WHERE id_hash = $1`,
      [idHash, idleInterval],
    );
  }
  next();
}
