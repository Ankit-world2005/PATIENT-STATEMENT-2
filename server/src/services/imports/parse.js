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
    // .xlsx files are zip archives.
    if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx';
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
  const sheet = workbook.worksheets[0];
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
  const columns = header.values.map((h) => (isBlank(h) ? null : normalizeHeader(h)));

  const missing = REQUIRED_KEYS.filter((k) => !columns.includes(k));
  if (missing.length) {
    throw new ImportFileError(`Missing columns: ${missing.map((k) => FIELD_BY_KEY[k].label).join(', ')}.`);
  }
  const seen = new Set();
  for (const key of columns) {
    if (!key) continue;
    if (seen.has(key)) throw new ImportFileError(`The column "${FIELD_BY_KEY[key].label}" appears more than once.`);
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
    const raw = {};
    columns.forEach((key, i) => {
      if (key) raw[key] = values[i] ?? null;
    });
    return { rowNumber, raw };
  });
  return { format, rows, ignoredColumns };
}
