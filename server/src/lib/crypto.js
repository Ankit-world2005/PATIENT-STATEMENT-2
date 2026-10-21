import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

const scrypt = promisify(crypto.scrypt);

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

export function safeEqual(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function deriveKey(purpose) {
  return Buffer.from(crypto.hkdfSync('sha256', config.appSecret, '', `mypatient:${purpose}`, 32));
}

// --- Passwords (scrypt, per-user salt) ---------------------------------------
const SCRYPT = { N: 32768, r: 8, p: 1, keylen: 64 };

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password.normalize('NFKC'), salt, SCRYPT.keylen, {
    N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2,
  });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// A valid hash of a random password, verified against when the email is unknown
// so both paths take the same time (FR-1.10).
let dummyHash;
export async function verifyPassword(password, stored) {
  if (!stored) {
    dummyHash ??= await hashPassword(randomToken());
    stored = dummyHash;
    password = `${password}\u0000never-matches`;
  }
  const [scheme, N, r, p, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: 128 * Number(N) * Number(r) * 2,
  });
  return crypto.timingSafeEqual(actual, expected);
}

// --- Signed, stateless, single-use links (schema 3.3) ------------------------
// The signature covers a fingerprint of the user's current state, so the link
// stops working as soon as that state changes (password set, invite resent...).
const linkKey = () => deriveKey('links');

export function signLink({ userId, purpose, ttlSeconds, fingerprint }) {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, p: purpose, e: Math.floor(Date.now() / 1000) + ttlSeconds }),
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', linkKey()).update(`${payload}|${fingerprint}`).digest('base64url');
  return `${payload}.${sig}`;
}

/** Returns the payload without verifying the signature; call verifyLink once the user's fingerprint is known. */
export function readLink(token, purpose) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  try {
    const data = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
    if (data.p !== purpose || typeof data.u !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

export function verifyLink(token, fingerprint) {
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', linkKey()).update(`${payload}|${fingerprint}`).digest('base64url');
  if (!safeEqual(sig, expected)) return false;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return data.e > Math.floor(Date.now() / 1000);
}

// --- Symmetric encryption for authenticator secrets (schema Q-6) -------------
export function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKey('totp-secret'), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.');
}

export function decrypt(value) {
  const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', deriveKey('totp-secret'), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// --- One-time codes ----------------------------------------------------------
export const emailCode = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
export const hashCode = (code) => crypto.createHmac('sha256', deriveKey('otp')).update(code).digest('hex');

// --- TOTP (RFC 6238: SHA-1, 30 s, 6 digits) -----------------------------------
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of str.replace(/=+$/, '').toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newTotpSecret = () => base32Encode(crypto.randomBytes(20));

export function totpAt(secretB32, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const offset = mac[mac.length - 1] & 15;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return bin.toString().padStart(6, '0');
}

/** Accepts the current 30-second step and one step either side for clock drift. */
export function verifyTotp(secretB32, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  const step = Math.floor(now / 30_000);
  return [-1, 0, 1].some((d) => safeEqual(totpAt(secretB32, step + d), code));
}
