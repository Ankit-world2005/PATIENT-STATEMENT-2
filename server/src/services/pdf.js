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
  const meta = [
    ['Patient', statement.patient_name],
    ['Date of birth', usDate(statement.patient_dob)],
    ['Dates of service',
      statement.service_date_from ? `${usDate(statement.service_date_from)} - ${usDate(statement.service_date_to)}` : '-'],
    ['Insurance', statement.insurance_name || 'Self-pay'],
  ];
  meta.forEach(([label, value], i) => {
    const x = i % 2 === 0 ? left : 320;
    const yy = y - Math.floor(i / 2) * 34;
    text(label.toUpperCase(), x, yy, { f: bold, size: 7.5, color: MUTED });
    text(value, x, yy - 13, { size: 11 });
  });
  y -= 78;

  // Procedure codes
  text('PROCEDURE (CPT) CODES', left, y, { f: bold, size: 7.5, color: MUTED });
  y -= 14;
  const codes = statement.cpt_codes?.length ? statement.cpt_codes.join('   ') : 'None listed';
  text(codes, left, y, { size: 10.5 });
  y -= 28;

  // Financial summary
  rule(y);
  y -= 20;
  const lines = [
    ['Total billed charges', money(statement.billed_amount)],
    ['Insurance payments', statement.insurance_paid == null ? '-' : `-${money(statement.insurance_paid)}`],
    ['Adjustments', money(statement.adjustments)],
  ];
  for (const [label, value] of lines) {
    text(label, 330, y, { color: MUTED });
    textRight(value, right, y);
    y -= 18;
  }
  page.drawLine({ start: { x: 330, y: y + 8 }, end: { x: right, y: y + 8 }, thickness: 1.5, color: INK });
  y -= 8;
  text('Patient balance due', 330, y, { f: bold, size: 12, color: TEAL });
  textRight(money(statement.balance_due), right, y, { f: bold, size: 12, color: TEAL });
  y -= 40;

  rule(y);
  y -= 18;
  text('Please pay within 30 days of the statement date. For questions about this statement or your insurance', left, y, { size: 9, color: MUTED });
  y -= 12;
  text(`coverage, contact ${clinic.name} at ${clinic.contact_phone}.`, left, y, { size: 9, color: MUTED });

  text('Confidential: contains protected health information.', left, 40, { size: 8, color: MUTED });
  textRight('My Patient | US24 Solutions', right, 40, { size: 8, color: MUTED });

  return Buffer.from(await doc.save());
}
