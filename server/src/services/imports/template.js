import ExcelJS from 'exceljs';
import { FIELDS } from '../../lib/statement-fields.js';

// Import template (FR-7.2). Column names are the statement field keys; the
// example rows start with "EXAMPLE" and are rejected if left in the file.

const EXAMPLES = [
  {
    patient_name: 'EXAMPLE - Jane Sample', account_number: 'ACC-0000001', statement_date: '2026-10-15',
    balance_due: '125.50', patient_dob: '1980-04-18', service_date_from: '2026-10-01', service_date_to: '2026-10-01',
    cpt_codes: '99213 80053', billed_amount: '410.00', insurance_paid: '250.00', adjustments: '34.50',
    insurance_name: 'Example Health Plan',
  },
  {
    patient_name: 'EXAMPLE - John Sample', account_number: 'ACC-0000002', statement_date: '2026-10-15',
    balance_due: '-20.00', patient_dob: '', service_date_from: '', service_date_to: '', cpt_codes: '',
    billed_amount: '', insurance_paid: '', adjustments: '', insurance_name: '',
  },
];

const NOTES = {
  patient_name: 'Required. Up to 200 characters.',
  account_number: 'Required. Up to 64 characters.',
  statement_date: 'Required. YYYY-MM-DD or MM/DD/YYYY. Not in the future.',
  balance_due: 'Required. Amount, e.g. 125.50. Negative for a credit.',
  patient_dob: 'Optional. Date, before the statement date.',
  service_date_from: 'Optional. First date of service.',
  service_date_to: 'Optional. Last date of service (defaults to the first).',
  cpt_codes: 'Optional. 5-character codes separated by spaces, commas or semicolons.',
  billed_amount: 'Optional. Amount, 0 or more.',
  insurance_paid: 'Optional. Amount, 0 or more.',
  adjustments: 'Optional. Amount; may be negative.',
  insurance_name: 'Optional. Up to 200 characters.',
};

let xlsxCache;
let csvCache;

export async function templateXlsx() {
  if (xlsxCache) return xlsxCache;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'US24 Solutions - My Patient';

  const sheet = wb.addWorksheet('Statements');
  sheet.columns = FIELDS.map((f) => ({ header: f.key, key: f.key, width: Math.max(16, f.key.length + 4) }));
  // Text format keeps account numbers and dates exactly as typed.
  sheet.columns.forEach((col) => {
    col.numFmt = '@';
  });
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1EFEF' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  EXAMPLES.forEach((row) => sheet.addRow(row));

  const help = wb.addWorksheet('Instructions');
  help.columns = [
    { header: 'Column', key: 'column', width: 22 },
    { header: 'Required', key: 'required', width: 10 },
    { header: 'Rules', key: 'rules', width: 70 },
  ];
  help.getRow(1).font = { bold: true };
  FIELDS.forEach((f) => help.addRow({ column: f.key, required: f.required ? 'Yes' : 'No', rules: NOTES[f.key] }));
  help.addRow({});
  help.addRow({ column: 'One clinic per file. Up to 5,000 rows and 10 MB.' });
  help.addRow({ column: 'Delete the EXAMPLE rows before importing.' });
  help.addRow({ column: 'Only the first sheet ("Statements") is imported.' });

  xlsxCache = Buffer.from(await wb.xlsx.writeBuffer());
  return xlsxCache;
}

export function templateCsv() {
  if (csvCache) return csvCache;
  const lines = [FIELDS.map((f) => f.key).join(',')];
  for (const row of EXAMPLES) lines.push(FIELDS.map((f) => row[f.key]).join(','));
  csvCache = Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
  return csvCache;
}
