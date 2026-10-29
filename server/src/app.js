import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import { config } from './config.js';
import { HttpError } from './lib/errors.js';
import { csrfGuard, noStore, requireRole, requireVerified } from './middleware/guards.js';
import { loadSession } from './middleware/session.js';
import { adminRouter } from './routes/admin.js';
import { attachmentsRouter } from './routes/attachments.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { importsRouter } from './routes/imports.js';
import { requestsRouter } from './routes/requests.js';
import { statementsRouter } from './routes/statements.js';
import { uploadsRouter } from './routes/uploads.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) {
    // Trust only the load balancer's forwarded header (TRD 5.5).
    app.set('trust proxy', /^\d+$/.test(config.trustProxy) ? Number(config.trustProxy) : config.trustProxy);
  }

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https://us24solutions.com'],
          connectSrc: ["'self'"],
          frameSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
        },
      },
      frameguard: { action: 'deny' },
      referrerPolicy: { policy: 'same-origin' },
      hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', noStore, csrfGuard, loadSession);

  app.use('/api/auth', authRouter);
  app.use('/api/statements', requireVerified, statementsRouter);
  app.use('/api/uploads', requireVerified, requireRole('specialist'), uploadsRouter);
  app.use('/api/imports', requireVerified, requireRole('specialist'), importsRouter);
  app.use('/api/admin', requireVerified, requireRole('admin'), adminRouter);
  app.use('/api/requests', requireVerified, requestsRouter);
  app.use('/api/attachments', requireVerified, attachmentsRouter);
  app.use('/api', requireVerified, dashboardRouter);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, "We couldn't find that page.")));

  // Production: serve the built React app.
  const clientDist = path.resolve(config.serverRoot, '..', 'client', 'dist');
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Upload a file up to 10 MB.' : 'The upload could not be read.';
      return res.status(400).json({ error: message, fieldErrors: { [err.field || 'file']: message } });
    }
    if (err.type === 'entity.parse.failed' || err.type === 'entity.too.large') {
      return res.status(400).json({ error: 'The request could not be read.' });
    }
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, ...err.extra });
    }
    // Database rules (triggers, checks) that the app should already have caught.
    if (['23514', '42501'].includes(err.code)) {
      return res.status(409).json({ error: 'This change is not allowed.' });
    }
    const reference = crypto.randomUUID().slice(0, 8);
    // Log error details for diagnostics
    console.error(`[error ${reference}] ${req.method} ${req.route?.path ?? req.path.split('/').slice(0, 3).join('/')}`,
      err.name, err.code ?? '', err.message ?? '', config.isProduction ? (err.stack ? err.stack.split('\n').slice(0, 3).join(' ') : '') : err.stack);
    res.status(500).json({
      error: 'Something went wrong on our side. Please try again.',
      reference,
      ...(config.isProduction ? {} : { detail: err.message }),
    });
  });

  return app;
}
