// Writes to the statement table shared by single upload and bulk import.

const COLUMNS = [
  'clinic_id', 'patient_name', 'account_number', 'statement_date', 'balance_due', 'patient_dob',
  'service_date_from', 'service_date_to', 'cpt_codes', 'billed_amount', 'insurance_paid', 'adjustments',
  'insurance_name', 'source', 'import_batch_id', 'import_row_number', 'version', 'supersedes_id', 'uploaded_by_id',
  'location_name', 'cycle1_date', 'cycle1_balance', 'cycle1_payment',
  'cycle2_date', 'cycle2_balance', 'cycle2_payment',
  'cycle3_date', 'cycle3_balance', 'cycle3_payment',
  'current_balance', 'pr_type', 'status', 'ledger_status', 'us24_notes', 'client_response', 'vob_notes',
];
const CASTS = {
  cpt_codes: '::varchar(10)[]',
  statement_date: '::date',
  patient_dob: '::date',
  service_date_from: '::date',
  service_date_to: '::date',
  cycle1_date: '::date',
  cycle2_date: '::date',
  cycle3_date: '::date',
};

/** Bulk-inserts statements. Each item has the COLUMNS keys. Returns [{ id, import_row_number }] in insert order. */
export async function insertStatements(db, items) {
  const out = [];
  for (let i = 0; i < items.length; i += 500) {
    const chunk = items.slice(i, i + 500);
    const params = [];
    const tuples = chunk.map((item) => {
      const placeholders = COLUMNS.map((col) => {
        let v = item[col];
        if (col === 'status') {
          // Keep PostgreSQL database constraint valid ('active' vs 'withdrawn')
          v = 'active';
        } else if (col === 'ledger_status') {
          v = item.status || item.ledger_status || 'Active';
        } else if (col === 'us24_notes') {
          v = item.us24_notes || item.remarks || null;
        }
        params.push(col === 'cpt_codes' && Array.isArray(v) && v.length === 0 ? null : v ?? null);
        return `$${params.length}${CASTS[col] ?? ''}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    const { rows } = await db.query(
      `INSERT INTO statement (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')} RETURNING id, import_row_number`,
      params,
    );
    out.push(...rows);
  }
  return out;
}

/**
 * Finds and locks the newest version in the chain that starts at statementId,
 * so a new version always supersedes the current head (schema T6).
 */
export async function lockChainHead(db, statementId) {
  let { rows } = await db.query('SELECT id, version, status FROM statement WHERE id = $1 FOR UPDATE', [statementId]);
  let head = rows[0];
  for (;;) {
    ({ rows } = await db.query('SELECT id, version, status FROM statement WHERE supersedes_id = $1 FOR UPDATE', [head.id]));
    if (!rows[0]) return head;
    head = rows[0];
  }
}

/** Active statement with the same clinic, account number and statement date, newest version first. */
export async function findDuplicate(db, clinicId, accountNumber, statementDate) {
  const { rows } = await db.query(
    `SELECT id, version, patient_name, balance_due, uploaded_at FROM statement
      WHERE clinic_id = $1 AND account_number = $2 AND statement_date = $3 AND status = 'active'
      ORDER BY version DESC LIMIT 1`,
    [clinicId, accountNumber, statementDate],
  );
  return rows[0] ?? null;
}

/**
 * Adds a remark and maintains the derived flags in one locked step (schema T8).
 * A clinic remark starts "awaiting reply"; any specialist remark clears it (FR-11.7).
 */
export async function insertRemark(db, { statementId, author, type, body, insuranceName, insuranceReference, attachments = [] }) {
  const { rows } = await db.query(
    `INSERT INTO remark (statement_id, author_id, author_role, type, body, insurance_name, insurance_reference, attachments)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at, attachments`,
    [statementId, author.id, author.role, type, body, insuranceName ?? null, insuranceReference ?? null, JSON.stringify(attachments || [])],
  );
  const remark = rows[0];
  await db.query(
    `UPDATE statement
        SET last_remark_at = $2::timestamptz,
            awaiting_reply_since = CASE
              WHEN $3::text = 'clinic' THEN COALESCE(awaiting_reply_since, $2::timestamptz)
              ELSE NULL END,
            us24_notes = CASE WHEN $3::text = 'specialist' THEN $4::text ELSE us24_notes END,
            client_response = CASE WHEN $3::text = 'clinic' THEN $4::text ELSE client_response END,
            vob_notes = CASE WHEN $3::text = 'insurance' THEN $4::text ELSE vob_notes END
      WHERE id = $1`,
    [statementId, remark.created_at, type, body],
  );
  return remark;
}

/** Recomputes last_remark_at and awaiting_reply_since from the remark log (schema section 12). */
export async function rebuildStatementFlags(db) {
  await db.query(`
    UPDATE statement s
       SET last_remark_at = r.last_at,
           awaiting_reply_since = r.awaiting
      FROM (
        SELECT st.id,
               max(rm.created_at) AS last_at,
               min(rm.created_at) FILTER (
                 WHERE rm.type = 'clinic'
                   AND rm.created_at > COALESCE(
                     (SELECT max(x.created_at) FROM remark x
                       WHERE x.statement_id = st.id AND x.author_role = 'specialist'), '-infinity')
               ) AS awaiting
          FROM statement st
          LEFT JOIN remark rm ON rm.statement_id = st.id
         GROUP BY st.id
      ) r
     WHERE r.id = s.id
       AND (s.last_remark_at IS DISTINCT FROM r.last_at OR s.awaiting_reply_since IS DISTINCT FROM r.awaiting)`);
}

/** Updates an existing active statement in place with new ledger and cycle data. */
export async function updateStatement(db, statementId, item) {
  const ledgerStatus = item.status || item.ledger_status || null;
  const us24Notes = item.us24_notes || item.remarks || null;
  const cptCodes = Array.isArray(item.cpt_codes) && item.cpt_codes.length > 0 ? item.cpt_codes : null;

  await db.query(
    `UPDATE statement
        SET statement_date = COALESCE($2::date, statement_date),
            balance_due = COALESCE($3::numeric, balance_due),
            patient_name = COALESCE($4::varchar, patient_name),
            patient_dob = COALESCE($5::date, patient_dob),
            service_date_from = COALESCE($6::date, service_date_from),
            service_date_to = COALESCE($7::date, service_date_to),
            cpt_codes = COALESCE($8::varchar(10)[], cpt_codes),
            billed_amount = COALESCE($9::numeric, billed_amount),
            insurance_paid = COALESCE($10::numeric, insurance_paid),
            adjustments = COALESCE($11::numeric, adjustments),
            insurance_name = COALESCE($12::varchar, insurance_name),
            location_name = COALESCE($13::varchar, location_name),
            cycle1_date = COALESCE($14::date, cycle1_date),
            cycle1_balance = COALESCE($15::numeric, cycle1_balance),
            cycle1_payment = COALESCE($16::numeric, cycle1_payment),
            cycle2_date = COALESCE($17::date, cycle2_date),
            cycle2_balance = COALESCE($18::numeric, cycle2_balance),
            cycle2_payment = COALESCE($19::numeric, cycle2_payment),
            cycle3_date = COALESCE($20::date, cycle3_date),
            cycle3_balance = COALESCE($21::numeric, cycle3_balance),
            cycle3_payment = COALESCE($22::numeric, cycle3_payment),
            current_balance = COALESCE($23::numeric, current_balance),
            pr_type = COALESCE($24::varchar, pr_type),
            ledger_status = COALESCE($25::varchar, ledger_status),
            us24_notes = COALESCE($26::text, us24_notes),
            client_response = COALESCE($27::text, client_response),
            vob_notes = COALESCE($28::text, vob_notes),
            updated_at = now()
      WHERE id = $1`,
    [
      statementId,
      item.statement_date ?? null,
      item.balance_due ?? null,
      item.patient_name ?? null,
      item.patient_dob ?? null,
      item.service_date_from ?? null,
      item.service_date_to ?? null,
      cptCodes,
      item.billed_amount ?? null,
      item.insurance_paid ?? null,
      item.adjustments ?? null,
      item.insurance_name ?? null,
      item.location_name ?? null,
      item.cycle1_date ?? null,
      item.cycle1_balance ?? null,
      item.cycle1_payment ?? null,
      item.cycle2_date ?? null,
      item.cycle2_balance ?? null,
      item.cycle2_payment ?? null,
      item.cycle3_date ?? null,
      item.cycle3_balance ?? null,
      item.cycle3_payment ?? null,
      item.current_balance ?? null,
      item.pr_type ?? null,
      ledgerStatus,
      us24Notes,
      item.client_response ?? null,
      item.vob_notes ?? null,
    ],
  );
}

