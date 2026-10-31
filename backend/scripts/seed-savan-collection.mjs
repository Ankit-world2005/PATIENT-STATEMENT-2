import { query } from '../src/db/pool.js';
import { parseCollectionExcel } from '../src/services/collection-parser.js';

const savanRawCsv = `Payer,Payment Method,Payment Reference,Posted Date,Bank Date,Created By,Payment Amount,Total Posted,Unposted,Recoupment,Remarks
Meyerland Collection Report - Till September 2026,,,,PROMPT POSTING SUMMARY,
Particular,Amount,,,Payment Type,Amount
CHECK AMOUNT(INSURANCE PAYMENT),0,,,Insurance Payment,0
PATIENT PAYMENT(Deductible),0,,,Recoupment Offset,0
Total,0,,,Deductible,0
,,,,Coinsurance,0
,,,,Copay,0
,,,,Grand Total,0
Patient Name,Prompt Claim Number,Date of Service,Reference Number,Remittance Bank Date,Remittance Payment Date,Submitted Amount,Allowed Amount,Paid Amount,Adjusted Amount,Transferred to Secondary,Transferred to Patient,Patient Paid,PR Type`;

async function seed() {
  const clinicRes = await query(
    `SELECT id, name FROM clinic WHERE lower(name) LIKE '%savan%' LIMIT 1`
  );

  if (!clinicRes.rows[0]) {
    console.error('Savan Enterprises clinic not found in database!');
    process.exit(1);
  }

  const clinic = clinicRes.rows[0];
  console.log('Found clinic:', clinic.name, clinic.id);

  const parsed = await parseCollectionExcel(Buffer.from(savanRawCsv));

  // Check if already exists for this clinic and month
  const existing = await query(
    `SELECT id FROM clinic_collection WHERE clinic_id = $1 AND month_year = $2`,
    [clinic.id, parsed.monthYear]
  );

  let recordId = '';
  if (existing.rows.length > 0) {
    recordId = existing.rows[0].id;
    await query(
      `UPDATE clinic_collection
          SET report_title = $1,
              summary = $2,
              check_sheet = $3,
              line_items = $4,
              updated_at = now()
        WHERE id = $5`,
      [
        parsed.reportTitle,
        JSON.stringify({
          particulars: parsed.particulars,
          promptPosting: parsed.promptPosting,
          locationSummary: parsed.locationSummary,
        }),
        JSON.stringify(parsed.checkRows),
        JSON.stringify(parsed.lineItems),
        recordId,
      ]
    );
    console.log('Updated existing Savan collection report record:', recordId);
  } else {
    const insertRes = await query(
      `INSERT INTO clinic_collection (
         clinic_id, report_title, month_year, summary, check_sheet, line_items, uploaded_by_id
       ) VALUES ($1, $2, $3, $4, $5, $6, NULL) RETURNING id`,
      [
        clinic.id,
        parsed.reportTitle,
        parsed.monthYear,
        JSON.stringify({
          particulars: parsed.particulars,
          promptPosting: parsed.promptPosting,
          locationSummary: parsed.locationSummary,
        }),
        JSON.stringify(parsed.checkRows),
        JSON.stringify(parsed.lineItems),
      ]
    );
    recordId = insertRes.rows[0].id;
    console.log('Successfully seeded Savan Enterprises collection report! ID:', recordId);
  }

  console.log('Summary:', {
    reportTitle: parsed.reportTitle,
    particulars: parsed.particulars,
    promptPosting: parsed.promptPosting,
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

