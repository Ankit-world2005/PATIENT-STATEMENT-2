import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import {
  parseCsvRows,
  parseCollectionExcel,
  detectCollectionFormat,
  extractCellValue,
  parseNum,
} from '../src/services/collection-parser.js';

// User sample 1: Combined / Hybrid format
const COMBINED_CSV = `PROMPT + THERABILL SUMMARY,,,,THERABILL PAYMENT SUMMARY,,,,,,PROMPT PAYMENT SUMMARY,
Particular,Amount,,,Payment Type,Amount,,,,,Payment Type,Amount
CHECK AMOUNT(INSURANCE PAYMENT),15000,,,Check Amount,7000,,,,,Check Amount,8000
PATIENT PAYMENT(Deductible),2500,,,PATIENT PAYMENT(Deductible),1000,,,,,PATIENT PAYMENT(Deductible),1500
Total,17500,,,Grand Total,8000,,,,,Grand Total,9500
,,,,,,,,,,,
Therabill Posting Summary,,,,,,,Prompt Posting Summary,,,,
Location Wise Payment Info.,,,,,,,Location Wise Payment Info.,,,,
Type,Airpark,Tempe,Grand total,,,,Type,Airpark,Tempe,Grand total,
Insurance,4000,3000,7000,,,,Insurance,5000,3000,8000,
Recoupment,-100,0,-100,,,,Recoupment,-50,-50,-100,
Deductible,300,200,500,,,,Deductible,600,400,1000,
Coinsurance,200,100,300,,,,Coinsurance,300,200,500,
Copay,100,100,200,,,,Copay,0,0,0,
Self Pay,50,0,50,,,,Self Pay,0,0,0,
Grand Total,4550,3400,7950,,,,Grand Total,5850,3550,9400,
Clinic,Payer,EOB Source,Method,ERA/EOB,Check no,Check Date,Check Amount,Posted Amount,Remaining Amount,Recoupment,Status,Posted date,Locations,Remarks
West AZ,Aetna,Availity,EFT,ERA-1,CHK101,09/01/2026,7000,7000,0,0,Posted,09/02/2026,Airpark,Verified
"Client Name (Last, First)",Payer name,Check #,Check date,DOS,Service code,Charge for Service,Pmt Type,Pmt Amount,Deposit date,Facility Name,Locations
"Doe, John",BCBS,CHK101,09/01/2026,08/20/2026,97110,150,Copay,30,09/02/2026,Airpark Facility,Airpark
Payer,Payment Method,Payment Reference,Payment Date,Bank Date,Payment Amount,Total Posted,Unposted,Recoupment,Location,Remarks
UnitedHealthcare,EFT,UHC888,09/04/2026,09/04/2026,8000,8000,0,0,Tempe,Reconciled
Patient Name,Date of Service,Visit Facility,Reference Number,Remittance Bank Date,Remittance Payment Date,Submitted Amount,Paid Amount,Adjusted Amount,Transferred to Secondary,Transferred to Patient,Patient paid,PR Type
Jane Smith,08/22/2026,Tempe Facility,UHC888,09/04/2026,09/04/2026,200,120,40,0,40,40,Deductible`;

// User sample 2: Standalone Prompt format
const PROMPT_CSV = `West AZ Collection Report - September 2026,,,PROMPT POSTING SUMMARY,
Particular,Amount,,Payment Type,Amount
CHECK AMOUNT(INSURANCE PAYMENT),12500,,Insurance Payment,12500
PATIENT PAYMENT(Deductible),1800,,Recoupment Offset,-200
Total,14300,,Deductible,800
,,,Coinsurance,600
,,,Copay,400
,,,Grand Total,14100
Payer,Payment Method,Payment Reference,Payment Date,Bank Date,Payment Amount,Total Posted,Unposted,Recoupment,Location,Remarks
BCBS AZ,EFT,EFT-991,09/03/2026,09/03/2026,12500,12500,0,0,Airpark,OK
Patient Name,Date of Service,Reference Number,Bank Date,Payment Date,Charged Amount,Allowed Amount,Insurance Payment,Adjusted Amount,Transferred to Secondary,Transferred to Patient,Patient Paid,PR Type,Location
Alice Brown,08/15/2026,EFT-991,09/03/2026,09/03/2026,300,210,150,50,0,40,40,Copay,Airpark`;

// User sample 3: Standalone Therabill format
const THERABILL_CSV = `Therabill - Icure,,,,,Payment Type,Pmt Amount
Collection Report - September 2026,,,,,Insurance,22463.86
Particular,Amount,,,,Recoupment,-141.02
Insurance Payment,22463.86,,,,Deductible,310
"Patient Payment(PR 1,2,3)",2473.94,,,,Coinsurance,749.7
Total,24937.8,,,,Copay,1414.24
,,,,,Self Pay,630
,,,,,Grand Total,25426.78
"Client Name (Last, First)",Payer name,Check #,Check date,DOS,Service code,Charge for Service,Pmt Type,Pmt Amount,Deposit date,Facility Name
"Smith, Bob",Cigna,CHK772,09/05/2026,08/29/2026,97140,180,Copay,25,09/06/2026,Tempe Clinic
Payee,Payer,EOB Source,ERA/EOB,Method,Check no,Check Date,Check Amount,Posted Amount,Remaining Amount,Recoupment,Status,Posted date,Remarks
Icure,Cigna,OfficeAlly,ERA-99,EFT,CHK772,09/05/2026,22463.86,22463.86,0,141.02,Posted,09/06/2026,Verified`;

test('detectCollectionFormat correctly detects all 3 formats', () => {
  const combinedGrid = parseCsvRows(COMBINED_CSV);
  assert.equal(detectCollectionFormat(combinedGrid), 'combined');

  const promptGrid = parseCsvRows(PROMPT_CSV);
  assert.equal(detectCollectionFormat(promptGrid), 'prompt');

  const therabillGrid = parseCsvRows(THERABILL_CSV);
  assert.equal(detectCollectionFormat(therabillGrid), 'therabill');
});

test('parseCollectionExcel parses standalone Prompt format properly', async () => {
  const result = await parseCollectionExcel(Buffer.from(PROMPT_CSV));
  assert.equal(result.detectedFormat, 'prompt');
  assert.equal(result.particulars.checkAmount, 12500);
  assert.equal(result.particulars.patientPayment, 1800);
  assert.equal(result.particulars.total, 14300);
  assert.equal(result.checkRows.length, 1);
  assert.equal(result.checkRows[0].payer, 'BCBS AZ');
  assert.equal(result.checkRows[0].paymentAmount, 12500);
  assert.equal(result.checkRows[0].sourceSystem, 'Prompt');
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0].patientName, 'Alice Brown');
  assert.equal(result.lineItems[0].prType, 'Copay');
  assert.equal(result.lineItems[0].sourceSystem, 'Prompt');
});

test('parseCollectionExcel parses standalone Therabill format properly', async () => {
  const result = await parseCollectionExcel(Buffer.from(THERABILL_CSV));
  assert.equal(result.detectedFormat, 'therabill');
  assert.equal(result.particulars.checkAmount, 22463.86);
  assert.equal(result.particulars.patientPayment, 2473.94);
  assert.equal(result.particulars.total, 24937.8);
  assert.equal(result.promptPosting.insurancePayment, 22463.86);
  assert.equal(result.promptPosting.copay, 1414.24);
  assert.equal(result.promptPosting.selfPay, 630);
  assert.equal(result.checkRows.length, 1);
  assert.equal(result.checkRows[0].payer, 'Cigna');
  assert.equal(result.checkRows[0].paymentReference, 'CHK772');
  assert.equal(result.checkRows[0].sourceSystem, 'Therabill');
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0].patientName, 'Smith, Bob');
  assert.equal(result.lineItems[0].patientPaid, 25);
  assert.equal(result.lineItems[0].sourceSystem, 'Therabill');
});

test('parseCollectionExcel parses Combined Therabill + Prompt hybrid format properly', async () => {
  const result = await parseCollectionExcel(Buffer.from(COMBINED_CSV));
  assert.equal(result.detectedFormat, 'combined');
  assert.equal(result.particulars.checkAmount, 15000);
  assert.equal(result.particulars.patientPayment, 2500);
  assert.equal(result.particulars.total, 17500);
  // Reconciled checks contains both Prompt and Therabill checks
  assert.equal(result.checkRows.length, 2);
  const therabillCheck = result.checkRows.find(c => c.sourceSystem === 'Therabill');
  const promptCheck = result.checkRows.find(c => c.sourceSystem === 'Prompt');
  assert.ok(therabillCheck);
  assert.ok(promptCheck);
  assert.equal(therabillCheck.payer, 'Aetna');
  assert.equal(promptCheck.payer, 'UnitedHealthcare');

  // Reconciled line items contains both
  assert.equal(result.lineItems.length, 2);
  const therabillItem = result.lineItems.find(l => l.sourceSystem === 'Therabill');
  const promptItem = result.lineItems.find(l => l.sourceSystem === 'Prompt');
  assert.ok(therabillItem);
  assert.ok(promptItem);
  assert.equal(therabillItem.patientName, 'Doe, John');
  assert.equal(promptItem.patientName, 'Jane Smith');

  // Location breakdown
  assert.ok(result.locationSummary);
  assert.ok(result.locationSummary.locations.includes('Airpark'));
  assert.ok(result.locationSummary.locations.includes('Tempe'));
});

test('parseCollectionExcel round-trips generated multi-sheet Excel workbook', async () => {
  const { generateCollectionExcel } = await import('../src/services/collection-exporter.js');
  const buffer = await generateCollectionExcel({
    reportTitle: 'West AZ Collection Report - September 2026',
    particulars: { checkAmount: 12500, patientPayment: 1800, total: 14300 },
    promptPosting: { insurancePayment: 12500, recoupmentOffset: -200, deductible: 800, coinsurance: 600, copay: 400, grandTotal: 14100 },
    checkRows: [{
      payer: 'BCBS AZ',
      paymentMethod: 'EFT',
      paymentReference: 'EFT-991',
      paymentDate: '09/03/2026',
      bankDate: '09/03/2026',
      paymentAmount: 12500,
      totalPosted: 12500,
      unposted: 0,
      recoupment: 0,
      location: 'Airpark',
      remarks: 'Verified'
    }],
    lineItems: [{
      patientName: 'Alice Brown',
      dateOfService: '08/15/2026',
      referenceNumber: 'EFT-991',
      bankDate: '09/03/2026',
      paymentDate: '09/03/2026',
      chargedAmount: 300,
      allowedAmount: 210,
      insurancePayment: 150,
      adjustedAmount: 50,
      transferredToSecondary: 0,
      transferredToPatient: 40,
      patientPaid: 40,
      prType: 'Copay',
      location: 'Airpark'
    }]
  });

  const result = await parseCollectionExcel(buffer);
  assert.ok(result);
  assert.equal(result.detectedFormat, 'prompt');
  assert.equal(result.particulars.checkAmount, 12500);
  assert.equal(result.particulars.patientPayment, 1800);
  assert.equal(result.particulars.total, 14300);
  assert.equal(result.checkRows.length, 1);
  assert.equal(result.checkRows[0].payer, 'BCBS AZ');
  assert.equal(result.checkRows[0].sourceSystem, 'Prompt');
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0].patientName, 'Alice Brown');
  assert.equal(result.lineItems[0].sourceSystem, 'Prompt');
});

test('extractCellValue and parseNum handle formula cells and accounting formatting', () => {
  const formulaCell = { formula: 'SUM(C5:C6)', result: 9809.68 };
  assert.equal(extractCellValue(formulaCell), 9809.68);
  assert.equal(parseNum(formulaCell), 9809.68);

  const richTextCell = { richText: [{ text: 'Prompt ' }, { text: 'Posting' }] };
  assert.equal(extractCellValue(richTextCell), 'Prompt Posting');

  // Accounting parentheses negative numbers
  assert.equal(parseNum('(159.25)'), -159.25);
  assert.equal(parseNum('($159.25)'), -159.25);
  assert.equal(parseNum('-$159.25'), -159.25);
  assert.equal(parseNum('$-159.25'), -159.25);
});

test('parseCollectionExcel handles multi-sheet workbook with Check Sheet, Lineitem and formula totals', async () => {
  const wb = new ExcelJS.Workbook();

  const wsSummary = wb.addWorksheet('Summary');
  wsSummary.addRow(['', 'Meyerland Collection Report - Till September 2026']);
  wsSummary.addRow(['', 'Particular', 'Amount']);
  wsSummary.addRow(['', 'CHECK AMOUNT(INSURANCE PAYMENT)', 9596.94]);
  wsSummary.addRow(['', 'PATIENT PAYMENT(Deductible)', 212.74]);
  wsSummary.addRow(['', 'Total', { formula: 'SUM(C3:C4)', result: 9809.68 }]);
  wsSummary.addRow([]);
  wsSummary.addRow(['', 'PROMPT POSTING SUMMARY']);
  wsSummary.addRow(['', 'Payment Type', 'Amount']);
  wsSummary.addRow(['', 'Insurance Payment', 9756.19]);
  wsSummary.addRow(['', 'Recoupment Offset', -159.25]);
  wsSummary.addRow(['', 'Deductible', 212.74]);
  wsSummary.addRow(['', 'Coinsurance', 0]);
  wsSummary.addRow(['', 'Copay', 580]);
  wsSummary.addRow(['', 'Grand Total', { formula: 'SUM(C9:C13)', result: 10389.68 }]);

  const wsCheck = wb.addWorksheet('Check Sheet');
  wsCheck.addRow(['Payer', 'Payment Method', 'Payment Reference', 'Posted Date', 'Bank Date', 'Created By', 'Payment Amount', 'Total Posted', 'Unposted', 'Recoupment', 'Remarks']);
  wsCheck.addRow(['BLUECROSS BLUESHIELD', 'CHK', 'CHK12345', '2026-09-01', '2026-09-01', 'System', 9596.94, 9596.94, 0, 0, 'OK']);

  const wsLine = wb.addWorksheet('Lineitem');
  wsLine.addRow(['Patient Name', 'Prompt Claim Number', 'Date of Service', 'Reference Number', 'Remittance Bank Date', 'Remittance Payment Date', 'Submitted Amount', 'Allowed Amount', 'Paid Amount', 'Adjusted Amount', 'Transferred to Secondary', 'Transferred to Patient', 'Patient Paid', 'PR Type']);
  wsLine.addRow(['John Doe', 'CLM-991', '2026-08-15', 'CHK12345', '2026-09-01', '2026-09-01', 500, 200, 150, 50, 0, 50, 50, 'Copay']);

  const buffer = await wb.xlsx.writeBuffer();
  const result = await parseCollectionExcel(buffer);

  assert.equal(result.detectedFormat, 'prompt');
  assert.equal(result.particulars.checkAmount, 9596.94);
  assert.equal(result.particulars.patientPayment, 212.74);
  assert.equal(result.particulars.total, 9809.68);
  assert.equal(result.promptPosting.insurancePayment, 9756.19);
  assert.equal(result.promptPosting.recoupmentOffset, -159.25);
  assert.equal(result.promptPosting.grandTotal, 10389.68);
  assert.equal(result.checkRows.length, 1);
  assert.equal(result.checkRows[0].payer, 'BLUECROSS BLUESHIELD');
  assert.equal(result.lineItems.length, 1);
  assert.equal(result.lineItems[0].patientName, 'John Doe');
  assert.equal(result.lineItems[0].claimNumber, 'CLM-991');
});

test('parseCollectionExcel falls back to automatic sums if totals are missing or 0', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Summary');
  ws.addRow(['Particular', 'Amount']);
  ws.addRow(['CHECK AMOUNT(INSURANCE PAYMENT)', 5000]);
  ws.addRow(['PATIENT PAYMENT(Deductible)', 500]);
  ws.addRow(['Total', 0]); // Zero in sheet
  ws.addRow(['Payment Type', 'Amount']);
  ws.addRow(['Insurance Payment', 5000]);
  ws.addRow(['Recoupment Offset', -100]);
  ws.addRow(['Deductible', 500]);
  ws.addRow(['Grand Total', 0]); // Zero in sheet

  const buffer = await wb.xlsx.writeBuffer();
  const result = await parseCollectionExcel(buffer);

  assert.equal(result.particulars.total, 5500); // 5000 + 500
  assert.equal(result.promptPosting.grandTotal, 5400); // 5000 - 100 + 500
});


test('parseCollectionExcel parses ICURE clinic Therabill format properly', async () => {
  const ICURE_CSV = `Icure,,,,,Payment Type,Payment Amount
Collection Report - October 2026,,,,,Insurance,12500.00
Particular,Amount,,,,Recoupment,-150.00
Insurance Payment,12500.00,,,,Deductible,450.00
"Patient Payment(PR 1,2,3)",1250.00,,,,Coinsurance,350.00
Total,13750.00,,,,Copay,450.00
,,,,,Self Pay,0
,,,,,Grand Total,13600.00
Payee,Payer,EOB Source,ERA/EOB,Method,Check no,Check Date,Check Amount,Posted Amount,Remaining Amount,Recoupment,Status,Posted date,Remarks,Location
Icure,Aetna,Availity,ERA,EFT,CHK-9812,10/12/2026,12500.00,12500.00,0.00,150.00,Posted,10/14/2026,Paid in full,Main Clinic
"Client Name (Last, First)",Payer name,Check #,Check date,DOS,Service code,Charge for Service,Pmt Type,Pmt Amount,Deposit date,Facility Name
"Smith, John",Aetna,CHK-9812,10/12/2026,10/01/2026,99214,150.00,Insurance,120.00,10/15/2026,Main Clinic
"Doe, Jane",Patient,,10/12/2026,10/02/2026,99213,100.00,Copay,25.00,10/15/2026,Main Clinic`;

  const grid = parseCsvRows(ICURE_CSV);
  assert.equal(detectCollectionFormat(grid), 'therabill');

  const result = await parseCollectionExcel(Buffer.from(ICURE_CSV));
  assert.equal(result.detectedFormat, 'therabill');
  assert.equal(result.monthYear, 'October 2026');
  assert.equal(result.particulars.checkAmount, 12500);
  assert.equal(result.particulars.patientPayment, 1250);
  assert.equal(result.particulars.total, 13750);
  assert.equal(result.promptPosting.insurancePayment, 12500);
  assert.equal(result.promptPosting.recoupmentOffset, -150);
  assert.equal(result.promptPosting.deductible, 450);
  assert.equal(result.promptPosting.coinsurance, 350);
  assert.equal(result.promptPosting.copay, 450);
  assert.equal(result.promptPosting.grandTotal, 13600);
  assert.equal(result.checkRows.length, 1);
  assert.equal(result.checkRows[0].payer, 'Aetna');
  assert.equal(result.checkRows[0].paymentReference, 'CHK-9812');
  assert.equal(result.checkRows[0].location, 'Main Clinic');
  assert.equal(result.lineItems.length, 2);
  assert.equal(result.lineItems[0].patientName, 'Smith, John');
  assert.equal(result.lineItems[0].serviceCode, '99214');
  assert.equal(result.lineItems[1].patientName, 'Doe, Jane');
  assert.equal(result.lineItems[1].prType, 'Copay');
  assert.equal(result.lineItems[1].patientPaid, 25);
});
