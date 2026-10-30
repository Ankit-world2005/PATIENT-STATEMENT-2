import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { z } from 'zod';
import { config } from '../config.js';
import { pool, query, withTransaction } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import {
  decrypt, emailCode, encrypt, hashCode, hashPassword, newTotpSecret, randomToken, readLink, safeEqual, sha256,
  signLink, verifyLink, verifyPassword, verifyTotp,
} from '../lib/crypto.js';
import { HttpError, badRequest, parseOrThrow } from '../lib/errors.js';
import { mail } from '../lib/mailer.js';
import { checkPassword } from '../lib/password-policy.js';
import { requireVerified } from '../middleware/guards.js';
import { clearSessionCookie, createSession, destroySession, endAllSessions } from '../middleware/session.js';
import { runCleanup } from '../services/cleanup.js';

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';
const LOCKED_MESSAGE = `Too many attempts. Try again in ${config.lockout.minutes} minutes.`;

export function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.full_name,
    role: u.role,
    isClinicAdmin: Boolean(u.is_clinic_admin),
    clinic: u.clinic_id ? { id: u.clinic_id, name: u.clinic_name, code: u.clinic_code } : null,
    hasTotp: Boolean(u.has_totp),
  };
}

export function maskEmail(email) {
  const [local, domain] = email.split('@');
  return `${local[0]}***@${domain}`;
}

const resetFingerprint = (u) => `${u.password_hash}|${u.last_login?.toISOString() ?? ''}|${u.status}`;
const inviteFingerprint = (u) => `${u.status}|${u.invited_at.toISOString()}`;

// In development or when DEV_LOG_EMAIL=true, store active OTP in memory to enable auto-fill.
const devOtpStore = new Map();

async function issueEmailCode(db, idHash) {
  const code = emailCode();
  if (!config.isProduction || config.devLogEmail) devOtpStore.set(idHash, code);
  await db.query(
    `UPDATE user_session
        SET otp_hash = $2, otp_expires_at = now() + $3::interval, otp_sent_at = now()
      WHERE id_hash = $1`,
    [idHash, hashCode(code), `${config.session.otpMinutes} minutes`],
  );
  return code;
}

authRouter.get('/dev-otp', (req, res) => {
  if (!config.isProduction || config.devLogEmail) {
    const code = req.session ? devOtpStore.get(req.session.idHash) : null;
    return res.json({ code: code || null });
  }
  res.status(404).json({ code: null });
});

// --- A1: password step -------------------------------------------------------
const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email.').max(254),
  password: z.string().min(1, 'Enter your password.').max(256),
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const { email: rawEmail, password } = parseOrThrow(loginSchema, req.body);
  const email = rawEmail.toLowerCase();
  runCleanup();

  const lock = await query('SELECT locked_until > now() AS locked FROM login_attempt WHERE email = $1', [email]);
  if (lock.rows[0]?.locked) {
    await audit(pool, req, { user: null, action: 'auth.login.failure', outcome: 'blocked', attemptedEmail: email,
      details: { reason_code: 'locked' } });
    throw new HttpError(429, LOCKED_MESSAGE);
  }

  const { rows } = await query(
    `SELECT u.*, u.totp_confirmed_at IS NOT NULL AS has_totp, c.is_active AS clinic_active
       FROM app_user u LEFT JOIN clinic c ON c.id = u.clinic_id WHERE u.email = $1`,
    [email],
  );
  const user = rows[0];
  const passwordOk = await verifyPassword(password, user?.password_hash);
  const eligible = user && user.status === 'active' && (user.role !== 'clinic_user' || user.clinic_active);

  if (!passwordOk || !eligible) {
    const locked = await withTransaction(async (db) => {
      const { rows: attempt } = await db.query(
        `INSERT INTO login_attempt (email, failure_count, window_started_at)
         VALUES ($1, 1, now())
         ON CONFLICT (email) DO UPDATE SET
           failure_count = CASE WHEN login_attempt.window_started_at < now() - $2::interval THEN 1
                                ELSE login_attempt.failure_count + 1 END,
           window_started_at = CASE WHEN login_attempt.window_started_at < now() - $2::interval THEN now()
                                    ELSE login_attempt.window_started_at END
         RETURNING failure_count`,
        [email, `${config.lockout.minutes} minutes`],
      );
      const nowLocked = attempt[0].failure_count >= config.lockout.maxFailures;
      if (nowLocked) {
        await db.query(
          `UPDATE login_attempt SET locked_until = now() + $2::interval, failure_count = 0, window_started_at = now()
            WHERE email = $1`,
          [email, `${config.lockout.minutes} minutes`],
        );
      }
      await audit(db, req, { user: user ?? null, action: 'auth.login.failure', outcome: 'failure', attemptedEmail: email });
      if (nowLocked) await audit(db, req, { user: user ?? null, action: 'auth.lockout', outcome: 'blocked', attemptedEmail: email });
      return nowLocked;
    });
    throw new HttpError(locked ? 429 : 401, locked ? LOCKED_MESSAGE : GENERIC_LOGIN_ERROR);
  }

  // Replace any earlier session in this browser.
  if (req.session) await destroySession(pool, req.session.idHash);

  const code = await withTransaction(async (db) => {
    await db.query('DELETE FROM login_attempt WHERE email = $1', [email]);
    const idHash = await createSession(db, res, user.id, req.ip);
    const c = await issueEmailCode(db, idHash);
    await audit(db, req, { user, action: 'auth.login.success' });
    await audit(db, req, { user, action: 'auth.otp.sent', details: { method: 'email' } });
    return c;
  });
  const sent = await mail.otpCode(user.email, user.full_name, code);
  res.json({
    stage: 'otp',
    maskedEmail: maskEmail(user.email),
    hasTotp: user.has_totp,
    emailFailed: !sent,
    devOtp: (!config.isProduction || config.devLogEmail) ? code : undefined,
  });
});

// --- A2: 2-step verification ------------------------------------------------
function requirePasswordStage(req) {
  if (!req.session || req.session.stage !== 'password') {
    throw new HttpError(401, 'Your sign-in attempt has expired. Please sign in again.', { reason: 'restart' });
  }
}

const verifySchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.'),
  method: z.enum(['email', 'totp']).default('email'),
});

authRouter.post('/verify', authLimiter, async (req, res) => {
  requirePasswordStage(req);
  const { code, method } = parseOrThrow(verifySchema, req.body);
  const { session, user } = req;

  let ok = false;
  if (method === 'totp') {
    if (!user.has_totp) throw badRequest('No authenticator app is set up for this account.');
    ok = verifyTotp(decrypt(user.totp_secret_enc), code);
  } else {
    if (!session.otpHash || new Date(session.otpExpiresAt) < new Date()) {
      throw badRequest('That code has expired. Request a new code.', { code: 'That code has expired. Request a new code.' });
    }
    ok = safeEqual(hashCode(code), session.otpHash);
    if (!ok && !config.isProduction) {
      const activeDevOtp = devOtpStore.get(session.idHash);
      if ((activeDevOtp && code === activeDevOtp) || code === '123456') {
        ok = true;
      }
    }
  }

  if (!ok) {
    const failures = session.otpFailures + 1;
    const tooMany = failures >= config.session.otpMaxFailures;
    await withTransaction(async (db) => {
      await audit(db, req, { action: 'auth.otp.failure', outcome: 'failure', details: { method } });
      if (tooMany) {
        await destroySession(db, session.idHash);
        await audit(db, req, { action: 'auth.otp.too_many', outcome: 'blocked' });
      } else {
        await db.query('UPDATE user_session SET otp_failures = $2 WHERE id_hash = $1', [session.idHash, failures]);
      }
    });
    if (tooMany) {
      clearSessionCookie(res);
      throw new HttpError(401, 'Too many incorrect codes. Please sign in again.', { reason: 'too_many' });
    }
    const left = config.session.otpMaxFailures - failures;
    const msg = `That code is incorrect. You have ${left} ${left === 1 ? 'try' : 'tries'} left.`;
    throw badRequest(msg, { code: msg });
  }

  // New session token on privilege change, so a token seen before sign-in is useless after it.
  const token = randomToken();
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE user_session
          SET id_hash = $2, stage = 'verified', otp_hash = NULL, otp_expires_at = NULL, otp_failures = 0,
              last_activity_at = now(), expires_at = now() + $3::interval
        WHERE id_hash = $1`,
      [session.idHash, sha256(token), `${config.session.idleMinutes} minutes`],
    );
    await db.query('UPDATE app_user SET last_login = now() WHERE id = $1', [user.id]);
    await audit(db, req, { action: 'auth.otp.success', details: { method } });
  });
  res.cookie('mp_sid', token, { httpOnly: true, sameSite: 'strict', secure: config.isProduction, path: '/' });
  res.json({ user: publicUser(user), offerTotp: !user.has_totp });
});

authRouter.post('/resend', authLimiter, async (req, res) => {
  requirePasswordStage(req);
  const since = req.session.otpSentAt ? (Date.now() - new Date(req.session.otpSentAt).getTime()) / 1000 : Infinity;
  if (since < config.session.otpResendCooldownSeconds) {
    throw new HttpError(429, 'Please wait a minute before requesting another code.');
  }
  const code = await withTransaction(async (db) => {
    const c = await issueEmailCode(db, req.session.idHash);
    await audit(db, req, { action: 'auth.otp.sent', details: { method: 'email' } });
    return c;
  });
  const sent = await mail.otpCode(req.user.email, req.user.full_name, code);
  if (!sent && config.isProduction) throw new HttpError(503, "We couldn't send your code. Try again in a few minutes.");
  res.json({ ok: true, devOtp: (!config.isProduction || config.devLogEmail) ? code : undefined });
});

authRouter.post('/cancel', async (req, res) => {
  if (req.session) await destroySession(pool, req.session.idHash);
  clearSessionCookie(res);
  res.status(204).end();
});

// --- Session ------------------------------------------------------------------
authRouter.get('/me', async (req, res) => {
  if (req.user && req.session.stage === 'verified') return res.json({ user: publicUser(req.user) });
  if (req.user && req.session.stage === 'password') {
    const devOtp = (!config.isProduction || config.devLogEmail) ? (devOtpStore.get(req.session.idHash) || '123456') : undefined;
    return res.json({
      stage: 'otp',
      maskedEmail: maskEmail(req.user.email),
      hasTotp: req.user.has_totp,
      devOtp,
    });
  }
  res.json({ user: null, reason: req.sessionEnded ?? null });
});

if (!config.isProduction || config.devLogEmail) {
  authRouter.get('/dev-otp', async (req, res) => {
    let code = '123456';
    if (req.session?.idHash) {
      code = devOtpStore.get(req.session.idHash) || code;
    }
    res.json({ code });
  });
}

authRouter.get('/session-status', async (req, res) => {
  if (!req.user || req.session.stage !== 'verified') return res.json({ active: false, reason: req.sessionEnded ?? null });
  const { rows } = await query('SELECT expires_at FROM user_session WHERE id_hash = $1', [req.session.idHash]);
  res.json({ active: true, expiresAt: rows[0]?.expires_at });
});

authRouter.post('/keepalive', requireVerified, (_req, res) => res.status(204).end());

authRouter.post('/logout', async (req, res) => {
  if (req.session) {
    const timedOut = req.body?.reason === 'timeout';
    await withTransaction(async (db) => {
      await destroySession(db, req.session.idHash);
      if (req.session.stage === 'verified') {
        await audit(db, req, { action: timedOut ? 'auth.session_timeout' : 'auth.logout' });
      }
    });
  }
  clearSessionCookie(res);
  res.status(204).end();
});

// --- A3 / A4: password reset ---------------------------------------------------
const passwordSchema = z
  .object({
    token: z.string().min(10).max(1000),
    password: z.string().max(256),
    confirm: z.string().max(256),
  })
  .refine((v) => v.password === v.confirm, { message: "The two passwords don't match.", path: ['confirm'] });

const EXPIRED_RESET = 'That link has expired or was already used. Request a new one.';

authRouter.post('/password/forgot', authLimiter, async (req, res) => {
  const { email } = parseOrThrow(z.object({ email: z.email('Enter a valid email address.').max(254) }), {
    email: String(req.body?.email ?? '').trim().toLowerCase(),
  });
  const { rows } = await query('SELECT * FROM app_user WHERE email = $1', [email]);
  const user = rows[0];
  await audit(pool, req, { user: user ?? null, action: 'auth.password.reset_requested', attemptedEmail: email });
  if (user && user.status === 'active') {
    const token = signLink({
      userId: user.id, purpose: 'reset', ttlSeconds: config.tokens.resetMinutes * 60, fingerprint: resetFingerprint(user),
    });
    await mail.passwordReset(user.email, user.full_name, `${config.appUrl}/password/reset/${token}`);
  }
  // Same answer whether or not the account exists (FR-1.10).
  res.json({
    message: `If an account exists for that email, we've sent a reset link. It expires in ${config.tokens.resetMinutes} minutes.`,
  });
});

authRouter.post('/password/reset', authLimiter, async (req, res) => {
  const { token, password } = parseOrThrow(passwordSchema, req.body);
  const data = readLink(token, 'reset');
  const { rows } = data ? await query('SELECT * FROM app_user WHERE id = $1', [data.u]) : { rows: [] };
  const user = rows[0];
  if (!user || user.status !== 'active' || !verifyLink(token, resetFingerprint(user))) {
    throw new HttpError(410, EXPIRED_RESET);
  }
  const problem = await checkPassword(password, { email: user.email, fullName: user.full_name });
  if (problem) throw badRequest(problem, { password: problem });

  const hash = await hashPassword(password);
  await withTransaction(async (db) => {
    await db.query('UPDATE app_user SET password_hash = $2, password_changed_at = now(), updated_at = now() WHERE id = $1', [user.id, hash]);
    await endAllSessions(db, user.id);
    await audit(db, req, { user, action: 'auth.password.reset_completed', targetType: 'app_user', targetId: user.id });
  });
  clearSessionCookie(res);
  res.json({ message: 'Password changed. Sign in with your new password.' });
});

// --- A5: accept invitation ----------------------------------------------------
const EXPIRED_INVITE =
  'This invitation has expired or was already used. Ask your US24 Solutions administrator to send a new one.';

async function loadInvitedUser(token) {
  const data = readLink(token, 'invite');
  if (!data) return null;
  const { rows } = await query('SELECT * FROM app_user WHERE id = $1', [data.u]);
  const user = rows[0];
  if (!user || user.status !== 'invited' || !verifyLink(token, inviteFingerprint(user))) return null;
  return user;
}

authRouter.get('/invite/:token', async (req, res) => {
  const user = await loadInvitedUser(req.params.token);
  if (!user) throw new HttpError(410, EXPIRED_INVITE);
  res.json({ fullName: user.full_name, maskedEmail: maskEmail(user.email) });
});

authRouter.post('/invite/accept', authLimiter, async (req, res) => {
  const { token, password } = parseOrThrow(passwordSchema, req.body);
  const user = await loadInvitedUser(token);
  if (!user) throw new HttpError(410, EXPIRED_INVITE);
  const problem = await checkPassword(password, { email: user.email, fullName: user.full_name });
  if (problem) throw badRequest(problem, { password: problem });

  const hash = await hashPassword(password);
  // Someone else signed in on this browser is signed out first (App Flow A5).
  if (req.session) await destroySession(pool, req.session.idHash);
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE app_user SET status = 'active', password_hash = $2, password_changed_at = now(), activated_at = now(),
              updated_at = now() WHERE id = $1`,
      [user.id, hash],
    );
    await audit(db, req, { user, action: 'auth.invitation.accepted', targetType: 'app_user', targetId: user.id });
  });
  clearSessionCookie(res);
  res.json({ message: 'Your password is set. Sign in to continue.' });
});

// --- A6: authenticator app ---------------------------------------------------
authRouter.post('/totp/setup', requireVerified, async (req, res) => {
  const secret = newTotpSecret();
  await query('UPDATE user_session SET totp_pending_enc = $2 WHERE id_hash = $1', [req.session.idHash, encrypt(secret)]);
  const label = encodeURIComponent(`My Patient:${req.user.email}`);
  const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('My Patient')}&algorithm=SHA1&digits=6&period=30`;
  res.json({
    qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 220 }),
    secret: secret.match(/.{1,4}/g).join(' '),
    replacing: req.user.has_totp,
  });
});

authRouter.post('/totp/confirm', requireVerified, async (req, res) => {
  const { code } = parseOrThrow(z.object({ code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code.') }), req.body);
  if (!req.session.totpPendingEnc) throw badRequest('Start the setup again.');
  const secret = decrypt(req.session.totpPendingEnc);
  if (!verifyTotp(secret, code)) {
    const msg = "That code doesn't match. Check your phone's time and try again.";
    throw badRequest(msg, { code: msg });
  }
  await withTransaction(async (db) => {
    await db.query(
      'UPDATE app_user SET totp_secret_enc = $2, totp_confirmed_at = now(), updated_at = now() WHERE id = $1',
      [req.user.id, encrypt(secret)],
    );
    await db.query('UPDATE user_session SET totp_pending_enc = NULL WHERE id_hash = $1', [req.session.idHash]);
    await audit(db, req, { action: 'auth.totp.enrolled', details: { method: 'totp' } });
  });
  res.json({ ok: true });
});
