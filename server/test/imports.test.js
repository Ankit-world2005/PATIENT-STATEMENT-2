import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ImportFileError, parseImportFile } from '../src/services/imports/parse.js';
import { buildErrorReportCsv } from '../src/services/imports/report.js';
import { templateCsv, templateXlsx } from '../src/services/imports/template.js';
import { validateRows } from '../src/services/imports/validate.js';

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
