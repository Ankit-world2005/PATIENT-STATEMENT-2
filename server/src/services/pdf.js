import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/** Confirms an upload is a real, readable, unencrypted PDF (TRD 5.4). Returns an error message or null. */
export async function checkUploadedPdf(buffer) {
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return 'Upload a PDF file up to 10 MB.';
  }
  try {
    const doc = await PDFDocument.load(buffer, { updateMetadata: false });
    if (doc.getPageCount() < 1) return "This PDF can't be read or is password-protected.";
  } catch {
    // pdf-lib throws for encrypted files unless told to ignore encryption.
    return "This PDF can't be read or is password-protected.";
  }
  return null;
}

// The standard fonts only cover Windows-1252; replace anything else so a name
// with unsupported characters can't break the download.
const printable = (s) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');

const money = (v) => {
  if (v === null || v === undefined) return '-';
  const n = Number(v);
  const s = `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${s} (credit)` : s;
};

const usDate = (iso) => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${m}/${d}/${y}`;
};

const INK = rgb(0.11, 0.14, 0.19);
const MUTED = rgb(0.27, 0.32, 0.39);
const TEAL = rgb(0.05, 0.36, 0.39);
const RULE = rgb(0.87, 0.85, 0.81);

/** Standard statement layout for imported statements (FR-7.8). Returns a PDF buffer. */
export async function renderStatementPdf(statement, clinic) {
  const doc = await PDFDocument.create();
  doc.setTitle('Patient Statement');
  doc.setAuthor('US24 Solutions');
  doc.setCreator('My Patient');
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = 54;
  const right = 558;
  let y = 738;

  const text = (s, x, yy, { f = font, size = 10, color = INK } = {}) =>
    page.drawText(printable(s), { x, y: yy, size, font: f, color });
  const textRight = (s, x, yy, opts = {}) => {
    const f = opts.f ?? font;
    const size = opts.size ?? 10;
    text(s, x - f.widthOfTextAtSize(printable(s), size), yy, opts);
  };
  const rule = (yy, thickness = 0.75, color = RULE) =>
    page.drawLine({ start: { x: left, y: yy }, end: { x: right, y: yy }, thickness, color });

  // Letterhead
  text(clinic.name, left, y, { f: bold, size: 15 });
  textRight('PATIENT STATEMENT', right, y, { f: bold, size: 15, color: TEAL });
  y -= 16;
  const address = [clinic.address_line1, clinic.address_line2].filter(Boolean).join(', ');
  text(address, left, y, { size: 9, color: MUTED });
  textRight(`Statement date: ${usDate(statement.statement_date)}`, right, y, { size: 9, color: MUTED });
  y -= 12;
  text(`${clinic.city}, ${clinic.state} ${clinic.postal_code}  |  ${clinic.contact_phone}`, left, y, { size: 9, color: MUTED });
  textRight(`Account: ${statement.account_number}`, right, y, { size: 9, color: MUTED });
  y -= 12;
  text('Billing administered by US24 Solutions', left, y, { size: 9, color: TEAL });
  if (statement.version > 1) textRight(`Version ${statement.version}`, right, y, { size: 9, color: MUTED });
  y -= 14;
  rule(y, 1.5, INK);
  y -= 26;

  // Patient and coverage
  const locationDisplay = statement.location_name || statement.locationName || clinic.name;
  const currentBal = statement.current_balance ?? statement.currentBalance ?? statement.balance_due;
  const meta = [
    ['Patient Name', statement.patient_name],
    ['Location', locationDisplay],
    ['PR Type', statement.pr_type || statement.prType || 'Patient'],
    ['Status', statement.ledger_status || statement.status || 'Active'],
    ['Date of birth', usDate(statement.patient_dob)],
    ['Insurance', statement.insurance_name || 'Self-pay'],
    ['Dates of service',
      statement.service_date_from ? `${usDate(statement.service_date_from)} - ${usDate(statement.service_date_to)}` : '-'],
    ['Current Outstanding Balance', money(currentBal)],
  ];
  meta.forEach(([label, value], i) => {
    const x = i % 2 === 0 ? left : 320;
    const yy = y - Math.floor(i / 2) * 28;
    text(label.toUpperCase(), x, yy, { f: bold, size: 7, color: MUTED });
    text(printable(value), x, yy - 11, { size: 9.5 });
  });
  y -= 4 * 28 + 6;

  // Multi-cycle billing history table
  const hasCycles = statement.cycle1_date || statement.cycle2_date || statement.cycle3_date;
  if (hasCycles) {
    rule(y);
    y -= 14;
    text('ELECTRONIC STATEMENT HISTORY & CYCLE BALANCES', left, y, { f: bold, size: 7.5, color: MUTED });
    y -= 14;

    // Header
    text('Statement Cycle', left, y, { f: bold, size: 8, color: MUTED });
    text('Sent Date', 200, y, { f: bold, size: 8, color: MUTED });
    text('Balance Due', 320, y, { f: bold, size: 8, color: MUTED });
    text('Payment Received', 440, y, { f: bold, size: 8, color: MUTED });
    y -= 6;
    rule(y, 0.5);
    y -= 12;

    const cycles = [
      ['1st Electronic Statement', statement.cycle1_date || statement.statement_date, statement.cycle1_balance ?? statement.balance_due, statement.cycle1_payment],
      ['2nd Electronic Statement', statement.cycle2_date, statement.cycle2_balance, statement.cycle2_payment],
      ['3rd Electronic Statement', statement.cycle3_date, statement.cycle3_balance, statement.cycle3_payment],
    ];

    for (const [cycleName, cDate, cBal, cPay] of cycles) {
      text(cycleName, left, y, { size: 9 });
      text(usDate(cDate), 200, y, { size: 9 });
      text(money(cBal), 320, y, { size: 9 });
      text(cPay ? printable(cPay) : '$0.00', 440, y, { size: 9, color: TEAL });
      y -= 14;
    }
    rule(y, 0.5);
    y -= 12;
    text('Current Outstanding Balance', left, y, { f: bold, size: 9 });
    textRight(money(currentBal), right, y, { f: bold, size: 11, color: TEAL });
    y -= 16;
  }

  // Procedure codes (if present)
  if (statement.cpt_codes?.length) {
    rule(y);
    y -= 14;
    text('PROCEDURE (CPT) CODES', left, y, { f: bold, size: 7.5, color: MUTED });
    y -= 12;
    text(statement.cpt_codes.join('   '), left, y, { size: 9.5 });
    y -= 16;
  }

  // Financial summary (if billed charges exist)
  if (statement.billed_amount != null) {
    rule(y);
    y -= 16;
    const lines = [
      ['Total billed charges', money(statement.billed_amount)],
      ['Insurance payments', statement.insurance_paid == null ? '-' : `-${money(statement.insurance_paid)}`],
      ['Adjustments', money(statement.adjustments)],
    ];
    for (const [label, value] of lines) {
      text(label, 330, y, { color: MUTED });
      textRight(value, right, y);
      y -= 14;
    }
    page.drawLine({ start: { x: 330, y: y + 6 }, end: { x: right, y: y + 6 }, thickness: 1.5, color: INK });
    y -= 8;
    text('Patient balance due', 330, y, { f: bold, size: 10, color: TEAL });
    textRight(money(statement.balance_due), right, y, { f: bold, size: 10, color: TEAL });
    y -= 20;
  }

  // Statement Remarks & Ledger Notes
  const us24Remark = statement.remarks || statement.us24_notes || statement.us24Notes;
  const clientRemark = statement.client_response || statement.clientResponse;
  const vobRemark = statement.vob_notes || statement.vobNotes;
  const hasRemarks = us24Remark || clientRemark || vobRemark;

  if (hasRemarks) {
    rule(y);
    y -= 14;
    text('STATEMENT REMARKS & LEDGER NOTES', left, y, { f: bold, size: 7.5, color: MUTED });
    y -= 14;

    if (us24Remark) {
      text('US24 Specialist Remarks / Notes:', left, y, { f: bold, size: 8, color: TEAL });
      y -= 10;
      text(printable(us24Remark).slice(0, 110), left, y, { size: 8.5 });
      y -= 12;
    }
    if (clientRemark) {
      text('Client Response:', left, y, { f: bold, size: 8, color: rgb(0.08, 0.5, 0.24) });
      y -= 10;
      text(printable(clientRemark).slice(0, 110), left, y, { size: 8.5 });
      y -= 12;
    }
    if (vobRemark) {
      text('AS PER VOB- Notes:', left, y, { f: bold, size: 8, color: rgb(0.7, 0.4, 0.05) });
      y -= 10;
      text(printable(vobRemark).slice(0, 110), left, y, { size: 8.5 });
      y -= 14;
    }
  }

  rule(y);
  y -= 16;
  text('Please pay within 30 days of the statement date. For questions about this statement or your insurance', left, y, { size: 8.5, color: MUTED });
  y -= 10;
  text(`coverage, contact ${clinic.name} at ${clinic.contact_phone}.`, left, y, { size: 8.5, color: MUTED });

  text('Confidential: contains protected health information.', left, 35, { size: 7.5, color: MUTED });
  textRight('My Patient | US24 Solutions', right, 35, { size: 7.5, color: MUTED });

  return Buffer.from(await doc.save());
}
