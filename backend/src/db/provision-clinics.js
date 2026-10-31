import { pool } from './pool.js';
import { hashPassword } from '../lib/crypto.js';

export const CLINIC_PROVISIONS = [
  {
    clinic: {
      name: 'Neomedica Group LLC',
      code: 'CLN-NEOM',
      addressLine1: '100 Medical Center Blvd',
      addressLine2: 'Suite 100',
      city: 'Houston',
      state: 'TX',
      postalCode: '77001',
      contactName: 'Neomedica Office Manager',
      contactPhone: '(713) 555-0111',
      contactEmail: 'neomedica.mypatient@gmail.com',
    },
    users: [
      {
        email: 'neomedica.mypatient@gmail.com',
        fullName: 'Neomedica Admin',
        password: 'Neomedica@123',
        isClinicAdmin: false,
      },
    ],
  },
  {
    clinic: {
      name: 'ARRA FY TX LLC',
      code: 'CLN-ARRA',
      addressLine1: '200 Health Way',
      addressLine2: null,
      city: 'Dallas',
      state: 'TX',
      postalCode: '75201',
      contactName: 'Arra Office Manager',
      contactPhone: '(214) 555-0122',
      contactEmail: 'arra.mypatient@gmail.com',
    },
    users: [
      {
        email: 'arra.mypatient@gmail.com',
        fullName: 'Arra Admin',
        password: 'Arra@123',
        isClinicAdmin: false,
      },
      {
        email: 'arra.admin.mypatient@gmail.com',
        fullName: 'ARRA FY TX LLC (Clinic Admin)',
        password: 'Arra@1234',
        isClinicAdmin: true,
      },
    ],
  },
  {
    clinic: {
      name: 'HEALTH FIRST PHYSIO CARE LLC',
      code: 'CLN-HFPC',
      addressLine1: '300 Physio Park Dr',
      addressLine2: null,
      city: 'Austin',
      state: 'TX',
      postalCode: '73301',
      contactName: 'Health First Office Manager',
      contactPhone: '(512) 555-0133',
      contactEmail: 'healthfirst.mypatient@gmail.com',
    },
    users: [
      {
        email: 'healthfirst.mypatient@gmail.com',
        fullName: 'Health First Admin',
        password: 'Healthfirst@123',
        isClinicAdmin: false,
      },
    ],
  },
  {
    clinic: {
      name: 'Savan Enterprises LLC',
      code: 'CLN-SAVN',
      addressLine1: '400 Enterprise Plaza',
      addressLine2: null,
      city: 'San Antonio',
      state: 'TX',
      postalCode: '78201',
      contactName: 'Savan Office Manager',
      contactPhone: '(210) 555-0144',
      contactEmail: 'savan.mypatient@gmail.com',
    },
    users: [
      {
        email: 'savan.mypatient@gmail.com',
        fullName: 'Savan Admin',
        password: 'Savan@123',
        isClinicAdmin: false,
      },
      {
        email: 'savan.admin.mypatient@gmail.com',
        fullName: 'Savan Enterprises LLC (Clinic Admin)',
        password: 'Savan@1234',
        isClinicAdmin: true,
      },
    ],
  },
  {
    clinic: {
      name: 'Evolve Physical Therapy',
      code: 'CLN-EVLV',
      addressLine1: '500 Wellness Blvd',
      addressLine2: null,
      city: 'Fort Worth',
      state: 'TX',
      postalCode: '76101',
      contactName: 'Evolve Office Manager',
      contactPhone: '(817) 555-0155',
      contactEmail: 'evolve.mypatient@gmail.com',
    },
    users: [
      {
        email: 'evolve.mypatient@gmail.com',
        fullName: 'Evolve Admin',
        password: 'Evolve@123',
        isClinicAdmin: false,
      },
    ],
  },
  {
    clinic: {
      name: 'WestAZ',
      code: 'CLN-0001',
      addressLine1: '100 Medical Center Blvd',
      addressLine2: null,
      city: 'Phoenix',
      state: 'AZ',
      postalCode: '85001',
      contactName: 'WestAZ Manager',
      contactPhone: '(602) 555-0100',
      contactEmail: 'westaz.mypatient@gmail.com',
    },
    users: [
      {
        email: 'westaz.mypatient@gmail.com',
        fullName: 'WestAZ Clinic',
        password: 'westaz@123#',
        isClinicAdmin: false,
      },
      {
        email: 'westaz.admin.mypatient@gmail.com',
        fullName: 'West AZ (Clinic Admin)',
        password: 'westaz@1234#',
        isClinicAdmin: true,
      },
    ],
  },
  {
    clinic: {
      name: 'Namaste Rehab Clinics LLC',
      code: 'NMST-001',
      addressLine1: '102 Woodland Drive',
      addressLine2: null,
      city: 'Lansdale',
      state: 'PA',
      postalCode: '19446',
      contactName: 'Physical Therapy',
      contactPhone: '267-642-1642',
      contactEmail: 'namaste.mypatient@gmail.com',
    },
    users: [
      {
        email: 'namaste.mypatient@gmail.com',
        fullName: 'Namaste Rehab Clinics LLC',
        password: 'namaste@123#',
        isClinicAdmin: false,
      },
      {
        email: 'namaste.admin.mypatient@gmail.com',
        fullName: 'Namaste Rehab Clinics LLC (Clinic Admin)',
        password: 'namaste@1234#',
        isClinicAdmin: true,
      },
    ],
  },
];

export async function provisionClinicsAndUsers() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Fetch admin and specialist users
    const adminRes = await client.query("SELECT id FROM app_user WHERE role = 'admin' LIMIT 1");
    const adminId = adminRes.rows[0]?.id || null;

    const specialistRes = await client.query("SELECT id FROM app_user WHERE role = 'specialist' ORDER BY created_at LIMIT 1");
    const specialistId = specialistRes.rows[0]?.id || null;

    for (const p of CLINIC_PROVISIONS) {
      const c = p.clinic;

      // 2. Insert or update Clinic
      let clinicId;
      const existingClinic = await client.query('SELECT id FROM clinic WHERE clinic_code = $1 OR name = $2', [c.code, c.name]);
      if (existingClinic.rows.length > 0) {
        clinicId = existingClinic.rows[0].id;
        await client.query(
          `UPDATE clinic
           SET name = $1, address_line1 = $2, address_line2 = $3, city = $4, state = $5, postal_code = $6,
               contact_name = $7, contact_phone = $8, contact_email = $9, is_active = true, updated_at = now()
           WHERE id = $10`,
          [c.name, c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.contactName, c.contactPhone, c.contactEmail, clinicId],
        );
        console.log(`[provision] Updated clinic: ${c.name} (${c.code}) -> ${clinicId}`);
      } else {
        const insClinic = await client.query(
          `INSERT INTO clinic (name, clinic_code, address_line1, address_line2, city, state, postal_code,
                               contact_name, contact_phone, contact_email, created_by_id, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
           RETURNING id`,
          [c.name, c.code, c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.contactName, c.contactPhone, c.contactEmail, adminId],
        );
        clinicId = insClinic.rows[0].id;
        console.log(`[provision] Created clinic: ${c.name} (${c.code}) -> ${clinicId}`);
      }

      // 3. Insert or update Users
      const usersToProvision = p.users || (p.user ? [p.user] : []);
      for (const u of usersToProvision) {
        const passwordHash = await hashPassword(u.password);
        const normalizedEmail = u.email.toLowerCase().trim();
        const isClinicAdmin = Boolean(u.isClinicAdmin);

        const existingUser = await client.query('SELECT id FROM app_user WHERE email = $1', [normalizedEmail]);
        if (existingUser.rows.length > 0) {
          const userId = existingUser.rows[0].id;
          await client.query(
            `UPDATE app_user
             SET full_name = $1, role = 'clinic_user', clinic_id = $2, is_clinic_admin = $3, status = 'active',
                 password_hash = $4, password_changed_at = now(), activated_at = now(), updated_at = now()
             WHERE id = $5`,
            [u.fullName, clinicId, isClinicAdmin, passwordHash, userId],
          );
          console.log(`[provision] Updated user: ${normalizedEmail} (Role: clinic_user, Admin: ${isClinicAdmin}, Clinic: ${c.code})`);
        } else {
          await client.query(
            `INSERT INTO app_user (email, full_name, role, clinic_id, is_clinic_admin, status, password_hash, password_changed_at, activated_at, invited_by_id)
             VALUES ($1, $2, 'clinic_user', $3, $4, 'active', $5, now(), now(), $6)`,
            [normalizedEmail, u.fullName, clinicId, isClinicAdmin, passwordHash, adminId],
          );
          console.log(`[provision] Created user: ${normalizedEmail} (Role: clinic_user, Admin: ${isClinicAdmin}, Clinic: ${c.code})`);
        }
      }

      // 4. Assign specialist to clinic if specialist exists
      if (specialistId) {
        await client.query(
          `INSERT INTO specialist_assignment (specialist_id, clinic_id, assigned_by_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (specialist_id, clinic_id) DO NOTHING`,
          [specialistId, clinicId, adminId],
        );
        console.log(`[provision] Assigned specialist ${specialistId} to clinic ${c.code}`);
      }
    }

    await client.query('COMMIT');
    console.log('[provision] All clinics, users, and specialist assignments provisioned successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[provision] Error provisioning clinics and users:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('provision-clinics.js')) {
  provisionClinicsAndUsers()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
