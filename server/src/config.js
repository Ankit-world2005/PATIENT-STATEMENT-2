import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const currentDir = typeof __dirname !== 'undefined'
  ? __dirname
  : (typeof import.meta !== 'undefined' && import.meta.url ? path.dirname(fileURLToPath(import.meta.url)) : process.cwd());
const serverRoot = path.resolve(currentDir, '..');
const envFile = path.join(serverRoot, '.env');
if (existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch { /* ignore */ }
}

const env = process.env;
const isProduction = env.NODE_ENV === 'production';

function required(name) {
  const value = env[name];
  if (!value) throw new Error(`Missing required environment variable ${name}. See server/.env.example.`);
  return value;
}

function bool(name, fallback) {
  if (env[name] === undefined) return fallback;
  return ['1', 'true', 'yes'].includes(env[name].toLowerCase());
}

const appSecret = required('APP_SECRET');
if (appSecret.length < 32) throw new Error('APP_SECRET must be at least 32 characters.');

export const config = {
  isProduction,
  serverRoot,
  port: Number(env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  appSecret,
  // Public URL of the portal, used in invitation and reset links.
  appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
  trustProxy: env.TRUST_PROXY || (process.env.NETLIFY ? 1 : false),
  storageDir: env.STORAGE_DIR
    ? (path.isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : path.resolve(serverRoot, env.STORAGE_DIR))
    : (process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT ? '/tmp/storage' : path.resolve(serverRoot, 'storage')),
  smtp: {
    host: env.SMTP_HOST || 'localhost',
    port: Number(env.SMTP_PORT || 1025),
    secure: bool('SMTP_SECURE', false),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
  mailFrom: env.MAIL_FROM || 'My Patient <no-reply@us24solutions.com>',
  // Development aid: print codes and links to the console. Never enabled in production.
  devLogEmail: !isProduction && bool('DEV_LOG_EMAIL', true),
  breachedPasswordCheck: bool('BREACHED_PASSWORD_CHECK', true),
  session: {
    idleMinutes: 15, // FR-1.9
    otpMinutes: 10, // FR-1.3
    otpMaxFailures: 5, // FR-1.3
    otpResendCooldownSeconds: 60, // I-02
  },
  lockout: { maxFailures: 5, minutes: 15 }, // FR-1.5
  tokens: { resetMinutes: 30, inviteHours: 72 }, // FR-1.7, FR-1.8
  uploads: { maxBytes: 10 * 1024 * 1024, maxImportRows: 5000 }, // FR-6.2, FR-7.7
};
