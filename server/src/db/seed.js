import crypto from 'node:crypto';
import { config } from '../config.js';
import { hashPassword, randomToken } from '../lib/crypto.js';
import { statementFileKey, sha256Hex, storage } from '../lib/storage.js';
import { checkImport, publishImport, setDuplicateDecisions } from '../services/imports/service.js';
import { renderStatementPdf } from '../services/pdf.js';
import { insertStatements, rebuildStatementFlags } from '../services/statements.js';
import { pool } from './pool.js';

// Development seed: synthetic data only (schema 11.1). Refuses to run in production.

const env = process.env;

const CLINICS = [
  { code: 'CLN-4082', name: 'Lakeside Family Clinic', a1: '104 Medical Plaza Way', a2: 'Suite 200', city: 'Peoria', state: 'IL',
    zip: '61614', contact: 'Dana Whitfield', phone: '(309) 555-0192', email: 'office@lakeside-clinic.example' },
  { code: 'CLN-5120', name: 'Riverside Pediatrics', a1: '88 Riverside Drive', a2: null, city: 'Springfield', state: 'IL',
    zip: '62701', contact: 'Marco Ruiz', phone: '(217) 555-0144', email: 'admin@riverside-peds.example' },
  { code: 'CLN-6301', name: 'Maple Grove Internal Medicine', a1: '2200 Maple Grove Rd', a2: null, city: 'Bloomington', state: 'IL',
    zip: '61704', contact: 'Helen Park', phone: '(309) 555-0177', email: 'frontdesk@maplegrove-im.example' },
  { code: 'CLN-7004', name: 'Northgate Orthopedics', a1: '15 Northgate Blvd', a2: null, city: 'Normal', state: 'IL',
    zip: '61761', contact: 'Sam Ortiz', phone: '(309) 555-0108', email: 'billing@northgate-ortho.example' },
];

const LAKESIDE_CSV = `patient_name,account_number,statement_date,balance_due,patient_dob,service_date_from,service_date_to,cpt_codes,billed_amount,insurance_paid,adjustments,insurance_name
Elena Garcia,ACC-0048213,2026-10-14,420.00,1984-04-18,2026-10-02,2026-10-02,99214 80053 85025 36415,650.00,180.00,50.00,Blue Cross Blue Shield (IL)
Marcus Vance,ACC-0048190,2026-10-12,175.50,1972-11-09,2026-09-28,2026-09-28,99213 93000,420.00,210.00,34.50,Aetna Health Choice
Chloe Richardson,ACC-0048155,2026-10-10,85.00,1995-07-22,2026-09-24,2026-09-24,99395,310.00,185.00,40.00,UnitedHealthcare
David K. Miller,ACC-0047982,2026-10-05,630.00,1960-03-14,2026-09-15,2026-09-15,73721 99214,1200.00,450.00,120.00,Medicare Part B
Samantha Reed,ACC-0047810,2026-09-28,210.00,2001-12-05,2026-09-10,2026-09-10,99214 87086,540.00,280.00,50.00,Cigna Healthcare
Arthur Pendelton,ACC-0047640,2026-09-20,-25.00,1955-08-30,2026-09-01,2026-09-01,99213,180.00,155.00,50.00,Humana Gold Plus
Brenda Walsh,ACC-0047511,2026-09-14,340.00,1988-02-19,2026-08-29,2026-08-29,99215 95810,780.00,360.00,80.00,Anthem BCBS
Elena Garcia,ACC-0048213,2026-07-18,145.00,1984-04-18,2026-07-05,2026-07-05,99213 81002,380.00,200.00,35.00,Blue Cross Blue Shield (IL)
`;

const RIVERSIDE_CSV = `Patient Name,Account Number,Statement Date,Balance Due,DOB,Insurance
Noah Bennett,RP-10021,10/08/2026,95.00,03/02/2019,BCBS Blue Choice
Ava Thompson,RP-10037,10/08/2026,40.00,07/19/2021,Medicaid IL
Liam Carter,RP-10044,10/01/2026,0.00,11/30/2016,Aetna
Mia Robinson,RP-10052,09/24/2026,180.25,01/12/2020,UnitedHealthcare
Ethan Brooks,RP-10060,09/17/2026,62.40,05/05/2018,Cigna
`;

// Corrected Marcus Vance statement: same account and date, published as version 2.
const CORRECTION_CSV = `patient_name,account_number,statement_date,balance_due,cpt_codes,billed_amount,insurance_paid,adjustments,insurance_name
Marcus Vance,ACC-0048190,2026-10-12,150.50,99213 93000,420.00,235.00,34.50,Aetna Health Choice
`;

function seedPassword(name) {
  const value = env[name];
  if (value) {
    if (value.length < 12) console.warn(`[seed] warning: ${name} is shorter than the 12-character policy (FR-1.6).`);
    return { value, generated: false };
  }
  return { value: randomToken(12), generated: true };
}

async function createUser(client, { email, name, role, clinicId = null, password = null, invitedBy = null }) {
  const now = password ? new Date() : null;
  const { rows } = await client.query(
    `INSERT INTO app_user (email, full_name, role, clinic_id, status, password_hash, password_changed_at, invited_by_id, activated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $7)
     RETURNING *`,
    [email.toLowerCase(), name, role, clinicId, password ? 'active' : 'invited',
      password ? await hashPassword(password) : null, now, invitedBy],
  );
  return rows[0];
}

function fakeReq(user) {
  return { user, ip: '127.0.0.1' };
}

async function importCsv(specialist, clinicId, filename, csv, decisions) {
  const req = fakeReq(specialist);
  const buffer = Buffer.from(csv, 'utf8');
  const checked = await checkImport(req, { clinicId, file: { originalname: filename, buffer, size: buffer.length } });
  if (checked.status !== 'previewed') throw new Error(`Seed import ${filename} failed: ${checked.failureReason}`);
  if (decisions) await setDuplicateDecisions(req, checked.id, { decision: decisions });
  await publishImport(req, checked.id);
  return checked.id;
}

async function addRemark(client, { account, date, clinicId, author, type, body, at, insuranceName, ref }) {
  const { rows } = await client.query(
    `SELECT id FROM statement WHERE clinic_id = $1 AND account_number = $2 AND statement_date = $3
      ORDER BY version DESC LIMIT 1`,
    [clinicId, account, date],
  );
  await client.query(
    `INSERT INTO remark (statement_id, author_id, author_role, type, body, insurance_name, insurance_reference, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [rows[0].id, author.id, author.role, type, body, insuranceName ?? null, ref ?? null, at],
  );
}

async function main() {
  if (config.isProduction) throw new Error('Refusing to seed demo data in production.');
  const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM app_user');
  if (existing[0].n > 0) {
    console.log('[seed] Database already has users. Run "npm run db:reset" to start over.');
    return;
  }

  const passwords = {
    admin: seedPassword('SEED_ADMIN_PASSWORD'),
    specialist: seedPassword('SEED_SPECIALIST_PASSWORD'),
    clinic: seedPassword('SEED_CLINIC_USER_PASSWORD'),
  };

  const client = await pool.connect();
  let admin;
  let specialist;
  let clinicUser;
  const clinicIds = {};
  try {
    await client.query('BEGIN');
    admin = await createUser(client, {
      email: env.SEED_ADMIN_EMAIL || 'admin@us24solutions.example', name: env.SEED_ADMIN_NAME || 'Portal Admin',
      role: 'admin', password: passwords.admin.value,
    });
    for (const c of CLINICS) {
      const { rows } = await client.query(
        `INSERT INTO clinic (name, clinic_code, address_line1, address_line2, city, state, postal_code, contact_name,
                             contact_phone, contact_email, created_by_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [c.name, c.code, c.a1, c.a2, c.city, c.state, c.zip, c.contact, c.phone, c.email, admin.id],
      );
      clinicIds[c.code] = rows[0].id;
    }
    specialist = await createUser(client, {
      email: env.SEED_SPECIALIST_EMAIL || 'specialist@us24solutions.example', name: env.SEED_SPECIALIST_NAME || 'Demo Specialist',
      role: 'specialist', password: passwords.specialist.value, invitedBy: admin.id,
    });
    clinicUser = await createUser(client, {
      email: env.SEED_CLINIC_USER_EMAIL || 'frontdesk@lakeside-clinic.example', name: env.SEED_CLINIC_USER_NAME || 'Demo Clinic User',
      role: 'clinic_user', clinicId: clinicIds['CLN-4082'], password: passwords.clinic.value, invitedBy: admin.id,
    });
    const kevin = await createUser(client, {
      email: 'kevin.cole@us24solutions.example', name: 'Kevin Cole', role: 'specialist', invitedBy: admin.id,
    });
    await createUser(client, {
      email: 'priya.shah@riverside-peds.example', name: 'Priya Shah', role: 'clinic_user',
      clinicId: clinicIds['CLN-5120'], invitedBy: admin.id,
    });
    for (const [spec, code] of [[specialist, 'CLN-4082'], [specialist, 'CLN-5120'], [kevin, 'CLN-5120'], [kevin, 'CLN-6301']]) {
      await client.query('INSERT INTO specialist_assignment (specialist_id, clinic_id, assigned_by_id) VALUES ($1, $2, $3)',
        [spec.id, clinicIds[code], admin.id]);
    }
    await client.query(
      `UPDATE clinic SET is_active = false, deactivated_at = now(), deactivated_by_id = $2 WHERE id = $1`,
      [clinicIds['CLN-7004'], admin.id],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Statements go through the real import pipeline.
  const lakeside = clinicIds['CLN-4082'];
  const riverside = clinicIds['CLN-5120'];
  await importCsv(specialist, lakeside, 'lakeside-october-cycle.csv', LAKESIDE_CSV);
  await importCsv(specialist, riverside, 'riverside-statements.csv', RIVERSIDE_CSV);
  await importCsv(specialist, lakeside, 'lakeside-correction.csv', CORRECTION_CSV, 'new_version');

  // One single-upload statement with a stored PDF.
  const { rows: clinicRows } = await pool.query('SELECT * FROM clinic WHERE id = $1', [lakeside]);
  const pdfStatement = {
    patient_name: 'Grace Holloway', account_number: 'ACC-0048301', statement_date: '2026-10-16', balance_due: '265.00',
    patient_dob: '1979-06-11', service_date_from: '2026-10-03', service_date_to: '2026-10-03', cpt_codes: ['99204', '71046'],
    billed_amount: '540.00', insurance_paid: '230.00', adjustments: '45.00', insurance_name: 'Aetna Health Choice', version: 1,
  };
  const pdf = await renderStatementPdf(pdfStatement, clinicRows[0]);
  const fileKey = statementFileKey();
  await storage.put(fileKey, pdf);
  const [uploaded] = await insertStatements(pool, [{
    ...pdfStatement, clinic_id: lakeside, source: 'pdf_upload', import_batch_id: null, import_row_number: null,
    supersedes_id: null, uploaded_by_id: specialist.id,
  }]);
  await pool.query(
    `INSERT INTO statement_file (statement_id, storage_key, original_filename, size_bytes, sha256) VALUES ($1, $2, $3, $4, $5)`,
    [uploaded.id, fileKey, `statement-${crypto.randomUUID().slice(0, 8)}.pdf`, pdf.length, sha256Hex(pdf)],
  );

  // Remarks of every type, including an unanswered clinic remark.
  const L = { clinicId: lakeside };
  const remarks = [
    { ...L, account: 'ACC-0048213', date: '2026-10-14', author: specialist, type: 'insurance', at: '2026-10-14T13:40:00Z',
      insuranceName: 'Blue Cross Blue Shield', ref: 'CLM-98214-A',
      body: 'Claim processed. Deductible applied to lines 1 and 2 ($150.00). Co-insurance responsibility $70.00. EOB mailed to patient.' },
    { ...L, account: 'ACC-0048213', date: '2026-10-14', author: specialist, type: 'specialist', at: '2026-10-14T14:20:00Z',
      body: 'Statement published for clinic review. Remaining copay and deductible balance matches the final remittance.' },
    { ...L, account: 'ACC-0048190', date: '2026-10-12', author: specialist, type: 'specialist', at: '2026-10-12T16:35:00Z',
      body: 'Patient copay was not collected at the front desk. Invoiced patient for the remaining balance after primary adjudication.' },
    { ...L, account: 'ACC-0048155', date: '2026-10-10', author: clinicUser, type: 'clinic', at: '2026-10-10T20:00:00Z',
      body: 'Patient mentioned the HSA card will be charged on the 1st of next month.' },
    { ...L, account: 'ACC-0048155', date: '2026-10-10', author: specialist, type: 'specialist', at: '2026-10-10T20:30:00Z',
      body: 'Noted. Statement stays active with a note for monthly reconciliation.' },
    { ...L, account: 'ACC-0047982', date: '2026-10-05', author: specialist, type: 'insurance', at: '2026-10-04T19:10:00Z',
      insuranceName: 'Medicare Part B', ref: 'MED-774102',
      body: 'Pre-authorization valid. Co-insurance rate of 20% assigned to beneficiary.' },
    { ...L, account: 'ACC-0047982', date: '2026-10-05', author: clinicUser, type: 'clinic', at: '2026-10-06T16:15:00Z',
      body: 'Clinic spoke with Mr. Miller; he requested a printed copy sent by mail.' },
    { ...L, account: 'ACC-0047640', date: '2026-09-20', author: specialist, type: 'specialist', at: '2026-09-20T18:12:00Z',
      body: 'Patient overpaid copay by $25 at time of service. Credit reflected on statement; apply to next visit or refund per clinic policy.' },
    { ...L, account: 'ACC-0048213', date: '2026-07-18', author: clinicUser, type: 'clinic', at: '2026-07-22T14:40:00Z',
      body: 'Payment received by credit card at the front desk.' },
  ];
  for (const r of remarks) await addRemark(pool, r);
  await rebuildStatementFlags(pool);

  // Statements the clinic has already opened (no "New" badge).
  await pool.query(
    `UPDATE statement SET first_opened_by_clinic_at = uploaded_at + interval '1 hour'
      WHERE clinic_id = $1 AND statement_date < '2026-10-10'`,
    [lakeside],
  );
  // A withdrawn statement, visible to staff only.
  await pool.query(
    `UPDATE statement SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by_id = $2,
            withdrawal_reason = 'Published to the wrong account by mistake. A corrected statement will follow.'
      WHERE clinic_id = $1 AND account_number = 'RP-10044'`,
    [riverside, specialist.id],
  );

  console.log('\n[seed] Done. Synthetic demo data loaded.\n');
  const show = (label, user, pw) =>
    console.log(`  ${label.padEnd(12)} ${user.email.padEnd(34)} ${pw.generated ? `password: ${pw.value}` : '(password from server/.env)'}`);
  show('Admin', admin, passwords.admin);
  show('Specialist', specialist, passwords.specialist);
  show('Clinic user', clinicUser, passwords.clinic);
  console.log('\n  Sign-in codes are emailed to Mailpit (http://localhost:8025) and printed in the API console.\n');
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('[seed] failed:', err.message);
    await pool.end();
    process.exit(1);
  });
