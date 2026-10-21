// End-to-end smoke test against a running API, database and Mailpit.
// Usage: npm run smoke   (after npm run db:reset and with the API running)
//
// Walks the primary journey (App Flow 1.1): specialist imports -> clinic user
// sees "New" -> clinic remark -> specialist reply, plus access-control checks.

import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import '../src/config.js';

const API = process.env.SMOKE_API || 'http://localhost:4000';
const MAILPIT = process.env.SMOKE_MAILPIT || 'http://localhost:8025';
const env = process.env;

let step = 0;
const ok = (msg) => console.log(`  ✔ ${String(++step).padStart(2)} ${msg}`);

class Client {
  constructor(name) {
    this.name = name;
    this.cookies = new Map();
  }
  async req(method, path, { json, form, headers = {}, csrf = true } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (csrf && method !== 'GET') h['x-requested-with'] = 'MyPatient';
    let body;
    if (json !== undefined) {
      h['content-type'] = 'application/json';
      body = JSON.stringify(json);
    } else if (form) body = form;
    const res = await fetch(API + path, { method, headers: h, body, redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      const [k, v] = pair.split('=');
      if (!v || /expires=Thu, 01 Jan 1970/i.test(c)) this.cookies.delete(k);
      else this.cookies.set(k, v);
    }
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, type, headers: res.headers };
  }
  get(p, o) { return this.req('GET', p, o); }
  post(p, o) { return this.req('POST', p, o); }
}

async function latestCode(email, after) {
  for (let i = 0; i < 40; i += 1) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json();
    const msg = list.messages.find(
      (m) => m.To.some((t) => t.Address.toLowerCase() === email) && m.Subject.includes('sign-in code') && new Date(m.Created) >= after,
    );
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      return full.Text.match(/\b(\d{6})\b/)[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No sign-in code email for ${email}`);
}

async function signIn(client, email, password) {
  const started = new Date(Date.now() - 2000);
  const login = await client.post('/api/auth/login', { json: { email, password } });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  assert.equal(login.data.stage, 'otp');
  const blocked = await client.get('/api/statements');
  assert.equal(blocked.status, 401, 'patient data must be unreachable before the 2-step code');
  const code = await latestCode(email, started);
  const verify = await client.post('/api/auth/verify', { json: { code } });
  assert.equal(verify.status, 200, JSON.stringify(verify.data));
  return verify.data.user;
}

function csvForm(clinicId, filename, text) {
  const form = new FormData();
  form.set('clinicId', clinicId);
  form.set('file', new Blob([text], { type: 'text/csv' }), filename);
  return form;
}

async function main() {
  console.log(`Smoke test against ${API}\n`);
  const spec = new Client('specialist');
  const clinic = new Client('clinic');
  const admin = new Client('admin');

  // --- Sign-in rules -----------------------------------------------------------
  const bad = await spec.post('/api/auth/login', { json: { email: env.SEED_SPECIALIST_EMAIL, password: 'wrong-password-123' } });
  const unknown = await spec.post('/api/auth/login', { json: { email: 'nobody@example.com', password: 'wrong-password-123' } });
  assert.equal(bad.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(bad.data.error, unknown.data.error);
  ok('wrong password and unknown email get the same generic message');

  const noCsrf = await spec.post('/api/auth/login', { json: {}, csrf: false });
  assert.equal(noCsrf.status, 403);
  ok('state-changing requests without the CSRF header are blocked');

  const started = new Date(Date.now() - 2000);
  await spec.post('/api/auth/login', { json: { email: env.SEED_SPECIALIST_EMAIL, password: env.SEED_SPECIALIST_PASSWORD } });
  const realCode = await latestCode(env.SEED_SPECIALIST_EMAIL, started);
  const wrongCode = realCode === '000000' ? '111111' : '000000';
  const wrong = await spec.post('/api/auth/verify', { json: { code: wrongCode } });
  assert.equal(wrong.status, 400);
  assert.match(wrong.data.error, /4 tries left/);
  const good = await spec.post('/api/auth/verify', { json: { code: realCode } });
  assert.equal(good.status, 200);
  assert.equal(good.data.user.role, 'specialist');
  const reused = await spec.post('/api/auth/verify', { json: { code: realCode } });
  assert.equal(reused.status, 401);
  ok('emailed 6-digit code: wrong code counted, right code signs in, no reuse');

  // --- Import (F8) -----------------------------------------------------------------
  const { data: pub } = await spec.get('/api/publishable-clinics');
  const lakeside = pub.clinics.find((c) => c.code === 'CLN-4082');
  assert.ok(lakeside && !pub.clinics.some((c) => c.code === 'CLN-6301'));
  ok('clinic picker lists only assigned, active clinics');

  const tpl = await spec.get('/api/imports/template.xlsx');
  assert.equal(tpl.status, 200);
  assert.equal(tpl.data.subarray(0, 2).toString(), 'PK');
  ok('import template downloads (.xlsx)');

  const missing = await spec.post('/api/imports', { form: csvForm(lakeside.id, 'bad.csv', 'patient_name,account_number\nA,B\n') });
  assert.equal(missing.data.status, 'failed');
  assert.equal(missing.data.failureReason, 'Missing columns: Statement date, Balance due.');
  ok('file with missing columns is recorded as Failed with the column names');

  const importCsv = [
    'patient_name,account_number,statement_date,balance_due,insurance_name',
    'Oliver Smoke,ACC-SMOKE-1,2026-10-20,88.10,Smoke Health',
    'Bad Date,ACC-SMOKE-2,2026-13-40,10.00,',
    'Elena Garcia,ACC-0048213,2026-10-14,400.00,Blue Cross Blue Shield (IL)',
    'EXAMPLE - Jane Sample,ACC-0000001,2026-10-15,1.00,',
  ].join('\n');
  const check = await spec.post('/api/imports', { form: csvForm(lakeside.id, 'smoke.csv', importCsv) });
  assert.equal(check.status, 201);
  assert.equal(check.data.status, 'previewed');
  const preview = await spec.get(`/api/imports/${check.data.id}`);
  assert.deepEqual(
    [preview.data.batch.totals.total, preview.data.batch.totals.valid, preview.data.batch.totals.invalid, preview.data.batch.totals.duplicate],
    [4, 1, 2, 1],
  );
  assert.equal(preview.data.invalidRows[0].rowNumber, 3);
  assert.equal(preview.data.duplicates[0].rowNumber, 4);
  ok('preview: 4 rows -> 1 valid, 2 invalid (with row numbers), 1 possible duplicate');

  const undecided = await spec.post(`/api/imports/${check.data.id}/publish`);
  assert.equal(undecided.status, 400);
  const notYet = await spec.get(`/api/statements?clinicId=${lakeside.id}&q=ACC-SMOKE-1`);
  assert.equal(notYet.data.total, 0);
  ok('nothing is published at preview; publishing is blocked until every duplicate has a decision');

  await spec.req('PATCH', `/api/imports/${check.data.id}/duplicates`, { json: { decision: 'skip' } });
  const published = await spec.post(`/api/imports/${check.data.id}/publish`);
  assert.equal(published.data.status, 'partially_imported');
  const again = await spec.post(`/api/imports/${check.data.id}/publish`);
  assert.equal(again.data.alreadyPublished, true);
  ok('publish -> Partially imported; a second click publishes nothing more');

  const report = await spec.get(`/api/imports/${check.data.id}/error-report`);
  const reportText = report.data.toString('utf8');
  assert.equal(reportText.trim().split('\r\n').length, 4); // header + 2 failed + 1 skipped
  assert.match(reportText, /Skipped duplicate/);
  ok('error report lists failed and skipped rows with reasons');

  // --- Clinic user (C1, P1, P2) --------------------------------------------------
  await signIn(clinic, env.SEED_CLINIC_USER_EMAIL, env.SEED_CLINIC_USER_PASSWORD);
  const home = await clinic.get('/api/home');
  assert.ok(home.data.newCount >= 1);
  const list = await clinic.get('/api/statements?q=smoke');
  assert.equal(list.data.items.length, 1);
  const smokeItem = list.data.items[0];
  assert.equal(smokeItem.isNew, true);
  ok(`clinic user signs in with 2-step, sees ${home.data.newCount} New and finds the imported statement`);

  const detail = await clinic.get(`/api/statements/${smokeItem.id}`);
  assert.equal(detail.data.statement.wasNew, true);
  const relist = await clinic.get('/api/statements?q=smoke');
  assert.equal(relist.data.items[0].isNew, false);
  ok('opening the statement clears the New badge');

  const remark = await clinic.post(`/api/statements/${smokeItem.id}/remarks`, {
    json: { type: 'insurance', body: 'Patient will pay at next visit.' },
  });
  assert.equal(remark.status, 201);
  assert.equal(remark.data.remark.type, 'clinic');
  const tooLong = await clinic.post(`/api/statements/${smokeItem.id}/remarks`, { json: { body: 'x'.repeat(2001) } });
  assert.equal(tooLong.status, 400);
  ok('clinic remark saved as type Clinic; 2,001 characters rejected');

  const pdf = await clinic.get(`/api/statements/${smokeItem.id}/download`);
  assert.equal(pdf.type, 'application/pdf');
  assert.equal(pdf.data.subarray(0, 5).toString(), '%PDF-');
  assert.match(pdf.headers.get('content-disposition'), /statement-2026-10-20\.pdf/);
  ok('download produces a generated PDF for an imported statement');

  // --- Isolation (F4) ----------------------------------------------------------------
  const riverside = await spec.get('/api/dashboard');
  const riversideClinic = riverside.data.clinics.find((c) => c.code === 'CLN-5120');
  const rList = await spec.get(`/api/statements?clinicId=${riversideClinic.id}`);
  const foreignId = rList.data.items[0].id;
  const foreign = await clinic.get(`/api/statements/${foreignId}`);
  const foreignList = await clinic.get(`/api/statements?clinicId=${riversideClinic.id}`);
  assert.equal(foreign.status, 404);
  assert.ok(foreignList.data.items.every((i) => i.id !== foreignId));
  const staffPage = await clinic.get('/api/dashboard');
  assert.equal(staffPage.status, 404);
  const importAsClinic = await clinic.post('/api/imports', { form: csvForm(lakeside.id, 'x.csv', importCsv) });
  assert.equal(importAsClinic.status, 404);
  ok("clinic user cannot see another clinic's statement, the specialist dashboard or imports");

  // --- Specialist dashboard, reply, withdraw (F6, F11, FR-10.4) ------------------------
  const dash = await spec.get('/api/dashboard');
  assert.ok(dash.data.unanswered.some((u) => u.statementId === smokeItem.id));
  assert.ok(dash.data.recent.some((r) => r.kind === 'import' && r.id === check.data.id));
  await spec.post(`/api/statements/${smokeItem.id}/remarks`, {
    json: { type: 'insurance', body: 'Payer confirmed claim closed.', insuranceName: 'Smoke Health', insuranceReference: 'REF-1' },
  });
  const dash2 = await spec.get('/api/dashboard');
  assert.ok(!dash2.data.unanswered.some((u) => u.statementId === smokeItem.id));
  ok('unanswered clinic remark shows on the dashboard and clears after the specialist replies');

  const noReason = await spec.post(`/api/statements/${smokeItem.id}/withdraw`, { json: { reason: ' ' } });
  assert.equal(noReason.status, 400);
  await spec.post(`/api/statements/${smokeItem.id}/withdraw`, { json: { reason: 'Smoke test withdrawal.' } });
  const gone = await clinic.get(`/api/statements/${smokeItem.id}`);
  assert.equal(gone.status, 404);
  const staffView = await spec.get(`/api/statements/${smokeItem.id}`);
  assert.equal(staffView.data.statement.status, 'withdrawn');
  ok('withdrawn statement disappears for the clinic and stays visible to the specialist');

  // --- Single upload (F7) -------------------------------------------------------------
  const doc = await PDFDocument.create();
  doc.addPage();
  const pdfBytes = await doc.save();
  const form = new FormData();
  form.set('clinicId', lakeside.id);
  form.set('patient_name', 'Uma Upload');
  form.set('account_number', 'ACC-UPLOAD-1');
  form.set('statement_date', '2026-10-19');
  form.set('balance_due', '42.00');
  form.set('pdf', new Blob([pdfBytes], { type: 'application/pdf' }), 'uma.pdf');
  const draft = await spec.post('/api/uploads', { form });
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  const confirm = await spec.get(`/api/uploads/${draft.data.id}`);
  assert.equal(confirm.data.draft.clinic.name, 'Lakeside Family Clinic');
  const notPdf = new FormData();
  for (const [k, v] of form) if (k !== 'pdf') notPdf.set(k, v);
  notPdf.set('pdf', new Blob(['hello'], { type: 'application/pdf' }), 'fake.pdf');
  const rejected = await spec.post('/api/uploads', { form: notPdf });
  assert.equal(rejected.status, 400);
  assert.ok(rejected.data.fieldErrors.pdf);
  const done = await spec.post(`/api/uploads/${draft.data.id}/publish`);
  assert.equal(done.status, 201);
  const twice = await spec.post(`/api/uploads/${draft.data.id}/publish`);
  assert.equal(twice.status, 404);
  const inline = await clinic.get(`/api/statements/${done.data.statementId}/file`);
  assert.equal(inline.type, 'application/pdf');
  ok('single PDF upload: confirm screen data, fake PDF rejected, publish once, clinic can view it');

  // --- Admin (F5, F13) -----------------------------------------------------------------
  await signIn(admin, env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  const auditRes = await admin.get('/api/admin/audit?action=access');
  assert.ok(auditRes.data.events.some((e) => e.action === 'access.blocked' && e.outcome === 'blocked'));
  const exportRes = await admin.get('/api/admin/audit/export.csv?action=import');
  assert.match(exportRes.data.toString('utf8'), /import\.publish/);
  const adminImport = await admin.get(`/api/imports/${check.data.id}`);
  assert.equal(adminImport.status, 404);
  ok('admin sees blocked-access events and exports the audit log; admins cannot open imports');

  const invite = await admin.post('/api/admin/users', {
    json: { fullName: 'Smoke Invitee', email: `smoke-${Date.now()}@example.com`, role: 'clinic_user', clinicId: lakeside.id },
  });
  assert.equal(invite.status, 201);
  await admin.post(`/api/admin/users/${invite.data.id}/deactivate`);
  const users = await admin.get('/api/admin/users?status=deactivated&q=smoke');
  assert.ok(users.data.users.some((u) => u.id === invite.data.id));
  ok('admin invites and deactivates a user');

  // --- Sign out -------------------------------------------------------------------------
  await clinic.post('/api/auth/logout');
  const after = await clinic.get('/api/statements');
  assert.equal(after.status, 401);
  ok('after sign-out, patient data is unreachable');

  console.log(`\nAll ${step} smoke checks passed.`);
}

main().catch((err) => {
  console.error('\n✖ Smoke test failed:', err.message);
  process.exit(1);
});
