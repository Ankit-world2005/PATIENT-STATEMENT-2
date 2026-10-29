import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { randomToken, sha256 } from '../src/lib/crypto.js';

test('Remark and Request attachments end-to-end', async (t) => {
  const app = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  t.after(() => server.close());

  // Find an active statement
  const { rows: stRows } = await pool.query(
    "SELECT s.id, s.clinic_id, s.patient_name FROM statement s WHERE s.status = 'active' LIMIT 1"
  );
  const testStatement = stRows[0];
  assert.ok(testStatement, 'Active statement exists');

  // Find an active clinic user and specialist
  const { rows: users } = await pool.query(
    "SELECT u.id, u.email, u.role, u.clinic_id FROM app_user u WHERE u.status = 'active'"
  );
  let clinicUser = users.find((u) => u.role === 'clinic_user' && u.clinic_id === testStatement.clinic_id);
  if (!clinicUser) {
    clinicUser = users.find((u) => u.role === 'clinic_user');
    assert.ok(clinicUser, 'Clinic user exists');
    await pool.query('UPDATE app_user SET clinic_id = $1 WHERE id = $2', [testStatement.clinic_id, clinicUser.id]);
  }
  const specialist = users.find((u) => u.role === 'specialist') || users.find((u) => u.role === 'admin');
  assert.ok(specialist, 'Specialist or admin user exists');

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

  let uploadedPhotoId = null;
  let uploadedPdfId = null;
  let uploadedExcelId = null;

  await t.test('POST /api/attachments uploads an image, a PDF, and an Excel sheet', async () => {
    const sessionToken = await createVerifiedSession(clinicUser.id);

    // 1. Upload Photo via multipart/form-data using FormData
    const fakePng = new Blob([
      new Uint8Array([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
      ]),
    ], { type: 'image/png' });

    const formPhoto = new FormData();
    formPhoto.append('file', fakePng, 'treatment-receipt.png');

    const resPhoto = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: {
        'Cookie': `mp_sid=${sessionToken}`,
        'X-Requested-With': 'MyPatient',
      },
      body: formPhoto,
    });
    assert.equal(resPhoto.status, 201);
    const photoData = await resPhoto.json();
    assert.equal(photoData.ok, true);
    assert.equal(photoData.attachment.name, 'treatment-receipt.png');
    assert.match(photoData.attachment.contentType, /image\/png/);
    uploadedPhotoId = photoData.attachment.id;

    // 2. Upload PDF
    const fakePdf = new Blob(['%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF'], { type: 'application/pdf' });
    const formPdf = new FormData();
    formPdf.append('file', fakePdf, 'patient-eob.pdf');

    const resPdf = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: {
        'Cookie': `mp_sid=${sessionToken}`,
        'X-Requested-With': 'MyPatient',
      },
      body: formPdf,
    });
    assert.equal(resPdf.status, 201);
    const pdfData = await resPdf.json();
    assert.equal(pdfData.ok, true);
    assert.equal(pdfData.attachment.name, 'patient-eob.pdf');
    uploadedPdfId = pdfData.attachment.id;

    // 3. Upload Excel
    const fakeExcel = new Blob(['Patient,Balance,Date\nJohn,100,2026-10-28'], { type: 'text/csv' });
    const formExcel = new FormData();
    formExcel.append('file', fakeExcel, 'ledger-export.csv');

    const resExcel = await fetch(`${baseUrl}/api/attachments`, {
      method: 'POST',
      headers: {
        'Cookie': `mp_sid=${sessionToken}`,
        'X-Requested-With': 'MyPatient',
      },
      body: formExcel,
    });
    assert.equal(resExcel.status, 201);
    const excelData = await resExcel.json();
    assert.equal(excelData.ok, true);
    assert.equal(excelData.attachment.name, 'ledger-export.csv');
    uploadedExcelId = excelData.attachment.id;

    // 4. Download / stream attachment
    const getRes = await fetch(`${baseUrl}/api/attachments/${uploadedPhotoId}`, {
      headers: {
        'Cookie': `mp_sid=${sessionToken}`,
        'X-Requested-With': 'MyPatient',
      },
    });
    assert.equal(getRes.status, 200);
    assert.match(getRes.headers.get('content-type'), /image\/png/);
    const buf = await getRes.arrayBuffer();
    assert.equal(buf.byteLength, 33);
  });

  await t.test('POST /api/statements/:id/remarks saves and returns remark with attachments', async () => {
    const sessionToken = await createVerifiedSession(clinicUser.id);

    const res = await fetch(`${baseUrl}/api/statements/${testStatement.id}/remarks`, {
      method: 'POST',
      headers: {
        'Cookie': `mp_sid=${sessionToken}`,
        'X-Requested-With': 'MyPatient',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'clinic',
        body: 'Please review the attached receipt and EOB.',
        attachments: [
          {
            id: uploadedPhotoId,
            name: 'treatment-receipt.png',
            contentType: 'image/png',
            size: 33,
            url: `/api/attachments/${uploadedPhotoId}`,
          },
          {
            id: uploadedPdfId,
            name: 'patient-eob.pdf',
            contentType: 'application/pdf',
            size: 50,
            url: `/api/attachments/${uploadedPdfId}`,
          },
        ],
      }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.ok(data.remark);
    assert.equal(data.remark.attachments.length, 2);
    assert.equal(data.remark.attachments[0].name, 'treatment-receipt.png');

    // Retrieve statement details to ensure attachments are returned in the ledger
    const getRes = await fetch(`${baseUrl}/api/statements/${testStatement.id}`, {
      headers: {
        'Cookie': `mp_sid=${sessionToken}`,
        'X-Requested-With': 'MyPatient',
      },
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    const foundRemark = getData.remarks.find((r) => r.id === data.remark.id);
    assert.ok(foundRemark);
    assert.equal(foundRemark.attachments.length, 2);
  });

  await t.test('POST /api/requests saves inquiry with attachments and specialist replies with attachments', async () => {
    // 1. Clinic submits request with attached Excel
    const clinicToken = await createVerifiedSession(clinicUser.id);

    const reqRes = await fetch(`${baseUrl}/api/requests`, {
      method: 'POST',
      headers: {
        'Cookie': `mp_sid=${clinicToken}`,
        'X-Requested-With': 'MyPatient',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statementId: testStatement.id,
        patientName: testStatement.patient_name,
        priority: 'High',
        body: 'Check the uploaded spreadsheet for balance adjustment.',
        attachments: [
          {
            id: uploadedExcelId,
            name: 'ledger-export.csv',
            contentType: 'text/csv',
            size: 35,
            url: `/api/attachments/${uploadedExcelId}`,
          },
        ],
      }),
    });
    assert.equal(reqRes.status, 201);
    const reqData = await reqRes.json();
    assert.ok(reqData.request);
    const createdRequestId = reqData.request.id;

    // 2. Specialist replies with attached PDF
    const specToken = await createVerifiedSession(specialist.id);

    const replyRes = await fetch(`${baseUrl}/api/requests/${createdRequestId}/reply`, {
      method: 'POST',
      headers: {
        'Cookie': `mp_sid=${specToken}`,
        'X-Requested-With': 'MyPatient',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        body: 'Updated in system. See attached confirmation.',
        attachments: [
          {
            id: uploadedPdfId,
            name: 'patient-eob.pdf',
            contentType: 'application/pdf',
            size: 50,
            url: `/api/attachments/${uploadedPdfId}`,
          },
        ],
      }),
    });
    assert.equal(replyRes.status, 201);
    const replyData = await replyRes.json();
    assert.ok(replyData.reply);
    assert.equal(replyData.reply.attachments.length, 1);

    // 3. Fetch requests list and verify conversation box contains both attachments
    const listRes = await fetch(`${baseUrl}/api/requests`, {
      headers: {
        'Cookie': `mp_sid=${clinicToken}`,
        'X-Requested-With': 'MyPatient',
      },
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    const item = listData.requests.find((r) => r.id === createdRequestId);
    assert.ok(item, 'Request found in list');
    assert.equal(item.attachments.length, 1);
    assert.equal(item.attachments[0].name, 'ledger-export.csv');
    assert.equal(item.replies.length, 1);
    assert.equal(item.replies[0].attachments.length, 1);
    assert.equal(item.replies[0].attachments[0].name, 'patient-eob.pdf');
  });
});
