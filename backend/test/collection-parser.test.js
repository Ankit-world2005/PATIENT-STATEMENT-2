import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  parseCsvRows,
  parseCollectionExcel,
  detectCollectionFormat,
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

