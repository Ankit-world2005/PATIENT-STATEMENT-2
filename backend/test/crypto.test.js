import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  base32Encode, decrypt, encrypt, hashPassword, readLink, signLink, totpAt, verifyLink, verifyPassword, verifyTotp,
} from '../src/lib/crypto.js';
import { checkPassword } from '../src/lib/password-policy.js';

test('password hashes verify only the right password', async () => {
  const hash = await hashPassword('correct horse battery staple');
  assert.ok(await verifyPassword('correct horse battery staple', hash));
  assert.equal(await verifyPassword('wrong password here', hash), false);
  assert.equal(await verifyPassword('anything', null), false); // unknown email path
});

test('TOTP matches the RFC 6238 SHA-1 test vector', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.equal(totpAt(secret, 1), '287082'); // T = 59 s
  assert.ok(verifyTotp(secret, '287082', 59_000));
  assert.ok(verifyTotp(secret, '287082', 75_000)); // one step of clock drift
  assert.equal(verifyTotp(secret, '287082', 200_000), false);
});

test('signed links expire and stop working when the user state changes', () => {
  const token = signLink({ userId: 'u1', purpose: 'reset', ttlSeconds: 60, fingerprint: 'hash-a' });
  assert.equal(readLink(token, 'reset').u, 'u1');
  assert.equal(readLink(token, 'invite'), null);
  assert.ok(verifyLink(token, 'hash-a'));
  assert.equal(verifyLink(token, 'hash-b'), false);
  const expired = signLink({ userId: 'u1', purpose: 'reset', ttlSeconds: -1, fingerprint: 'hash-a' });
  assert.equal(verifyLink(expired, 'hash-a'), false);
});

test('authenticator secrets round-trip through encryption', () => {
  const sealed = encrypt('JBSWY3DPEHPK3PXP');
  assert.notEqual(sealed, 'JBSWY3DPEHPK3PXP');
  assert.equal(decrypt(sealed), 'JBSWY3DPEHPK3PXP');
});

test('password policy enforces length, common passwords and personal info', async () => {
  assert.match(await checkPassword('short'), /12 characters/);
  assert.match(await checkPassword('password1234'), /too common/);
  assert.match(await checkPassword('janedoe-is-great-2026', { email: 'janedoe@x.com' }), /email/);
});
