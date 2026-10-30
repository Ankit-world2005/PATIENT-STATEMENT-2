import { existsSync } from 'node:fs';
import path from 'node:path';

const serverRoot = process.env.LAMBDA_TASK_ROOT || process.cwd();
const envFile = path.join(serverRoot, 'server', '.env');
const localEnvFile = path.join(serverRoot, '.env');
if (existsSync(envFile)) {
  try { process.loadEnvFile(envFile); } catch { /* ignore */ }
} else if (existsSync(localEnvFile)) {
  try { process.loadEnvFile(localEnvFile); } catch { /* ignore */ }
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

function resolveAppUrl() {
  if (env.APP_URL) return env.APP_URL;
  if (env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  if (isProduction) return 'https://us24solutions.vercel.app';
  return 'http://localhost:5173';
}

export const config = {
  isProduction,
  serverRoot,
  port: Number(env.PORT || 4000),
  databaseUrl: required('DATABASE_URL'),
  appSecret,
  // Public URL of the portal, used in invitation and reset links.
  appUrl: resolveAppUrl().replace(/\/$/, ''),
  trustProxy: env.TRUST_PROXY || (process.env.NETLIFY || process.env.VERCEL ? 1 : false),
  storageDir: env.STORAGE_DIR
    ? (path.isAbsolute(env.STORAGE_DIR) ? env.STORAGE_DIR : path.resolve(serverRoot, env.STORAGE_DIR))
    : (process.env.NETLIFY || process.env.LAMBDA_TASK_ROOT || process.env.VERCEL ? '/tmp/storage' : path.resolve(serverRoot, 'storage')),
  smtp: {
    service: env.SMTP_SERVICE || ((env.SMTP_HOST && env.SMTP_HOST.includes('gmail')) || (env.SMTP_USER && env.SMTP_USER.includes('@gmail.com')) ? 'gmail' : undefined),
    host: env.SMTP_HOST || (env.SMTP_USER && env.SMTP_USER.includes('@gmail.com') ? 'smtp.gmail.com' : 'localhost'),
    port: Number(env.SMTP_PORT || (env.SMTP_USER && env.SMTP_USER.includes('@gmail.com') ? 465 : 1025)),
    secure: bool('SMTP_SECURE', env.SMTP_PORT === '465' || Boolean(env.SMTP_USER && env.SMTP_USER.includes('@gmail.com'))),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
  },
  mailFrom: env.MAIL_FROM || (env.SMTP_USER ? `My Patient <${env.SMTP_USER}>` : 'My Patient <no-reply@us24solutions.com>'),
  // Development aid: print codes and links to the console. Can be enabled in staging via DEV_LOG_EMAIL=true.
  devLogEmail: bool('DEV_LOG_EMAIL', !isProduction),
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
