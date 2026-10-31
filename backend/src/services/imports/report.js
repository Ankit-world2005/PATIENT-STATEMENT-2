import { FIELDS } from '../../lib/statement-fields.js';

// Error report for an import (FR-7.6). Every cell is neutralised so a value
// such as "=HYPERLINK(...)" cannot run as a formula when opened (TRD 5.4).

function safeCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dataValue(data, key) {
  const v = data?.[key];
  if (Array.isArray(v)) return v.join(' ');
  return v ?? '';
}

/**
 * rows: [{ row_number, outcome, data, errors }]
 * outcome: 'invalid' (failed) or 'duplicate' (skipped).
 */
export function buildErrorReportCsv(rows) {
  const header = ['Row', 'Result', 'Reason', ...FIELDS.map((f) => f.key)];
  const lines = [header.map(safeCell).join(',')];
  for (const row of rows) {
    const reason =
      row.outcome === 'invalid'
        ? (row.errors ?? []).map((e) => e.message).join(' ')
        : 'Skipped: matches an existing statement with the same account number and statement date.';
    lines.push(
      [
        row.row_number,
        row.outcome === 'invalid' ? 'Failed' : 'Skipped duplicate',
        reason,
        ...FIELDS.map((f) => dataValue(row.data, f.key)),
      ]
        .map(safeCell)
        .join(','),
    );
  }
  // BOM so Excel opens the file as UTF-8.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}
