import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { randomToken, sha256 } from '../src/lib/crypto.js';

test('GET /api/notifications strict multi-tenant privacy enforcement', async (t) => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => server.close());

  // Get clinics and clinic users
  const { rows: clinics } = await pool.query("SELECT id, name FROM clinic WHERE is_active = true LIMIT 2");
  assert.ok(clinics.length >= 2, 'At least 2 active clinics exist for privacy test');
  const [clinicA, clinicB] = clinics;

  const { rows: users } = await pool.query(
    "SELECT u.id, u.email, u.role, u.clinic_id FROM app_user u WHERE u.status = 'active'"
  );

  let userA = users.find((u) => u.role === 'clinic_user' && u.clinic_id === clinicA.id);
  if (!userA) {
    userA = users.find((u) => u.role === 'clinic_user');
    await pool.query('UPDATE app_user SET clinic_id = $1 WHERE id = $2', [clinicA.id, userA.id]);
    userA.clinic_id = clinicA.id;
  }

  // Create or get user for Clinic B
  let userB = users.find((u) => u.role === 'clinic_user' && u.clinic_id === clinicB.id && u.id !== userA.id);
  if (!userB) {
    const { rows: newB } = await pool.query(
      `INSERT INTO app_user (email, full_name, role, clinic_id, status, is_clinic_admin)
       VALUES ($1, 'Privacy Test B', 'clinic_user', $2, 'active', false) RETURNING id, email, role, clinic_id`,
      [`privacy-test-b-${Date.now()}@test.com`, clinicB.id]
    );
    userB = newB[0];
  }

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

  // 1. Clinic User A requests notifications
  const tokenA = await createVerifiedSession(userA.id);
  const resA = await fetch(`${baseUrl}/api/notifications`, {
    headers: {
      Cookie: `mp_sid=${tokenA}`,
      'X-Requested-With': 'MyPatient',
    },
  });
  assert.equal(resA.status, 200);
  const dataA = await resA.json();

  // PRIVACY CHECK: Every single notification for User A MUST belong ONLY to Clinic A
  for (const notif of dataA.notifications) {
    assert.equal(notif.clinicName, clinicA.name, `Notification ${notif.id} must belong to Clinic A`);
    assert.notEqual(notif.clinicName, clinicB.name, `Notification ${notif.id} must NEVER belong to Clinic B`);
  }

  // 2. PRIVACY SPOOF CHECK: Clinic User A passes ?clinicId=clinicB.id to attempt cross-tenant access
  const resSpoof = await fetch(`${baseUrl}/api/notifications?clinicId=${clinicB.id}`, {
    headers: {
      Cookie: `mp_sid=${tokenA}`,
      'X-Requested-With': 'MyPatient',
    },
  });
  assert.equal(resSpoof.status, 200);
  const dataSpoof = await resSpoof.json();
  for (const notif of dataSpoof.notifications) {
    assert.equal(notif.clinicName, clinicA.name, 'Attempted spoof query param must be ignored');
    assert.notEqual(notif.clinicName, clinicB.name, 'User A must never see Clinic B data even with ?clinicId= param');
  }

  // 3. Clinic User B requests notifications
  const tokenB = await createVerifiedSession(userB.id);
  const resB = await fetch(`${baseUrl}/api/notifications`, {
    headers: {
      Cookie: `mp_sid=${tokenB}`,
      'X-Requested-With': 'MyPatient',
    },
  });
  assert.equal(resB.status, 200);
  const dataB = await resB.json();

  // PRIVACY CHECK: Every single notification for User B MUST belong ONLY to Clinic B
  for (const notif of dataB.notifications) {
    assert.equal(notif.clinicName, clinicB.name, `Notification ${notif.id} must belong to Clinic B`);
    assert.notEqual(notif.clinicName, clinicA.name, `Notification ${notif.id} must NEVER belong to Clinic A`);
  }

  // Clean up test user B if created
  if (userB.email.startsWith('privacy-test-b-')) {
    await pool.query('DELETE FROM user_session WHERE user_id = $1', [userB.id]);
    await pool.query('DELETE FROM app_user WHERE id = $1', [userB.id]);
  }
});
