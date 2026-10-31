import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/lib/crypto.js';

async function main() {
  const email = 'manish.v@us24solutions.com';
  const fullName = 'Manish V.';
  const password = 'manish@123#';
  const role = 'specialist';

  console.log(`[setup] Provisioning US24 Specialist: ${email}...`);

  const passwordHash = await hashPassword(password);

  // 1. Get an admin ID for attribution / invited_by
  const adminRes = await pool.query(`SELECT id FROM app_user WHERE role = 'admin' LIMIT 1`);
  const adminId = adminRes.rows[0]?.id || null;

  // 2. Check if user already exists
  let userId;
  const existingUser = await pool.query(`SELECT id, email, role, status FROM app_user WHERE email = $1`, [email]);
  if (existingUser.rows.length > 0) {
    userId = existingUser.rows[0].id;
    await pool.query(
      `UPDATE app_user
       SET full_name = $1, role = $2, clinic_id = NULL, status = 'active',
           password_hash = $3, password_changed_at = now(), activated_at = now(), updated_at = now()
       WHERE id = $4`,
      [fullName, role, passwordHash, userId]
    );
    console.log(`[setup] Updated existing user ${email} to specialist role -> ID ${userId}`);
  } else {
    const ins = await pool.query(
      `INSERT INTO app_user (email, full_name, role, clinic_id, status, password_hash, password_changed_at, activated_at, invited_by_id)
       VALUES ($1, $2, $3, NULL, 'active', $4, now(), now(), $5)
       RETURNING id`,
      [email, fullName, role, passwordHash, adminId]
    );
    userId = ins.rows[0].id;
    console.log(`[setup] Created new specialist ${email} -> ID ${userId}`);
  }

  // 3. Assign this specialist to all active clinics so they can access statements
  const clinics = await pool.query(`SELECT id, name, clinic_code FROM clinic WHERE is_active = true`);
  for (const c of clinics.rows) {
    await pool.query(
      `INSERT INTO specialist_assignment (specialist_id, clinic_id, assigned_by_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (specialist_id, clinic_id) DO NOTHING`,
      [userId, c.id, adminId]
    );
    console.log(`[setup] Assigned specialist to clinic: ${c.name} (${c.clinic_code})`);
  }

  // 4. Verify user record
  const verify = await pool.query(
    `SELECT id, email, full_name, role, status, clinic_id, activated_at
     FROM app_user WHERE email = $1`,
    [email]
  );
  console.log('[setup] Verification result:', verify.rows[0]);

  // 5. Count clinic assignments
  const assignCount = await pool.query(
    `SELECT count(*)::int as count FROM specialist_assignment WHERE specialist_id = $1`,
    [userId]
  );
  console.log(`[setup] Total clinics assigned to Manish: ${assignCount.rows[0].count}`);

  await pool.end();
}

main().catch((err) => {
  console.error('[setup] Error:', err);
  process.exit(1);
});
