import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { audit } from '../lib/audit.js';
import { HttpError, notFound } from '../lib/errors.js';

/** Both sign-in steps must be complete before any patient data is reachable (FR-1.4). */
export function requireVerified(req, _res, next) {
  if (!req.user || req.session?.stage !== 'verified') {
    const message =
      req.sessionEnded === 'timeout'
        ? 'You were signed out after 15 minutes of inactivity.'
        : 'Your session has ended. Please sign in again.';
    return next(new HttpError(401, message, { reason: req.sessionEnded ?? 'signed_out' }));
  }
  next();
}

/** Another role's pages look like missing pages, and the attempt is logged (FR-2.5, I-04). */
export function requireRole(...roles) {
  return async (req, _res, next) => {
    if (roles.includes(req.user.role)) return next();
    await audit(pool, req, {
      action: 'access.blocked',
      outcome: 'blocked',
      targetType: 'url',
      targetId: `${req.method} ${req.baseUrl}${req.route?.path ?? ''}`.slice(0, 64),
    });
    next(notFound());
  };
}

const allowedOrigin = new URL(config.appUrl).origin;

/**
 * CSRF defence for the JSON API: state-changing requests must carry a custom
 * header (which a cross-site form or image cannot send) and, when the browser
 * sends an Origin, it must be the portal's own. The session cookie is also
 * SameSite=Strict.
 */
const LOCAL_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:4000',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:4000',
]);

export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'MyPatient') {
    return next(new HttpError(403, 'Request blocked.'));
  }
  const origin = req.get('origin');
  if (origin) {
    const isLocalDev = !config.isProduction && (
      LOCAL_ORIGINS.has(origin) ||
      origin.startsWith('http://localhost:') ||
      origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://192.168.') || origin.startsWith('http://10.') || origin.startsWith('http://172.')
    );

    const isAllowed =
      origin === allowedOrigin ||
      origin === `${req.protocol}://${req.get('host')}` ||
      isLocalDev;

    if (!isAllowed) {
      return next(new HttpError(403, 'Request blocked.'));
    }
  }
  next();
}

/** Responses with patient data must never be cached (TRD 5.3). */
export function noStore(_req, res, next) {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
}
