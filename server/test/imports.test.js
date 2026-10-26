import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImportFileError, parseImportFile } from '../src/services/imports/parse.js';
import { buildErrorReportCsv } from '../src/services/imports/report.js';
import { templateCsv, templateXlsx } from '../src/services/imports/template.js';
import { validateRows } from '../src/services/imports/validate.js';
import JSZip from 'jszip';
import { extractPdfsFromZip, matchPdfsToRows, parsePatientStatementPdfSyntax } from '../src/services/imports/zip.js';

const csv = (text) => Buffer.from(text, 'utf8');

test('parses a CSV with alias headers and keeps spreadsheet row numbers', async () => {
  const file = csv('Patient Name,Acct No,Statement Date,Balance\n\nJane Doe,A-1,10/01/2026,"$1,200.00"\n');
  const { format, rows } = await parseImportFile(file, 'cycle.csv');
  assert.equal(format, 'csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNumber, 3); // blank line 2 is skipped but still counted
  assert.equal(rows[0].raw.account_number, 'A-1');
});

test('names the missing required columns', async () => {
  await assert.rejects(
    parseImportFile(csv('patient_name,account_number\nJane,A-1\n'), 'x.csv'),
    (err) => err instanceof ImportFileError && err.message === 'Missing columns: Statement date, Balance due.',
  );
});

test('rejects empty, header-only, oversized and wrong-type files', async () => {
  await assert.rejects(parseImportFile(csv('\n\n'), 'x.csv'), /empty/);
  await assert.rejects(parseImportFile(csv('patient_name,account_number,statement_date,balance_due\n'), 'x.csv'), /no statements/);
  const big = ['patient_name,account_number,statement_date,balance_due'];
  for (let i = 0; i < 5001; i += 1) big.push(`P${i},A${i},2026-10-01,1`);
  await assert.rejects(parseImportFile(csv(big.join('\n')), 'x.csv'), /limit is 5,000/);
  await assert.rejects(parseImportFile(csv('a,b'), 'x.pdf'), /\.xlsx or \.csv/);
  await assert.rejects(parseImportFile(csv('not a zip'), 'x.xlsx'), /not a valid \.xlsx/);
});

test('flags in-file duplicates and invalid rows', () => {
  const rows = validateRows([
    { rowNumber: 2, raw: { patient_name: 'A', account_number: 'X1', statement_date: '2026-10-01', balance_due: '5' } },
    { rowNumber: 3, raw: { patient_name: 'A', account_number: 'X1', statement_date: '2026-10-01', balance_due: '6' } },
    { rowNumber: 4, raw: { patient_name: 'B', account_number: 'X2', statement_date: 'soon', balance_due: '6' } },
  ]);
  assert.deepEqual(rows.map((r) => r.outcome), ['valid', 'invalid', 'invalid']);
  assert.match(rows[1].errors[0].message, /row 2/);
  assert.equal(rows[2].data.statement_date, 'soon'); // raw text kept for the error report
});

test('the template parses, and its EXAMPLE rows are rejected', async () => {
  for (const [buffer, name] of [[await templateXlsx(), 't.xlsx'], [templateCsv(), 't.csv']]) {
    const { rows } = await parseImportFile(buffer, name);
    assert.equal(rows.length, 2);
    const checked = validateRows(rows);
    assert.ok(checked.every((r) => r.outcome === 'invalid'));
    assert.match(checked[0].errors.at(-1).message, /example row/);
  }
});

test('5,000 rows validate quickly (NFR-14)', async () => {
  const lines = ['patient_name,account_number,statement_date,balance_due,cpt_codes'];
  for (let i = 0; i < 5000; i += 1) lines.push(`Patient ${i},ACC-${i},2026-10-01,${i}.25,99213 80053`);
  const started = performance.now();
  const { rows } = await parseImportFile(csv(lines.join('\n')), 'big.csv');
  const checked = validateRows(rows);
  const ms = performance.now() - started;
  assert.equal(checked.filter((r) => r.outcome === 'valid').length, 5000);
  assert.ok(ms < 5000, `took ${ms} ms`);
});

test('error report neutralises spreadsheet formulas', () => {
  const out = buildErrorReportCsv([
    { row_number: 7, outcome: 'invalid', data: { patient_name: '=HYPERLINK("http://x")', balance_due: '-5' },
      errors: [{ field: 'statement_date', message: 'Statement date is required.' }] },
  ]).toString('utf8');
  assert.ok(out.includes(`"'=HYPERLINK(""http://x"")"`));
  assert.ok(out.includes("'-5"));
  assert.ok(out.includes('Failed,Statement date is required.'));
});

test('parses a 17-column multi-cycle medical billing ledger with repeating balance and payment headers', async () => {
  const header = 'LOCATION,PATIENT NAME,1ST ELECTRONIC STATEMENT,BALANCE DUE AMOUNT,PAYMENT RECEIVED,2ND ELECTRONIC STATEMENT,BALANCE DUE AMOUNT,PAYMENT RECEIVED,3RD ELECTRONIC STATEMENT,BALANCE DUE AMOUNT,PAYMENT RECEIVED,CURRENT OUTSTANDING BALANCE,PR TYPE,US24 NOTES,CLIENT RESPONSE,AS PER VOB- NOTES,STATUS';
  const row1 = 'Downtown Clinic,Smith John,10/01/2026,$250.00,$50.00,10/15/2026,$200.00,$0.00,11/01/2026,$200.00,$0.00,$200.00,Copay,Called patient,Patient promised payment,VOB verified active,Active';
  const file = csv(`${header}\n${row1}\n`);
  const { format, rows } = await parseImportFile(file, 'billing.csv');
  assert.equal(format, 'csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].raw.patient_name, 'Smith John');
  assert.equal(rows[0].raw.cycle1_date, '10/01/2026');
  assert.equal(rows[0].raw.cycle1_balance, '$250.00');
  assert.equal(rows[0].raw.cycle1_payment, '$50.00');
  assert.equal(rows[0].raw.cycle2_date, '10/15/2026');
  assert.equal(rows[0].raw.cycle2_balance, '$200.00');
  assert.equal(rows[0].raw.cycle3_date, '11/01/2026');
  assert.equal(rows[0].raw.cycle3_balance, '$200.00');
  assert.equal(rows[0].raw.current_balance, '$200.00');
  assert.equal(rows[0].raw.pr_type, 'Copay');
  assert.equal(rows[0].raw.us24_notes, 'Called patient');

  const validated = validateRows(rows);
  assert.equal(validated[0].outcome, 'valid');
  assert.equal(validated[0].data.patient_name, 'Smith John');
  assert.equal(validated[0].data.statement_date, '2026-10-01');
  assert.equal(validated[0].data.balance_due, '200.00');
  assert.match(validated[0].data.account_number, /^ACC-SMITHJ-\d{4}$/);
});

test('parses Namaste Rehab Clinics LLC status sheet format with cycle-specific balance and payment annotations', async () => {
  const header = 'LOCATION ,PATIENT NAME,1ST ELECTRONIC STATEMENT SENT DATE,BALANCE DUE AMOUNT AS ON 1ST ELECTRONIC STATEMENT,PAYMENT RECEIVED,2ND ELECTRONIC STATEMENT SENT DATE,BALANCE DUE AMOUNT AS ON 2ND ELECTRONIC STATEMENT,PAYMENT RECEIVED,3RD ELECTRONIC STATEMENT SENT DATE,BALANCE DUE AMOUNT AS ON 3RD ELECTRONIC STATEMENT,PAYMENT RECEIVED,CURRENT OUTSTANDING BALANCE,PR TYPE,STATUS,US24 NOTES,CLIENT RESPONSE,AS PER VOB- Notes';
  const row1 = 'Spring House,Jeanne Costello,06/08/2026,3.29,Paid $3.29 on 07/29/2026,07/27/2026,3.29,Paid $3.29 on 07/29/2026,,,,0.00,Coinsurance,Payment Received,,Paid in full,As per VOB';
  const file = csv(`${header}\n${row1}\n`);
  const { format, rows } = await parseImportFile(file, 'namaste.csv');
  assert.equal(format, 'csv');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].raw.location_name, 'Spring House');
  assert.equal(rows[0].raw.patient_name, 'Jeanne Costello');
  assert.equal(rows[0].raw.cycle1_date, '06/08/2026');
  assert.equal(rows[0].raw.cycle1_balance, '3.29');
  assert.equal(rows[0].raw.cycle1_payment, 'Paid $3.29 on 07/29/2026');
  assert.equal(rows[0].raw.cycle2_date, '07/27/2026');
  assert.equal(rows[0].raw.cycle2_balance, '3.29');
  assert.equal(rows[0].raw.status, 'Payment Received');

  const validated = validateRows(rows);
  assert.equal(validated[0].outcome, 'valid');
  assert.equal(validated[0].data.patient_name, 'Jeanne Costello');
  assert.equal(validated[0].data.statement_date, '2026-06-08');
  assert.equal(validated[0].data.cycle1_balance, '3.29');
  assert.equal(validated[0].data.cycle1_payment, '3.29');
  assert.equal(validated[0].data.status, 'Payment Received');
});

test('extractPdfsFromZip extracts valid PDFs and ignores non-PDFs and metadata', async () => {
  const zip = new JSZip();
  zip.file('1001.pdf', Buffer.from('%PDF-1.4 patient sample statement'));
  zip.file('Jane Smith.pdf', Buffer.from('%PDF-1.7 second patient statement'));
  zip.file('readme.txt', 'Ignored text file');
  zip.file('__MACOSX/._1001.pdf', Buffer.from('AppleDouble metadata'));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

  const pdfs = await extractPdfsFromZip(zipBuffer);
  assert.equal(pdfs.length, 2);
  assert.deepEqual(pdfs.map((p) => p.originalFilename).sort(), ['1001.pdf', 'Jane Smith.pdf']);
});

test('matchPdfsToRows matches PDFs by account number, patient name, and row index', async () => {
  const zip = new JSZip();
  zip.file('1001.pdf', Buffer.from('%PDF-1.4 statement'));
  zip.file('Smith_Jane.pdf', Buffer.from('%PDF-1.4 statement'));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const pdfs = await extractPdfsFromZip(zipBuffer);

  const rows = [
    { rowNumber: 1, data: { patient_name: 'John Doe', account_number: 'ACC-1001' } },
    { rowNumber: 2, data: { patient_name: 'Jane Smith', account_number: 'ACC-2002' } },
  ];

  const matched = matchPdfsToRows(pdfs, rows);
  assert.equal(matched.matchedCount, 2);
  const p0 = pdfs[matched.assignments.get(0)];
  const p1 = pdfs[matched.assignments.get(1)];
  assert.equal(p0.originalFilename, '1001.pdf');
  assert.equal(p1.originalFilename, 'Smith_Jane.pdf');
});

test('parsePatientStatementPdfSyntax parses Patient Name_$00.00_West AZ_1st or 2nd or 3rd', () => {
  const p1 = parsePatientStatementPdfSyntax('Dolores Beatty_$538.91_West AZ_1st.pdf');
  assert.ok(p1);
  assert.equal(p1.patientName, 'Dolores Beatty');
  assert.equal(p1.amountNum, 538.91);
  assert.equal(p1.locationStr, 'West AZ');
  assert.equal(p1.cycleNum, 1);

  const p2 = parsePatientStatementPdfSyntax('John Doe_$00.00_West AZ_2nd.pdf');
  assert.ok(p2);
  assert.equal(p2.patientName, 'John Doe');
  assert.equal(p2.amountNum, 0);
  assert.equal(p2.locationStr, 'West AZ');
  assert.equal(p2.cycleNum, 2);

  const p3 = parsePatientStatementPdfSyntax('Jane Smith_$1,250.75_Downtown_3rd.pdf');
  assert.ok(p3);
  assert.equal(p3.patientName, 'Jane Smith');
  assert.equal(p3.amountNum, 1250.75);
  assert.equal(p3.locationStr, 'Downtown');
  assert.equal(p3.cycleNum, 3);
});

test('matchPdfsToRows matches multi-cycle PDFs for the same patient into rowPdfs', async () => {
  const zip = new JSZip();
  zip.file('Dolores Beatty_$538.91_West AZ_1st.pdf', Buffer.from('%PDF-1.4 cycle1'));
  zip.file('Dolores Beatty_$538.91_West AZ_2nd.pdf', Buffer.from('%PDF-1.4 cycle2'));
  zip.file('Dolores Beatty_$538.91_West AZ_3rd.pdf', Buffer.from('%PDF-1.4 cycle3'));
  zip.file('John Doe_$00.00_West AZ_1st.pdf', Buffer.from('%PDF-1.4 cycle1'));
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  const pdfs = await extractPdfsFromZip(zipBuffer);

  const rows = [
    { rowNumber: 1, data: { patient_name: 'Dolores Beatty', balance_due: '538.91', location_name: 'West AZ' } },
    { rowNumber: 2, data: { patient_name: 'John Doe', balance_due: '0.00', location_name: 'West AZ' } },
  ];

  const matched = matchPdfsToRows(pdfs, rows);
  assert.equal(matched.matchedCount, 2); // 2 rows matched
  assert.equal(matched.matchedPdfsCount, 4); // all 4 PDFs matched!

  // Dolores Beatty has 3 PDFs attached
  const doloresPdfs = matched.rowPdfs.get(0).map((idx) => pdfs[idx].originalFilename);
  assert.equal(doloresPdfs.length, 3);
  assert.ok(doloresPdfs.includes('Dolores Beatty_$538.91_West AZ_1st.pdf'));
  assert.ok(doloresPdfs.includes('Dolores Beatty_$538.91_West AZ_2nd.pdf'));
  assert.ok(doloresPdfs.includes('Dolores Beatty_$538.91_West AZ_3rd.pdf'));

  // John Doe has 1 PDF attached
  const johnPdfs = matched.rowPdfs.get(1).map((idx) => pdfs[idx].originalFilename);
  assert.equal(johnPdfs.length, 1);
  assert.equal(johnPdfs[0], 'John Doe_$00.00_West AZ_1st.pdf');
});


