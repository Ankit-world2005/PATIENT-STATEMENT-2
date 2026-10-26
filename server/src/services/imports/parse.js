import path from 'node:path';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import { config } from '../../config.js';
import { FIELD_BY_KEY, REQUIRED_KEYS, normalizeHeader } from '../../lib/statement-fields.js';

/** A problem with the whole file. Messages name columns only, never row data (schema 5.9). */
export class ImportFileError extends Error {}

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

export function detectFormat(filename, buffer) {
  const ext = path.extname(filename || '').toLowerCase();
  if (ext === '.xlsx') {
    // .xlsx files are zip archives (must start with 'PK' -> 0x50 0x4b).
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx';

    // Detect if this is an HTML redirect/login page from SharePoint or OneDrive
    const textStart = buffer.slice(0, 500).toString('utf8').toLowerCase();
    if (textStart.includes('<html') || textStart.includes('<!doctype') || textStart.includes('sharepoint')) {
      throw new ImportFileError(
        'This file is a SharePoint/OneDrive web login page, not the actual Excel file. Please open the link in SharePoint or your browser and click the Download button to download the real .xlsx file.'
      );
    }

    // Older binary .xls file (OLE compound format starting with 0xD0 0xCF)
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf) {
      throw new ImportFileError(
        'This file is in the older Excel 97-2003 (.xls) format. Open it in Microsoft Excel, click "Save As", and choose "Excel Workbook (*.xlsx)".'
      );
    }
    // If someone renamed a CSV / text file to .xlsx, parse it as CSV
    if (!buffer.includes(0)) return 'csv';
    throw new ImportFileError('This file is not a valid .xlsx workbook. Save it as Excel Workbook (.xlsx) and try again.');
  }
  if (ext === '.csv') {
    if (buffer.includes(0)) throw new ImportFileError('This file does not look like a CSV text file.');
    return 'csv';
  }
  return null;
}

// Formulas are never evaluated: only the value Excel saved with the file is used (TRD 5.4).
function cellValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== 'object') return v;
  if ('result' in v) return cellValue(v.result);
  if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  if ('text' in v) return cellValue(v.text);
  return null;
}

async function readXlsx(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ImportFileError("This workbook can't be read. Save it as Excel Workbook (.xlsx) and try again.");
  }
  // Prefer sheet named "PATIENT STATEMENT" or containing "statement", fallback to first sheet
  const sheet =
    workbook.worksheets.find(
      (w) =>
        w.name.toLowerCase().includes('patient statement') ||
        w.name.toLowerCase().includes('statement')
    ) || workbook.worksheets[0];
  if (!sheet) throw new ImportFileError('The workbook has no sheets.');
  const rows = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    const values = [];
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      values[col - 1] = cellValue(cell.value);
    });
    rows.push({ rowNumber, values });
  });
  return rows;
}

function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    // Excel's "CSV" export on Windows uses Windows-1252.
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

function readCsv(buffer) {
  let records;
  try {
    records = parseCsv(decodeText(buffer), { bom: true, relax_column_count: true, skip_empty_lines: false });
  } catch (err) {
    throw new ImportFileError(`This CSV file can't be read (${err.code === 'CSV_QUOTE_NOT_CLOSED' ? 'a quote is not closed' : 'invalid format'}).`);
  }
  // Record index + 1 is the row number the user sees in Excel.
  return records.map((values, i) => ({ rowNumber: i + 1, values }));
}

export function mapHeaderColumns(headerValues) {
  let currentCycle = 0;
  const mapped = [];

  for (const raw of headerValues) {
    if (isBlank(raw)) {
      mapped.push(null);
      continue;
    }
    const clean = String(raw).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    // 1. Current / outstanding balance
    if (
      clean === 'current_outstanding_balance' ||
      clean === 'outstanding_balance' ||
      clean === 'current_balance' ||
      (clean.includes('current') && (clean.includes('balance') || clean.includes('outstanding')))
    ) {
      mapped.push('current_balance');
      continue;
    }

    // 2. Balance due amounts (cycle specific or generic)
    if (clean.includes('balance') || clean.includes('amount_due')) {
      if (clean.includes('1st') || clean.includes('first') || clean.startsWith('cycle_1') || clean.startsWith('cycle1')) {
        mapped.push('cycle1_balance');
      } else if (clean.includes('2nd') || clean.includes('second') || clean.startsWith('cycle_2') || clean.startsWith('cycle2')) {
        mapped.push('cycle2_balance');
      } else if (clean.includes('3rd') || clean.includes('third') || clean.startsWith('cycle_3') || clean.startsWith('cycle3')) {
        mapped.push('cycle3_balance');
      } else if (currentCycle === 1) {
        mapped.push('cycle1_balance');
      } else if (currentCycle === 2) {
        mapped.push('cycle2_balance');
      } else if (currentCycle === 3) {
        mapped.push('cycle3_balance');
      } else {
        mapped.push('balance_due');
      }
      continue;
    }

    // 3. Payment received (cycle specific or generic)
    if (clean.includes('payment') || clean.includes('pmt')) {
      if (clean.includes('1st') || clean.includes('first') || clean.startsWith('cycle_1') || clean.startsWith('cycle1')) {
        mapped.push('cycle1_payment');
      } else if (clean.includes('2nd') || clean.includes('second') || clean.startsWith('cycle_2') || clean.startsWith('cycle2')) {
        mapped.push('cycle2_payment');
      } else if (clean.includes('3rd') || clean.includes('third') || clean.startsWith('cycle_3') || clean.startsWith('cycle3')) {
        mapped.push('cycle3_payment');
      } else if (currentCycle === 1) {
        mapped.push('cycle1_payment');
      } else if (currentCycle === 2) {
        mapped.push('cycle2_payment');
      } else if (currentCycle === 3) {
        mapped.push('cycle3_payment');
      } else {
        mapped.push(null);
      }
      continue;
    }

    // 4. Cycle statement dates (must not be balance or payment)
    if (
      (clean.includes('1st') || clean.includes('first') || clean.startsWith('cycle_1') || clean === 'cycle1') &&
      (clean.includes('statement') || clean.includes('electronic') || clean.includes('date') || clean.includes('sent'))
    ) {
      currentCycle = 1;
      mapped.push('cycle1_date');
      continue;
    }
    if (
      (clean.includes('2nd') || clean.includes('second') || clean.startsWith('cycle_2') || clean === 'cycle2') &&
      (clean.includes('statement') || clean.includes('electronic') || clean.includes('date') || clean.includes('sent'))
    ) {
      currentCycle = 2;
      mapped.push('cycle2_date');
      continue;
    }
    if (
      (clean.includes('3rd') || clean.includes('third') || clean.startsWith('cycle_3') || clean === 'cycle3') &&
      (clean.includes('statement') || clean.includes('electronic') || clean.includes('date') || clean.includes('sent'))
    ) {
      currentCycle = 3;
      mapped.push('cycle3_date');
      continue;
    }

    // 5. Patient name
    if (clean === 'patient_name' || clean === 'patient' || clean === 'name' || clean === 'patient_full_name') {
      mapped.push('patient_name');
      continue;
    }

    // 6. Location
    if (clean === 'location' || clean === 'clinic_location' || clean.includes('location_name')) {
      mapped.push('location_name');
      continue;
    }

    // 7. PR Type
    if (clean === 'pr_type' || clean === 'pr' || clean.includes('patient_resp') || clean === 'patient_responsibility') {
      mapped.push('pr_type');
      continue;
    }

    // 8. Notes & remarks
    if (clean === 'us24_notes' || clean === 'us24' || clean.includes('specialist_note') || clean.includes('us24_note')) {
      mapped.push('us24_notes');
      continue;
    }
    if (clean === 'remarks' || clean === 'remark') {
      mapped.push('remarks');
      continue;
    }
    if (clean === 'client_response' || clean === 'clinic_response' || clean.includes('client_note') || clean.includes('clinic_note')) {
      mapped.push('client_response');
      continue;
    }
    if (clean.includes('vob')) {
      mapped.push('vob_notes');
      continue;
    }

    // 9. Status
    if (clean === 'status' || clean === 'ledger_status' || clean === 'patient_status') {
      mapped.push('status');
      continue;
    }

    // 10. Fallback to standard normalizeHeader
    mapped.push(normalizeHeader(raw));
  }

  return mapped;
}

/**
 * Parses an import file into rows keyed by statement field.
 * Returns { format, rows: [{ rowNumber, raw }], ignoredColumns }.
 */
export async function parseImportFile(buffer, filename) {
  const format = detectFormat(filename, buffer);
  if (!format) throw new ImportFileError('Upload an .xlsx or .csv file.');

  const all = format === 'xlsx' ? await readXlsx(buffer) : readCsv(buffer);
  const nonEmpty = all.filter((r) => r.values.some((v) => !isBlank(v)));
  if (!nonEmpty.length) throw new ImportFileError('The file is empty.');

  const [header, ...dataRows] = nonEmpty;
  const columns = mapHeaderColumns(header.values);

  const isMultiCycle = columns.includes('cycle1_date') || columns.includes('current_balance') || columns.includes('cycle1_balance');

  const missing = [];
  if (!columns.includes('patient_name')) missing.push('patient_name');
  if (!columns.includes('statement_date') && !columns.includes('cycle1_date')) missing.push('statement_date');
  if (!columns.includes('balance_due') && !columns.includes('current_balance') && !columns.includes('cycle1_balance')) missing.push('balance_due');
  if (!isMultiCycle && !columns.includes('account_number')) missing.push('account_number');

  if (missing.length) {
    throw new ImportFileError(`Missing columns: ${missing.map((k) => FIELD_BY_KEY[k].label).join(', ')}.`);
  }

  const seen = new Set();
  for (const key of columns) {
    if (!key) continue;
    if (seen.has(key)) throw new ImportFileError(`The column "${FIELD_BY_KEY[key]?.label || key}" appears more than once.`);
    seen.add(key);
  }

  if (!dataRows.length) throw new ImportFileError('The file has a header row but no statements.');
  const max = config.uploads.maxImportRows;
  if (dataRows.length > max) {
    throw new ImportFileError(`The file has ${dataRows.length.toLocaleString('en-US')} rows. The limit is ${max.toLocaleString('en-US')} rows per file.`);
  }

  const ignoredColumns = header.values
    .map((h, i) => (!isBlank(h) && !columns[i] ? String(h).trim().slice(0, 40) : null))
    .filter(Boolean);

  const rows = dataRows.map(({ rowNumber, values }) => {
    const raw = { _rowNumber: rowNumber };
    columns.forEach((key, i) => {
      if (key) raw[key] = values[i] ?? null;
    });
    return { rowNumber, raw };
  });
  return { format, rows, ignoredColumns };
}
