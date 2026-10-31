// Statement fields and their rules (PRD 6.8, schema 5.6). Used by both the
// single PDF upload form and the spreadsheet import so a value is accepted or
// rejected the same way everywhere.

export const FIELDS = [
  { key: 'patient_name', label: 'Patient name', required: true, type: 'text', max: 200 },
  { key: 'account_number', label: 'Account number', required: true, type: 'text', max: 64 },
  { key: 'statement_date', label: 'Statement date', required: true, type: 'date' },
  { key: 'balance_due', label: 'Balance due', required: true, type: 'money', allowNegative: true },
  { key: 'patient_dob', label: 'Date of birth', type: 'date' },
  { key: 'service_date_from', label: 'Service date from', type: 'date' },
  { key: 'service_date_to', label: 'Service date to', type: 'date' },
  { key: 'cpt_codes', label: 'CPT codes', type: 'cpt' },
  { key: 'billed_amount', label: 'Billed amount', type: 'money' },
  { key: 'insurance_paid', label: 'Insurance paid', type: 'money' },
  { key: 'adjustments', label: 'Adjustments', type: 'money', allowNegative: true },
  { key: 'insurance_name', label: 'Insurance name', type: 'text', max: 200 },
  // Ledger multi-cycle & tracking fields
  { key: 'location_name', label: 'Location', type: 'text', max: 200 },
  { key: 'cycle1_date', label: '1st electronic statement', type: 'date' },
  { key: 'cycle1_balance', label: 'Balance due amount (1st)', type: 'money', allowNegative: true },
  { key: 'cycle1_payment', label: 'Payment received (1st)', type: 'money', allowNegative: true },
  { key: 'cycle2_date', label: '2nd electronic statement', type: 'date' },
  { key: 'cycle2_balance', label: 'Balance due amount (2nd)', type: 'money', allowNegative: true },
  { key: 'cycle2_payment', label: 'Payment received (2nd)', type: 'money', allowNegative: true },
  { key: 'cycle3_date', label: '3rd electronic statement', type: 'date' },
  { key: 'cycle3_balance', label: 'Balance due amount (3rd)', type: 'money', allowNegative: true },
  { key: 'cycle3_payment', label: 'Payment received (3rd)', type: 'money', allowNegative: true },
  { key: 'current_balance', label: 'Current outstanding balance', type: 'money', allowNegative: true },
  { key: 'pr_type', label: 'PR type', type: 'text', max: 50 },
  { key: 'status', label: 'Status', type: 'text', max: 50 },
  { key: 'us24_notes', label: 'US24 notes', type: 'text', max: 2000 },
  { key: 'remarks', label: 'Remarks', type: 'text', max: 2000 },
  { key: 'client_response', label: 'Client response', type: 'text', max: 2000 },
  { key: 'vob_notes', label: 'AS PER VOB- Notes', type: 'text', max: 2000 },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const REQUIRED_KEYS = FIELDS.filter((f) => f.required).map((f) => f.key);

// Header spellings accepted in import files, after normalising to snake_case.
const HEADER_ALIASES = {
  patient: 'patient_name', name: 'patient_name', patient_full_name: 'patient_name',
  account: 'account_number', account_no: 'account_number', acct_number: 'account_number',
  acct_no: 'account_number', patient_account_number: 'account_number', account_num: 'account_number',
  acct: 'account_number', acct_: 'account_number', acct_num: 'account_number', patient_account: 'account_number', patient_acct: 'account_number',
  date: 'statement_date', stmt_date: 'statement_date',
  balance: 'balance_due', patient_balance: 'balance_due', patient_balance_due: 'balance_due', amount_due: 'balance_due',
  dob: 'patient_dob', date_of_birth: 'patient_dob', birth_date: 'patient_dob',
  service_from: 'service_date_from', dos_from: 'service_date_from', date_of_service_from: 'service_date_from',
  service_to: 'service_date_to', dos_to: 'service_date_to', date_of_service_to: 'service_date_to',
  cpt: 'cpt_codes', cpt_code: 'cpt_codes', procedure_codes: 'cpt_codes',
  billed: 'billed_amount', total_billed: 'billed_amount', charges: 'billed_amount',
  ins_paid: 'insurance_paid', insurance_payment: 'insurance_paid', insurance_payments: 'insurance_paid',
  adjustment: 'adjustments', contractual_adjustments: 'adjustments',
  insurance: 'insurance_name', payer: 'insurance_name', insurance_company: 'insurance_name', primary_insurance: 'insurance_name',
  // Medical billing ledger aliases
  location: 'location_name', clinic_location: 'location_name',
  '1st_electronic_statement': 'cycle1_date', first_electronic_statement: 'cycle1_date',
  '2nd_electronic_statement': 'cycle2_date', second_electronic_statement: 'cycle2_date',
  '3rd_electronic_statement': 'cycle3_date', third_electronic_statement: 'cycle3_date',
  current_outstanding_balance: 'current_balance', outstanding_balance: 'current_balance',
  pr_type: 'pr_type', patient_responsibility: 'pr_type', patient_resp: 'pr_type',
  status: 'status',
  us24_notes: 'us24_notes', specialist_notes: 'us24_notes', remarks: 'us24_notes', notes: 'us24_notes',
  client_response: 'client_response', clinic_response: 'client_response', client_notes: 'client_response',
  as_per_vob_notes: 'vob_notes', as_per_vob: 'vob_notes', vob_notes: 'vob_notes', vob: 'vob_notes',
};

export function normalizeHeader(header) {
  const key = String(header ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (FIELD_BY_KEY[key]) return key;
  return HEADER_ALIASES[key] ?? null;
}

// --- Value parsers -----------------------------------------------------------
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function isBlank(raw) {
  if (raw === null || raw === undefined) return true;
  if (typeof raw === 'string') {
    return raw.replace(/[\u00A0\s]+/g, ' ').trim() === '';
  }
  return false;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isoFromParts(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseDate(raw) {
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    // Spreadsheet dates arrive as UTC midnight of the calendar date.
    return isoFromParts(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate());
  }
  if (typeof raw === 'number') {
    // Excel serial date (days since 1899-12-30).
    if (!Number.isInteger(raw) || raw < 1 || raw > 2958465) return null;
    return parseDate(new Date(Date.UTC(1899, 11, 30) + raw * 86400000));
  }
  const s = String(raw).replace(/[\u00A0\s]+/g, ' ').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return isoFromParts(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return isoFromParts(Number(m[3]), Number(m[1]), Number(m[2]));
  return null;
}

/** Parses an amount into a fixed 2-decimal string, or null. Accepts "$1,234.50", "-25", "(25.00)", "Paid $3.29 on 07/29/2026". */
export function parseMoney(raw) {
  let n;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    if (Math.abs(Math.round(raw * 100) - raw * 100) > 1e-6) return null;
    n = Math.round(raw * 100) / 100;
  } else {
    let s = String(raw).replace(/[\u00A0\s]+/g, ' ').trim();
    if (!s || s === '-' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'none') return null;

    // Support notes/payment annotations e.g. "Paid $3.29 on 07/29/2026"
    const dollarMatch = s.match(/\$([0-9,]+(?:\.[0-9]{1,2})?)/);
    if (dollarMatch) {
      const cleanNum = dollarMatch[1].replace(/,/g, '');
      n = Number(cleanNum);
      if (Number.isFinite(n) && Math.abs(n) < 1e10) return n.toFixed(2);
    }

    s = s.replace(/[$,\s]/g, '');
    let negative = false;
    if (/^\(.*\)$/.test(s)) {
      negative = true;
      s = s.slice(1, -1);
    }
    if (!/^-?\d+(\.\d{1,2})?$/.test(s)) return null;
    n = Number(s) * (negative ? -1 : 1);
  }
  if (Math.abs(n) >= 1e10) return null;
  return n.toFixed(2);
}

function parseCpt(raw) {
  const codes = String(raw)
    .toUpperCase()
    .split(/[\s,;|]+/)
    .filter(Boolean);
  if (codes.length > 50) return { error: 'Enter no more than 50 CPT codes.' };
  const bad = codes.find((c) => !/^[0-9A-Z]{5}$/.test(c));
  if (bad) return { error: `"${bad.slice(0, 12)}" is not a 5-character CPT code.` };
  return { value: [...new Set(codes)] };
}

function parseField(field, raw) {
  if (isBlank(raw)) {
    return field.required ? { error: `${field.label} is required.` } : { value: null };
  }
  switch (field.type) {
    case 'text': {
      const value = String(raw).replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim();
      if (!value) return field.required ? { error: `${field.label} is required.` } : { value: null };
      if (value.length > field.max) return { error: `${field.label} must be ${field.max} characters or fewer.` };
      return { value };
    }
    case 'date': {
      const value = parseDate(raw);
      if (!value) return { error: `${field.label} is not a valid date. Use YYYY-MM-DD or MM/DD/YYYY.` };
      if (value < '1900-01-01') return { error: `${field.label} must be after 1900.` };
      return { value };
    }
    case 'money': {
      const value = parseMoney(raw);
      if (value === null) return { error: `${field.label} must be an amount like 125.50.` };
      if (!field.allowNegative && Number(value) < 0) return { error: `${field.label} can't be negative.` };
      return { value };
    }
    case 'cpt':
      return parseCpt(raw);
    default:
      return { error: `${field.label} is not supported.` };
  }
}

function todayPlusOne() {
  const d = new Date(Date.now() + 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Validates one statement's raw values (keyed by field key).
 * Returns { data, errors } where errors is [{ field, message }].
 */
export function validateStatement(raw) {
  const normalizedRaw = { ...raw };
  if (!normalizedRaw.statement_date && normalizedRaw.cycle1_date) {
    normalizedRaw.statement_date = normalizedRaw.cycle1_date;
  }
  if (normalizedRaw.balance_due === undefined || normalizedRaw.balance_due === null || normalizedRaw.balance_due === '') {
    if (normalizedRaw.current_balance !== undefined && normalizedRaw.current_balance !== null && normalizedRaw.current_balance !== '') {
      normalizedRaw.balance_due = normalizedRaw.current_balance;
    } else if (normalizedRaw.cycle1_balance !== undefined && normalizedRaw.cycle1_balance !== null && normalizedRaw.cycle1_balance !== '') {
      normalizedRaw.balance_due = normalizedRaw.cycle1_balance;
    }
  }
  if (!normalizedRaw.account_number && normalizedRaw.patient_name) {
    const clean = String(normalizedRaw.patient_name).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6);
    const suffix = normalizedRaw._rowNumber ? String(normalizedRaw._rowNumber).padStart(4, '0') : Math.floor(10000 + Math.random() * 90000);
    normalizedRaw.account_number = `ACC-${clean || 'PT'}-${suffix}`;
  }
  if (!normalizedRaw.us24_notes && normalizedRaw.remarks) {
    normalizedRaw.us24_notes = normalizedRaw.remarks;
  }
  if (!normalizedRaw.remarks && normalizedRaw.us24_notes) {
    normalizedRaw.remarks = normalizedRaw.us24_notes;
  }

  const data = {};
  const errors = [];
  for (const field of FIELDS) {
    const result = parseField(field, normalizedRaw[field.key]);
    if (result.error) errors.push({ field: field.key, message: result.error });
    else data[field.key] = result.value;
  }

  if (data.us24_notes && !data.remarks) data.remarks = data.us24_notes;
  if (data.remarks && !data.us24_notes) data.us24_notes = data.remarks;

  const has = (k) => data[k] !== undefined && data[k] !== null;
  if (has('statement_date') && data.statement_date > todayPlusOne()) {
    errors.push({ field: 'statement_date', message: "Statement date can't be in the future." });
  }
  if (has('patient_dob') && has('statement_date') && data.patient_dob >= data.statement_date) {
    errors.push({ field: 'patient_dob', message: 'Date of birth must be before the statement date.' });
  }
  if (has('service_date_from') && data.service_date_to === null) data.service_date_to = data.service_date_from;
  if (has('service_date_to') && data.service_date_from === null) {
    errors.push({ field: 'service_date_from', message: 'Enter the first date of service.' });
  }
  if (has('service_date_from') && has('service_date_to') && data.service_date_from > data.service_date_to) {
    errors.push({ field: 'service_date_to', message: 'Service end date must be on or after the start date.' });
  }
  return { data, errors };
}
