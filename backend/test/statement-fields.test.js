import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeHeader, parseDate, parseMoney, validateStatement } from '../src/lib/statement-fields.js';

test('parseDate accepts ISO, US and spreadsheet dates and rejects impossible ones', () => {
  assert.equal(parseDate('2026-10-05'), '2026-10-05');
  assert.equal(parseDate('10/5/2026'), '2026-10-05');
  assert.equal(parseDate(new Date(Date.UTC(2026, 9, 5))), '2026-10-05');
  assert.equal(parseDate(46300), '2026-10-05'); // Excel serial
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('13/01/2026'), null);
  assert.equal(parseDate('next tuesday'), null);
});

test('parseMoney handles currency formatting, credits and precision', () => {
  assert.equal(parseMoney('$1,234.50'), '1234.50');
  assert.equal(parseMoney('(25.00)'), '-25.00');
  assert.equal(parseMoney('-25'), '-25.00');
  assert.equal(parseMoney(99.9), '99.90');
  assert.equal(parseMoney('12.345'), null);
  assert.equal(parseMoney(12.345), null);
  assert.equal(parseMoney('abc'), null);
});

test('normalizeHeader maps common spellings to field keys', () => {
  assert.equal(normalizeHeader('Patient Name'), 'patient_name');
  assert.equal(normalizeHeader(' Acct No '), 'account_number');
  assert.equal(normalizeHeader('DOB'), 'patient_dob');
  assert.equal(normalizeHeader('Payer'), 'insurance_name');
  assert.equal(normalizeHeader('Favourite colour'), null);
});

const valid = { patient_name: 'Jane Doe', account_number: 'A-1', statement_date: '2026-10-01', balance_due: '10' };

test('validateStatement requires the four required fields', () => {
  const { errors } = validateStatement({});
  assert.deepEqual(errors.map((e) => e.field).sort(), ['account_number', 'balance_due', 'patient_name', 'statement_date']);
});

test('validateStatement applies cross-field rules', () => {
  assert.equal(validateStatement(valid).errors.length, 0);

  const future = validateStatement({ ...valid, statement_date: '2999-01-01' });
  assert.match(future.errors[0].message, /future/);

  const dob = validateStatement({ ...valid, patient_dob: '2026-10-02' });
  assert.equal(dob.errors[0].field, 'patient_dob');

  const fromOnly = validateStatement({ ...valid, service_date_from: '2026-09-01' });
  assert.equal(fromOnly.data.service_date_to, '2026-09-01');

  const toOnly = validateStatement({ ...valid, service_date_to: '2026-09-01' });
  assert.equal(toOnly.errors[0].field, 'service_date_from');

  const negativeBilled = validateStatement({ ...valid, billed_amount: '-5' });
  assert.equal(negativeBilled.errors[0].field, 'billed_amount');

  const cpt = validateStatement({ ...valid, cpt_codes: '99213, 80053;99213' });
  assert.deepEqual(cpt.data.cpt_codes, ['99213', '80053']);
  assert.equal(validateStatement({ ...valid, cpt_codes: '9921' }).errors[0].field, 'cpt_codes');
});
