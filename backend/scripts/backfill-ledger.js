import { pool } from '../src/db/pool.js';

async function backfill() {
  console.log('[backfill] Starting ledger fields backfill...');

  // Update location and basic cycles from clinic & statement
  await pool.query(`
    UPDATE statement s
       SET location_name = COALESCE(s.location_name, c.name),
           cycle1_date = COALESCE(s.cycle1_date, s.statement_date),
           cycle1_balance = COALESCE(s.cycle1_balance, s.balance_due),
           cycle1_payment = COALESCE(s.cycle1_payment, 0.00),
           current_balance = COALESCE(s.current_balance, s.balance_due),
           pr_type = COALESCE(s.pr_type, 'Copay')
      FROM clinic c
     WHERE c.id = s.clinic_id
  `);

  // Update remarks into notes
  await pool.query(`
    UPDATE statement s
       SET us24_notes = COALESCE(s.us24_notes, (
             SELECT r.body FROM remark r WHERE r.statement_id = s.id AND r.type = 'specialist'
             ORDER BY r.created_at DESC, r.id DESC LIMIT 1
           )),
           client_response = COALESCE(s.client_response, (
             SELECT r.body FROM remark r WHERE r.statement_id = s.id AND r.type = 'clinic'
             ORDER BY r.created_at DESC, r.id DESC LIMIT 1
           )),
           vob_notes = COALESCE(s.vob_notes, (
             SELECT r.body FROM remark r WHERE r.statement_id = s.id AND r.type = 'insurance'
             ORDER BY r.created_at DESC, r.id DESC LIMIT 1
           ))
  `);

  // Specific patient data enhancements for multi-cycle demonstration
  await pool.query(`
    -- Elena Garcia (2 cycles: 1st July paid in full, 2nd Oct active)
    UPDATE statement
       SET cycle1_date = '2026-07-18', cycle1_balance = 145.00, cycle1_payment = 145.00,
           cycle2_date = '2026-10-14', cycle2_balance = 420.00, cycle2_payment = 0.00,
           current_balance = 420.00, pr_type = 'Deductible'
     WHERE patient_name = 'Elena Garcia' AND statement_date = '2026-10-14';

    UPDATE statement
       SET cycle1_date = '2026-07-18', cycle1_balance = 145.00, cycle1_payment = 145.00,
           current_balance = 0.00, pr_type = 'Deductible'
     WHERE patient_name = 'Elena Garcia' AND statement_date = '2026-07-18';

    -- David K. Miller (Co-insurance)
    UPDATE statement
       SET pr_type = 'Co-insurance'
     WHERE patient_name = 'David K. Miller';

    -- Brenda Walsh (Deductible)
    UPDATE statement
       SET pr_type = 'Deductible'
     WHERE patient_name = 'Brenda Walsh';

    -- Samantha Reed (Co-insurance)
    UPDATE statement
       SET pr_type = 'Co-insurance'
     WHERE patient_name = 'Samantha Reed';

    -- Ethan Brooks (Self Pay)
    UPDATE statement
       SET pr_type = 'Self Pay'
     WHERE patient_name = 'Ethan Brooks';

    -- Liam Carter (Self Pay)
    UPDATE statement
       SET pr_type = 'Self Pay'
     WHERE patient_name = 'Liam Carter';

    -- Grace Holloway (Deductible)
    UPDATE statement
       SET pr_type = 'Deductible'
     WHERE patient_name = 'Grace Holloway';
  `);

  console.log('[backfill] Done!');
  await pool.end();
}

backfill().catch((err) => {
  console.error('[backfill] Error:', err);
  process.exit(1);
});
