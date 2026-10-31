import crypto from 'node:crypto';
import { config } from '../config.js';

// A short built-in list of the most common passwords. The breached-password
// check below covers the long tail.
const COMMON = new Set([
  'password', 'password1', 'password123', 'password1234', 'passw0rd', 'p@ssw0rd', 'p@ssword123',
  '123456789012', '1234567890123', 'qwertyuiop12', 'qwerty123456', 'iloveyou1234', 'welcome12345',
  'letmein12345', 'administrator', 'changeme1234', 'abc123456789', 'aaaaaaaaaaaa', '111111111111',
  'qwertyuiopas', 'football1234', 'baseball1234', 'superman1234', 'trustno1trustno1', 'mypatient123',
  'us24solutions', 'us24solutions1', 'healthcare123', 'welcome@1234', 'password@123', 'admin@123456',
]);

/** Checks the Have I Been Pwned range API. Only the first 5 hex characters of the SHA-1 hash leave the server. */
async function isBreached(password) {
  const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    headers: { 'Add-Padding': 'true' },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`HIBP ${res.status}`);
  const body = await res.text();
  return body.split('\n').some((line) => {
    const [s, count] = line.trim().split(':');
    return s === suffix && Number(count) > 0;
  });
}

/** Returns an error message, or null when the password is acceptable (FR-1.6). */
export async function checkPassword(password, { email, fullName } = {}) {
  if (typeof password !== 'string' || password.length < 12) return 'Use at least 12 characters.';
  if (password.length > 128) return 'Use 128 characters or fewer.';
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return 'That password is too common. Choose a different one.';
  if (/^(.)\1+$/.test(password)) return 'That password is too easy to guess.';
  if (email && lower.includes(email.toLowerCase().split('@')[0]) && email.split('@')[0].length >= 4) {
    return "Don't use your email address in your password.";
  }
  if (fullName && fullName.length >= 4 && lower.includes(fullName.toLowerCase().replace(/\s+/g, ''))) {
    return "Don't use your name in your password.";
  }
  if (config.breachedPasswordCheck) {
    try {
      if (await isBreached(password)) {
        return 'That password has appeared in a known data breach. Choose a different one.';
      }
    } catch {
      // Fail open when the service is unreachable (TRD Q7); the checks above still apply.
    }
  }
  return null;
}
