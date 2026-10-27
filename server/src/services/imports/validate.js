import { validateStatement } from '../../lib/statement-fields.js';

// Row-level validation for imports (FR-7.3) and duplicate lookup (FR-7.5).

const TEMPLATE_EXAMPLE = /^example\b/i;

function rawAsText(raw) {
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || value === undefined) out[key] = '';
    else if (value instanceof Date) out[key] = Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
    else out[key] = String(value).slice(0, 500);
  }
  return out;
}

/**
 * Validates every row. Rows with the same account number and statement date as
 * an earlier row in the same file are invalid.
 * Returns [{ rowNumber, outcome: 'valid' | 'invalid', data, errors? }].
 */
export function validateRows(rows) {
  const firstRowByKey = new Map();
  return rows.map(({ rowNumber, raw }) => {
    const { data, errors } = validateStatement(raw);
    if (data.patient_name && TEMPLATE_EXAMPLE.test(data.patient_name)) {
      errors.push({ field: 'patient_name', message: "This is the template's example row. Delete it before importing." });
    }
    if (!errors.length) {
      const key = `${data.account_number}\u0000${data.statement_date}`;
      const first = firstRowByKey.get(key);
      if (first) {
        errors.push({
          field: 'account_number',
          message: `Same account number and statement date as row ${first} in this file.`,
        });
      } else {
        firstRowByKey.set(key, rowNumber);
      }
    }
    return errors.length
      ? { rowNumber, outcome: 'invalid', data: rawAsText(raw), errors }
      : { rowNumber, outcome: 'valid', data };
  });
}

/**
 * Marks valid rows that match an existing active statement for the clinic with the
 * same account number and statement date. They point at the newest version.
 */
export async function markDuplicates(db, clinicId, validated) {
  const valid = validated.filter((r) => r.outcome === 'valid');
  for (let i = 0; i < valid.length; i += 1000) {
    const chunk = valid.slice(i, i + 1000);
    const { rows } = await db.query(
      `SELECT DISTINCT ON (s.account_number, s.statement_date)
              s.id, s.account_number, s.statement_date
         FROM statement s
         JOIN unnest($2::text[], $3::date[]) AS k(account_number, statement_date)
           ON s.account_number = k.account_number AND s.statement_date = k.statement_date
        WHERE s.clinic_id = $1 AND s.status = 'active'
        ORDER BY s.account_number, s.statement_date, s.version DESC`,
      [clinicId, chunk.map((r) => r.data.account_number), chunk.map((r) => r.data.statement_date)],
    );
    const existing = new Map(rows.map((r) => [`${r.account_number}\u0000${r.statement_date}`, r.id]));
    for (const row of chunk) {
      const id = existing.get(`${row.data.account_number}\u0000${row.data.statement_date}`);
      if (id) {
        row.outcome = 'duplicate';
        row.duplicateOf = id;
        row.duplicateDecision = 'new_version';
      }
    }
  }
  return validated;
}
