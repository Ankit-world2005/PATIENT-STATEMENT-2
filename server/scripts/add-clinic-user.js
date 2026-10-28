import { pool } from '../src/db/pool.js';
import { hashPassword } from '../src/lib/crypto.js';

async function main() {
  const email = 'westaz.mypatient@gmail.com';
  const password = 'westaz@123#';
  const fullName = 'WestAZ Clinic';

  console.log(`[setup] Provisioning user ${email} with password ${password}...`);

  // 1. Find or create WestAZ clinic
  let clinicRes = await pool.query(
    `SELECT id, name, clinic_code FROM clinic WHERE name ILIKE '%westaz%' OR contact_email = $1 OR clinic_code = 'CLN-0001' LIMIT 1`,
    [email]
  );

  let clinicId;
  if (clinicRes.rows.length > 0) {
    clinicId = clinicRes.rows[0].id;
    console.log(`[setup] Found existing clinic: ${clinicRes.rows[0].name} (${clinicRes.rows[0].clinic_code}) [${clinicId}]`);
  } else {
    const adminRes = await pool.query(`SELECT id FROM app_user WHERE role = 'admin' LIMIT 1`);
    const adminId = adminRes.rows[0]?.id || null;

    const ins = await pool.query(
      `INSERT INTO clinic (name, clinic_code, address_line1, city, state, postal_code, contact_name, contact_phone, contact_email, created_by_id, is_active)
       VALUES ('WestAZ', 'CLN-0001', '100 Medical Center Blvd', 'Phoenix', 'AZ', '85001', 'WestAZ Manager', '(602) 555-0100', $1, $2, true)
       RETURNING id, name, clinic_code`,
      [email, adminId]
    );
    clinicId = ins.rows[0].id;
    console.log(`[setup] Created new clinic: ${ins.rows[0].name} (${ins.rows[0].clinic_code}) [${clinicId}]`);
  }

  // 2. Hash password
  const passwordHash = await hashPassword(password);

  // 3. Insert or update app_user
  const userCheck = await pool.query(`SELECT id, email, role, status FROM app_user WHERE email = $1`, [email]);
  if (userCheck.rows.length > 0) {
    const userId = userCheck.rows[0].id;
    await pool.query(
      `UPDATE app_user
       SET full_name = $1, role = 'clinic_user', clinic_id = $2, status = 'active',
           password_hash = $3, password_changed_at = now(), activated_at = now(), updated_at = now()
       WHERE id = $4`,
      [fullName, clinicId, passwordHash, userId]
    );
    console.log(`[setup] Updated existing user: ${email} -> ID ${userId}`);
  } else {
    const insUser = await pool.query(
      `INSERT INTO app_user (email, full_name, role, clinic_id, status, password_hash, password_changed_at, activated_at)
       VALUES ($1, $2, 'clinic_user', $3, 'active', $4, now(), now())
       RETURNING id`,
      [email, fullName, clinicId, passwordHash]
    );
    console.log(`[setup] Created new user: ${email} -> ID ${insUser.rows[0].id}`);
  }

  // 4. Assign specialist to this clinic if specialist exists
  const specRes = await pool.query(`SELECT id FROM app_user WHERE email = 'ankit.k@us24solutions.com' LIMIT 1`);
  if (specRes.rows.length > 0) {
    const specialistId = specRes.rows[0].id;
    const adminRes = await pool.query(`SELECT id FROM app_user WHERE role = 'admin' LIMIT 1`);
    const adminId = adminRes.rows[0]?.id || null;
    await pool.query(
      `INSERT INTO specialist_assignment (specialist_id, clinic_id, assigned_by_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (specialist_id, clinic_id) DO NOTHING`,
      [specialistId, clinicId, adminId]
    );
    console.log(`[setup] Assigned specialist ${specialistId} to clinic ${clinicId}`);
  }

  // 5. Verify the user record
  const verify = await pool.query(
    `SELECT u.id, u.email, u.full_name, u.role, u.status, c.name AS clinic_name, c.clinic_code
     FROM app_user u
     LEFT JOIN clinic c ON c.id = u.clinic_id
     WHERE u.email = $1`,
    [email]
  );
  console.log('[setup] Verification result:', verify.rows[0]);

  await pool.end();
}

main().catch((err) => {
  console.error('[setup] Error:', err);
  process.exit(1);
});
