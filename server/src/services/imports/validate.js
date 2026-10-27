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
 * Marks valid rows that match an existing active statement for the clinic.
 * Matches primarily by account number, and secondarily by normalized patient name.
 * Default decision is 'update' to update the existing statement record.
 */
export async function markDuplicates(db, clinicId, validated) {
  const valid = validated.filter((r) => r.outcome === 'valid');
  for (let i = 0; i < valid.length; i += 1000) {
    const chunk = valid.slice(i, i + 1000);
    const accountNumbers = chunk.map((r) => r.data.account_number).filter(Boolean);
    const patientNames = chunk
      .map((r) => (r.data.patient_name ? r.data.patient_name.trim().toLowerCase() : ''))
      .filter(Boolean);

    const { rows } = await db.query(
      `SELECT DISTINCT ON (s.account_number)
              s.id, s.account_number, lower(trim(s.patient_name)) AS norm_name, s.statement_date
         FROM statement s
        WHERE s.clinic_id = $1 AND s.status = 'active'
          AND (s.account_number = ANY($2::text[]) OR lower(trim(s.patient_name)) = ANY($3::text[]))
        ORDER BY s.account_number, s.statement_date DESC, s.created_at DESC`,
      [clinicId, accountNumbers, patientNames],
    );

    const byAccount = new Map();
    const byName = new Map();
    for (const r of rows) {
      if (r.account_number && !byAccount.has(r.account_number)) {
        byAccount.set(r.account_number, r.id);
      }
      if (r.norm_name && !byName.has(r.norm_name)) {
        byName.set(r.norm_name, r.id);
      }
    }

    for (const row of chunk) {
      const existingId =
        (row.data.account_number ? byAccount.get(row.data.account_number) : null) ||
        (row.data.patient_name ? byName.get(row.data.patient_name.trim().toLowerCase()) : null);

      if (existingId) {
        row.outcome = 'duplicate';
        row.duplicateOf = existingId;
        row.duplicateDecision = 'update';
      }
    }
  }
  return validated;
}

