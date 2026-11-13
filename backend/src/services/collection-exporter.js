import ExcelJS from 'exceljs';

export async function generateCollectionExcel({
  reportTitle = 'West AZ Collection Report - September 2026',
  particulars = {},
  promptPosting = {},
  postingPeriods = null,
  isNaperville = false,
  checkRows = [],
  lineItems = [],
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'US24 Solutions - My Patient';
  wb.created = new Date();
  const numFmt = '$#,##0.00;($#,##0.00);"-"';

  if (isNaperville) {
    const p1 = (postingPeriods && postingPeriods[0]) || { title: 'Collection Report - Till 14th May' };
    const p2 = (postingPeriods && postingPeriods[1]) || { title: 'Collection After 14th May' };

    const wsSummary = wb.addWorksheet('Summary', { views: [{ showGridLines: true }] });
    wsSummary.columns = [
      { width: 30 }, // A
      { width: 16 }, // B
      { width: 24 }, // C
      { width: 16 }, // D
      { width: 28 }, // E
      { width: 16 }, // F
    ];

    wsSummary.addRow(['NAPERVILLE', '', '', '', p1.title || 'Collection Report - Till 14th May', '']);
    wsSummary.addRow([` ${reportTitle || 'Collection Report - October 2026'}`, '', '', '', 'Particular', 'Amount']);
    wsSummary.addRow(['Payment Type', 'Pmt Amount', '', '', 'Insurance', p1.insurancePayment || 0]);
    wsSummary.addRow(['Insurance Payment', particulars.checkAmount || 0, '', '', 'Recoupment offset', p1.recoupmentOffset || 0]);
    wsSummary.addRow(['Patient Payment(Deductible)', particulars.patientPayment || 0, '', '', 'Deductible', p1.deductible || 0]);
    wsSummary.addRow(['Grand Total', particulars.total || 0, '', '', 'Coinsurance', p1.coinsurance || 0]);
    wsSummary.addRow(['', '', '', '', 'Copay', p1.copay || 0]);
    wsSummary.addRow(['', '', '', '', 'Self Pay', p1.selfPay || 0]);
    wsSummary.addRow(['', '', '', '', 'Grand Total', p1.grandTotal || 0]);
    wsSummary.addRow([]);
    wsSummary.addRow([]);
    wsSummary.addRow(['', '', p2.title || 'Collection After 14th May', '', '', '']);
    wsSummary.addRow(['', '', 'Particular', 'Amount', '', '']);
    wsSummary.addRow(['', '', 'Insurance', p2.insurancePayment || 0, '', '']);
    wsSummary.addRow(['', '', 'Recoupment offset', p2.recoupmentOffset || 0, '', '']);
    wsSummary.addRow(['', '', 'Deductible', p2.deductible || 0, '', '']);
    wsSummary.addRow(['', '', 'Coinsurance', p2.coinsurance || 0, '', '']);
    wsSummary.addRow(['', '', 'Copay', p2.copay || 0, '', '']);
    wsSummary.addRow(['', '', 'Self Pay', p2.selfPay || 0, '', '']);
    wsSummary.addRow(['', '', 'Grand Total', p2.grandTotal || 0, '', '']);

    [4, 5, 6].forEach((r) => { wsSummary.getRow(r).getCell(2).numFmt = numFmt; });
    [3, 4, 5, 6, 7, 8, 9].forEach((r) => { wsSummary.getRow(r).getCell(6).numFmt = numFmt; });
    [14, 15, 16, 17, 18, 19, 20].forEach((r) => { wsSummary.getRow(r).getCell(4).numFmt = numFmt; });

    const wsChecks = wb.addWorksheet('Check Sheet', { views: [{ showGridLines: true }] });
    wsChecks.columns = [
      { header: 'Payee', key: 'payee', width: 16 },
      { header: 'Payer', key: 'payer', width: 28 },
      { header: 'Source', key: 'eobSource', width: 14 },
      { header: 'ERA/EOB', key: 'eraEob', width: 12 },
      { header: 'Method', key: 'method', width: 12 },
      { header: 'Check no', key: 'checkNo', width: 20 },
      { header: 'Check Date', key: 'checkDate', width: 14 },
      { header: 'Check Amount', key: 'checkAmount', width: 16 },
      { header: 'Posted Amount', key: 'postedAmount', width: 16 },
      { header: 'Remaining Amt', key: 'remainingAmount', width: 16 },
      { header: 'Recoupment', key: 'recoupment', width: 14 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Posted date', key: 'postedDate', width: 14 },
      { header: 'Client Confirmation & Clearance Date', key: 'clientConfirmationDate', width: 34 },
      { header: 'Remarks', key: 'remarks', width: 28 },
    ];
    for (const row of checkRows) {
      const r = wsChecks.addRow({
        ...row,
        eobSource: row.source || row.eobSource || '',
        method: row.method || row.paymentMethod || '',
        checkNo: row.checkNo || row.paymentReference || '',
        checkAmount: row.checkAmount != null ? row.checkAmount : (row.paymentAmount || 0),
        postedAmount: row.postedAmount != null ? row.postedAmount : (row.totalPosted || 0),
        remainingAmount: row.remainingAmount != null ? row.remainingAmount : (row.unposted || 0),
        clientConfirmationDate: row.clientConfirmationDate || '',
      });
      ['checkAmount', 'postedAmount', 'remainingAmount', 'recoupment'].forEach((k) => { r.getCell(k).numFmt = numFmt; });
    }

    const wsLine = wb.addWorksheet('Lineitem', { views: [{ showGridLines: true }] });
    wsLine.columns = [
      { header: 'Client name', key: 'clientName', width: 26 },
      { header: 'Payer name', key: 'payerName', width: 26 },
      { header: 'Check #', key: 'checkNo', width: 20 },
      { header: 'Check date', key: 'checkDate', width: 14 },
      { header: 'DOS', key: 'dos', width: 14 },
      { header: 'Service code', key: 'serviceCode', width: 14 },
      { header: 'Charge for Service', key: 'chargeForService', width: 18 },
      { header: 'Pmt Type', key: 'pmtType', width: 16 },
      { header: 'Pmt Amount', key: 'pmtAmount', width: 16 },
      { header: 'Deposit date', key: 'depositDate', width: 14 },
      { header: 'Facility Name', key: 'facilityName', width: 28 },
    ];
    for (const item of lineItems) {
      const r = wsLine.addRow({
        ...item,
        clientName: item.clientName || item.patientName || '',
        checkNo: item.checkNo || item.referenceNumber || '',
        checkDate: item.checkDate || item.paymentDate || '',
        dos: item.dos || item.dateOfService || '',
        chargeForService: item.chargeForService != null ? item.chargeForService : (item.chargedAmount || 0),
        pmtType: item.pmtType || item.prType || '',
        pmtAmount: item.pmtAmount != null ? item.pmtAmount : (item.insurancePayment || item.patientPaid || 0),
        depositDate: item.depositDate || item.bankDate || '',
        facilityName: item.facilityName || item.location || '',
      });
      ['chargeForService', 'pmtAmount'].forEach((k) => { r.getCell(k).numFmt = numFmt; });
    }

    return await wb.xlsx.writeBuffer();
  }

  // 1. Summary Sheet
  const wsSummary = wb.addWorksheet('Summary', {
    views: [{ showGridLines: true }],
  });

  wsSummary.columns = [
    { width: 36 }, // A: Particular
    { width: 18 }, // B: Amount
    { width: 6 },  // C: Spacer
    { width: 28 }, // D: Payment Type
    { width: 18 }, // E: Amount
  ];

  // Row 1: empty
  wsSummary.addRow([]);

  // Row 2: Title & Prompt Posting Summary Header
  const titleRow = wsSummary.addRow([
    reportTitle,
    '',
    '',
    'PROMPT POSTING SUMMARY',
    '',
  ]);
  wsSummary.mergeCells('A2:B2');
  wsSummary.mergeCells('D2:E2');

  titleRow.font = { bold: true, size: 12, color: { argb: 'FF14213D' } };
  titleRow.alignment = { vertical: 'middle' };

  // Row 3: Headers
  const headerRow = wsSummary.addRow([
    'Particular',
    'Amount',
    '',
    'Payment Type',
    'Amount',
  ]);
  headerRow.font = { bold: true, color: { argb: 'FF0D2C54' } };
  headerRow.eachCell((cell, colNumber) => {
    if (colNumber === 1 || colNumber === 2 || colNumber === 4 || colNumber === 5) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      };
    }
  });

  // Rows 4-9

  const r4 = wsSummary.addRow([
    'CHECK AMOUNT(INSURANCE PAYMENT)',
    particulars.checkAmount || 0,
    '',
    'Insurance Payment',
    promptPosting.insurancePayment || 0,
  ]);
  r4.getCell(2).numFmt = numFmt;
  r4.getCell(5).numFmt = numFmt;

  const r5 = wsSummary.addRow([
    'PATIENT PAYMENT(Deductible)',
    particulars.patientPayment || 0,
    '',
    'Recoupment Offset',
    promptPosting.recoupmentOffset || 0,
  ]);
  r5.getCell(2).numFmt = numFmt;
  r5.getCell(5).numFmt = numFmt;

  const r6 = wsSummary.addRow([
    'Total',
    particulars.total || 0,
    '',
    'Deductible',
    promptPosting.deductible || 0,
  ]);
  r6.getCell(1).font = { bold: true };
  r6.getCell(2).font = { bold: true };
  r6.getCell(2).numFmt = numFmt;
  r6.getCell(5).numFmt = numFmt;

  const r7 = wsSummary.addRow([
    '',
    '',
    '',
    'Coinsurance',
    promptPosting.coinsurance || 0,
  ]);
  r7.getCell(5).numFmt = numFmt;

  const r8 = wsSummary.addRow([
    '',
    '',
    '',
    'Copay',
    promptPosting.copay || 0,
  ]);
  r8.getCell(5).numFmt = numFmt;

  const r9 = wsSummary.addRow([
    '',
    '',
    '',
    'Grand Total',
    promptPosting.grandTotal || 0,
  ]);
  r9.getCell(4).font = { bold: true };
  r9.getCell(5).font = { bold: true };
  r9.getCell(5).numFmt = numFmt;

  // 2. Prompt - Check Sheet
  const wsChecks = wb.addWorksheet('Prompt - Check Sheet', {
    views: [{ showGridLines: true }],
  });

  wsChecks.columns = [
    { header: 'Payer', key: 'payer', width: 28 },
    { header: 'Payment Method', key: 'paymentMethod', width: 18 },
    { header: 'Payment Reference', key: 'paymentReference', width: 22 },
    { header: 'Payment Date', key: 'paymentDate', width: 16 },
    { header: 'Bank Date', key: 'bankDate', width: 16 },
    { header: 'Payment Amount', key: 'paymentAmount', width: 18 },
    { header: 'Total Posted', key: 'totalPosted', width: 18 },
    { header: 'Unposted', key: 'unposted', width: 16 },
    { header: 'Recoupment', key: 'recoupment', width: 16 },
    { header: 'Remarks', key: 'remarks', width: 32 },
  ];

  const checkHeader = wsChecks.getRow(1);
  checkHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  checkHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF14213D' },
    };
  });

  for (const row of checkRows) {
    const r = wsChecks.addRow(row);
    r.getCell('paymentAmount').numFmt = numFmt;
    r.getCell('totalPosted').numFmt = numFmt;
    r.getCell('unposted').numFmt = numFmt;
    r.getCell('recoupment').numFmt = numFmt;
  }

  // 3. Prompt - Lineitem Sheet
  const wsLine = wb.addWorksheet('Prompt - Lineitem ', {
    views: [{ showGridLines: true }],
  });

  wsLine.columns = [
    { header: 'Patient Name', key: 'patientName', width: 26 },
    { header: 'Date of Service', key: 'dateOfService', width: 16 },
    { header: 'Reference Number', key: 'referenceNumber', width: 20 },
    { header: 'Bank Date', key: 'bankDate', width: 16 },
    { header: 'Payment Date', key: 'paymentDate', width: 16 },
    { header: 'Charged Amount', key: 'chargedAmount', width: 18 },
    { header: 'Allowed Amount', key: 'allowedAmount', width: 18 },
    { header: 'Insurance Payment', key: 'insurancePayment', width: 20 },
    { header: 'Adjusted Amount', key: 'adjustedAmount', width: 18 },
    { header: 'Transferred to Secondary', key: 'transferredToSecondary', width: 24 },
    { header: 'Transferred to Patient', key: 'transferredToPatient', width: 22 },
    { header: 'Patient Paid', key: 'patientPaid', width: 18 },
    { header: 'PR Type', key: 'prType', width: 20 },
  ];

  const lineHeader = wsLine.getRow(1);
  lineHeader.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  lineHeader.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0D5C63' },
    };
  });

  for (const item of lineItems) {
    const r = wsLine.addRow(item);
    r.getCell('chargedAmount').numFmt = numFmt;
    r.getCell('allowedAmount').numFmt = numFmt;
    r.getCell('insurancePayment').numFmt = numFmt;
    r.getCell('adjustedAmount').numFmt = numFmt;
    r.getCell('transferredToSecondary').numFmt = numFmt;
    r.getCell('transferredToPatient').numFmt = numFmt;
    r.getCell('patientPaid').numFmt = numFmt;
  }

  return await wb.xlsx.writeBuffer();
}

