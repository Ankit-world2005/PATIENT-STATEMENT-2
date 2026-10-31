import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { randomToken, sha256 } from '../src/lib/crypto.js';

test('GET /api/notifications returns contextual notifications for users', async (t) => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => server.close());

  // Get active users for testing
  const { rows: users } = await pool.query(
    "SELECT u.id, u.email, u.role, u.clinic_id FROM app_user u WHERE u.status = 'active'"
  );
  const specialist = users.find((u) => u.role === 'specialist') || users.find((u) => u.role === 'admin');
  const clinicUser = users.find((u) => u.role === 'clinic_user' && u.clinic_id);

  assert.ok(specialist, 'Specialist or Admin user exists');
  assert.ok(clinicUser, 'Clinic user exists');

  async function createVerifiedSession(userId) {
    const token = randomToken();
    const idHash = sha256(token);
    await pool.query(
      `INSERT INTO user_session (id_hash, user_id, stage, expires_at)
       VALUES ($1, $2, 'verified', now() + interval '1 hour')`,
      [idHash, userId]
    );
    return token;
  }

  // 1. Test Specialist notifications
  const specToken = await createVerifiedSession(specialist.id);
  const specRes = await fetch(`${baseUrl}/api/notifications`, {
    headers: {
      Cookie: `mp_sid=${specToken}`,
      'X-Requested-With': 'MyPatient',
    },
  });
  assert.equal(specRes.status, 200);
  const specData = await specRes.json();
  assert.ok(Array.isArray(specData.notifications), 'Notifications is an array');
  assert.equal(typeof specData.totalCount, 'number');

  // 2. Test Clinic user notifications
  const clinicToken = await createVerifiedSession(clinicUser.id);
  const clinicRes = await fetch(`${baseUrl}/api/notifications`, {
    headers: {
      Cookie: `mp_sid=${clinicToken}`,
      'X-Requested-With': 'MyPatient',
    },
  });
  assert.equal(clinicRes.status, 200);
  const clinicData = await clinicRes.json();
  assert.ok(Array.isArray(clinicData.notifications), 'Clinic notifications is an array');
  assert.equal(typeof clinicData.totalCount, 'number');

  // 3. Test unauthenticated request is rejected
  const unauthRes = await fetch(`${baseUrl}/api/notifications`, {
    headers: { 'X-Requested-With': 'MyPatient' },
  });
  assert.equal(unauthRes.status, 401);
});
