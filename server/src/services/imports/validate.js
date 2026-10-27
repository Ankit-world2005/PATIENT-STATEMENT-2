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
 * Validates every row. A row for the same patient as an earlier row in the same
 * file is invalid. A patient is identified by account number or, when the file has
 * none, by name: the generated ACC-NAME-row number changes whenever rows move.
 * Returns [{ rowNumber, outcome: 'valid' | 'invalid', data, errors?, matchAccount?, matchName? }].
 */
export function validateRows(rows) {
  const firstRowByPatient = new Map();
  return rows.map(({ rowNumber, raw }) => {
    const { data, errors } = validateStatement(raw);
    if (data.patient_name && TEMPLATE_EXAMPLE.test(data.patient_name)) {
      errors.push({ field: 'patient_name', message: "This is the template's example row. Delete it before importing." });
    }
    if (!errors.length) {
      const matchAccount = raw.account_number ? data.account_number : null;
      const matchName = matchAccount ? null : data.patient_name.toLowerCase();
      const key = matchAccount ? `account\u0000${matchAccount}` : `name\u0000${matchName}`;
      const first = firstRowByPatient.get(key);
      if (!first) {
        firstRowByPatient.set(key, rowNumber);
        return { rowNumber, outcome: 'valid', data, matchAccount, matchName };
      }
      errors.push({
        field: matchAccount ? 'account_number' : 'patient_name',
        message: `Same patient as row ${first} in this file.`,
      });
    }
    return { rowNumber, outcome: 'invalid', data: rawAsText(raw), errors };
  });
}

/**
 * Marks valid rows whose patient (identified as in validateRows) already has an
 * active statement in the clinic. The row points at the current version, which
 * publishing updates in place; if there are several, the most recently updated.
 */
export async function markDuplicates(db, clinicId, validated) {
  const valid = validated.filter((r) => r.outcome === 'valid');
  for (let i = 0; i < valid.length; i += 1000) {
    const chunk = valid.slice(i, i + 1000);
    const { rows } = await db.query(
      `SELECT s.id, s.account_number, lower(s.patient_name) AS name_key
         FROM statement s
        WHERE s.clinic_id = $1 AND s.status = 'active'
          AND NOT EXISTS (SELECT 1 FROM statement n WHERE n.supersedes_id = s.id)
          AND (s.account_number = ANY($2::text[]) OR lower(s.patient_name) = ANY($3::text[]))
        ORDER BY s.updated_at DESC, s.created_at DESC`,
      [clinicId, chunk.map((r) => r.matchAccount).filter(Boolean), chunk.map((r) => r.matchName).filter(Boolean)],
    );
    const byAccount = new Map();
    const byName = new Map();
    for (const r of rows) {
      if (!byAccount.has(r.account_number)) byAccount.set(r.account_number, r.id);
      if (!byName.has(r.name_key)) byName.set(r.name_key, r.id);
    }
    for (const row of chunk) {
      const id = row.matchAccount ? byAccount.get(row.matchAccount) : byName.get(row.matchName);
      if (id) {
        row.outcome = 'duplicate';
        row.duplicateOf = id;
        row.duplicateDecision = 'update';
      }
    }
  }
  return validated;
}

