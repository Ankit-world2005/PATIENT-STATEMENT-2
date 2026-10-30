import ExcelJS from 'exceljs';

export async function parseCollectionExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  // 1. Locate sheets (case-insensitive & whitespace tolerant)
  const findSheet = (pattern) => {
    return wb.worksheets.find(ws => pattern.test(ws.name.trim().toLowerCase()));
  };

  const summarySheet = findSheet(/summary/);
  const checkSheet = findSheet(/check|prompt\s*-\s*check/);
  const lineItemSheet = findSheet(/lineitem|line\s*item|prompt\s*-\s*line/);

  let reportTitle = 'Clinic Collection Report';
  let monthYear = '';

  const particulars = {
    checkAmount: 0,
    patientPayment: 0,
    total: 0,
  };

  const promptPosting = {
    insurancePayment: 0,
    recoupmentOffset: 0,
    deductible: 0,
    coinsurance: 0,
    copay: 0,
    grandTotal: 0,
  };

  // 2. Parse Summary sheet if present
  if (summarySheet) {
    summarySheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const vals = row.values.slice(1);
      const str0 = String(vals[0] || '').trim();
      const str3 = String(vals[3] || '').trim();

      // Row 2 usually has report title
      if (!monthYear && /collection report/i.test(str0)) {
        reportTitle = str0;
        const match = str0.match(/-\s*([A-Za-z]+\s*\d{4})/i) || str0.match(/([A-Za-z]+\s+\d{4})/i);
        if (match) monthYear = match[1];
      }

      // Particulars parsing (Cols A & B)
      const parseNum = (v) => {
        if (v == null || v === '') return 0;
        const n = Number(String(v).replace(/[$,]/g, ''));
        return isNaN(n) ? 0 : n;
      };

      if (/check amount/i.test(str0)) particulars.checkAmount = parseNum(vals[1]);
      else if (/patient payment/i.test(str0)) particulars.patientPayment = parseNum(vals[1]);
      else if (/^total/i.test(str0)) particulars.total = parseNum(vals[1]);

      // Prompt Posting Summary parsing (Cols D & E)
      if (/insurance payment/i.test(str3)) promptPosting.insurancePayment = parseNum(vals[4]);
      else if (/recoupment offset/i.test(str3)) promptPosting.recoupmentOffset = parseNum(vals[4]);
      else if (/deductible/i.test(str3)) promptPosting.deductible = parseNum(vals[4]);
      else if (/coinsurance/i.test(str3)) promptPosting.coinsurance = parseNum(vals[4]);
      else if (/copay/i.test(str3)) promptPosting.copay = parseNum(vals[4]);
      else if (/grand total/i.test(str3)) promptPosting.grandTotal = parseNum(vals[4]);
    });
  }

  // Helper for dates
  const formatDateVal = (v) => {
    if (!v) return '';
    if (v instanceof Date) {
      const m = String(v.getUTCMonth() + 1).padStart(2, '0');
      const d = String(v.getUTCDate()).padStart(2, '0');
      const y = v.getUTCFullYear();
      return `${m}/${d}/${y}`;
    }
    const s = String(v).trim();
    return s;
  };

  const parseNum = (v) => {
    if (v == null || v === '') return 0;
    const n = Number(String(v).replace(/[$,]/g, ''));
    return isNaN(n) ? 0 : n;
  };

  // 3. Parse Check Sheet
  const checkRows = [];
  if (checkSheet) {
    let headerMap = null;
    checkSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const vals = row.values.slice(1);
      if (rowNumber === 1 || !headerMap) {
        headerMap = vals.map(v => String(v || '').trim().toLowerCase());
        return;
      }
      if (vals.every(v => v == null || String(v).trim() === '')) return;

      const getCol = (key) => {
        const idx = headerMap.findIndex(h => h.includes(key));
        return idx !== -1 ? vals[idx] : null;
      };

      checkRows.push({
        payer: String(getCol('payer') || vals[0] || '').trim(),
        paymentMethod: String(getCol('method') || vals[1] || 'EFT').trim(),
        paymentReference: String(getCol('reference') || vals[2] || '').trim(),
        paymentDate: formatDateVal(getCol('payment date') || vals[3]),
        bankDate: formatDateVal(getCol('bank date') || vals[4]),
        paymentAmount: parseNum(getCol('payment amount') || vals[5]),
        totalPosted: parseNum(getCol('total posted') || vals[6]),
        unposted: parseNum(getCol('unposted') || vals[7]),
        recoupment: parseNum(getCol('recoupment') || vals[8]),
        remarks: String(getCol('remark') || vals[9] || '').trim(),
      });
    });
  }

  // 4. Parse Line Item Sheet
  const lineItems = [];
  if (lineItemSheet) {
    let headerMap = null;
    lineItemSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const vals = row.values.slice(1);
      if (rowNumber === 1 || !headerMap) {
        headerMap = vals.map(v => String(v || '').trim().toLowerCase());
        return;
      }
      if (vals.every(v => v == null || String(v).trim() === '')) return;

      const getCol = (key) => {
        const idx = headerMap.findIndex(h => h.includes(key));
        return idx !== -1 ? vals[idx] : null;
      };

      lineItems.push({
        patientName: String(getCol('patient') || vals[0] || '').trim(),
        dateOfService: formatDateVal(getCol('service') || vals[1]),
        referenceNumber: String(getCol('reference') || vals[2] || '').trim(),
        bankDate: formatDateVal(getCol('bank date') || vals[3]),
        paymentDate: formatDateVal(getCol('payment date') || vals[4]),
        chargedAmount: parseNum(getCol('charged') || vals[5]),
        allowedAmount: parseNum(getCol('allowed') || vals[6]),
        insurancePayment: parseNum(getCol('insurance payment') || vals[7]),
        adjustedAmount: parseNum(getCol('adjusted') || vals[8]),
        transferredToSecondary: parseNum(getCol('secondary') || vals[9]),
        transferredToPatient: parseNum(getCol('transferred to patient') || vals[10]),
        patientPaid: parseNum(getCol('patient paid') || vals[11]),
        prType: String(getCol('pr type') || vals[12] || 'Deductible').trim(),
      });
    });
  }

  // 5. If summary amounts are all 0 but checkRows or lineItems have amounts, auto-calculate!
  if (particulars.total === 0 && (checkRows.length > 0 || lineItems.length > 0)) {
    const totalInsurance = lineItems.reduce((acc, r) => acc + (r.insurancePayment || 0), 0) ||
      checkRows.reduce((acc, r) => acc + (r.paymentAmount || 0), 0);
    const totalPatient = lineItems.reduce((acc, r) => acc + (r.patientPaid || 0), 0);

    particulars.checkAmount = totalInsurance;
    particulars.patientPayment = totalPatient;
    particulars.total = totalInsurance + totalPatient;

    promptPosting.insurancePayment = totalInsurance;
    promptPosting.deductible = lineItems
      .filter(r => /deduct/i.test(r.prType))
      .reduce((acc, r) => acc + (r.patientPaid || r.transferredToPatient || 0), 0) || totalPatient;
    promptPosting.coinsurance = lineItems
      .filter(r => /coins/i.test(r.prType))
      .reduce((acc, r) => acc + (r.patientPaid || r.transferredToPatient || 0), 0);
    promptPosting.copay = lineItems
      .filter(r => /copay/i.test(r.prType))
      .reduce((acc, r) => acc + (r.patientPaid || r.transferredToPatient || 0), 0);
    promptPosting.grandTotal = totalInsurance + totalPatient;
  }

  return {
    reportTitle,
    monthYear: monthYear || 'September 2026',
    particulars,
    promptPosting,
    checkRows,
    lineItems,
  };
}

