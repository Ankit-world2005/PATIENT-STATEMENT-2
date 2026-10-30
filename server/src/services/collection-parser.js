import ExcelJS from 'exceljs';

function parseNum(v) {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return isNaN(n) ? 0 : n;
}

function formatDateVal(v) {
  if (!v) return '';
  if (v instanceof Date) {
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    const y = v.getUTCFullYear();
    return `${m}/${d}/${y}`;
  }
  const s = String(v).trim();
  // If ISO date like 2026-09-05, reformat to MM/DD/YYYY for display
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const parts = s.slice(0, 10).split('-');
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  return s;
}

export function parseCsvRows(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      currentField = '';
      if (currentRow.length > 0 && currentRow.some(f => String(f).trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.some(f => String(f).trim() !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Universal Clinic Collection Parser.
 * Handles:
 * 1. Multi-sheet Excel workbooks (Summary, Prompt-Check, Prompt-Lineitem).
 * 2. Unified single-sheet Excel files with stacked sections (Namaste format).
 * 3. Unified CSV files with stacked sections.
 */
export async function parseCollectionExcel(buffer) {
  let isXlsx = false;
  const wb = new ExcelJS.Workbook();
  try {
    // Check if buffer looks like a zip/xlsx (starts with PK\x03\x04)
    if (buffer && buffer[0] === 0x50 && buffer[1] === 0x4b) {
      await wb.xlsx.load(buffer);
      isXlsx = true;
    }
  } catch (err) {
    isXlsx = false;
  }

  // If not XLSX, parse as CSV text
  if (!isXlsx) {
    const text = buffer.toString('utf8');
    const rows = parseCsvRows(text);
    return parseSingleSheetGrid(rows);
  }

  // 1. Locate sheets if multi-sheet
  const findSheet = (pattern) => {
    return wb.worksheets.find(ws => pattern.test(ws.name.trim().toLowerCase()));
  };

  const summarySheet = findSheet(/summary/);
  const checkSheet = findSheet(/check|prompt\s*-\s*check/);
  const lineItemSheet = findSheet(/lineitem|line\s*item|prompt\s*-\s*line/);

  // If workbook only has 1 worksheet or no standard multi-sheet names, check if it's a stacked unified sheet
  if (!summarySheet || (!checkSheet && !lineItemSheet)) {
    const sheet = wb.worksheets[0];
    if (sheet) {
      const grid = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        grid.push(row.values.slice(1).map(v => (v != null ? String(v) : '')));
      });
      return parseSingleSheetGrid(grid);
    }
  }

  // Otherwise, handle multi-sheet format
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

  if (summarySheet) {
    summarySheet.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values.slice(1);
      const str0 = String(vals[0] || '').trim();
      const str3 = String(vals[3] || '').trim();

      if (!monthYear && /collection report/i.test(str0)) {
        reportTitle = str0;
        const match = str0.match(/-\s*([A-Za-z]+\s*\d{4})/i) || str0.match(/([A-Za-z]+\s+\d{4})/i);
        if (match) monthYear = match[1];
      }

      if (/check amount/i.test(str0)) particulars.checkAmount = parseNum(vals[1]);
      else if (/patient payment/i.test(str0)) particulars.patientPayment = parseNum(vals[1]);
      else if (/^total/i.test(str0)) particulars.total = parseNum(vals[1]);

      if (/insurance payment/i.test(str3)) promptPosting.insurancePayment = parseNum(vals[4]);
      else if (/recoupment offset/i.test(str3)) promptPosting.recoupmentOffset = parseNum(vals[4]);
      else if (/deductible/i.test(str3)) promptPosting.deductible = parseNum(vals[4]);
      else if (/coinsurance/i.test(str3)) promptPosting.coinsurance = parseNum(vals[4]);
      else if (/copay/i.test(str3)) promptPosting.copay = parseNum(vals[4]);
      else if (/grand total/i.test(str3)) promptPosting.grandTotal = parseNum(vals[4]);
    });
  }

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
        location: String(getCol('location') || '').trim(),
        remarks: String(getCol('remark') || vals[9] || '').trim(),
      });
    });
  }

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
        paymentDate: formatDateVal(getCol('posting date') || getCol('payment date') || vals[4]),
        chargedAmount: parseNum(getCol('charged') || vals[5]),
        allowedAmount: parseNum(getCol('allowed') || vals[6]),
        insurancePayment: parseNum(getCol('insurance payment') || vals[7]),
        adjustedAmount: parseNum(getCol('adjust') || vals[8]),
        transferredToSecondary: parseNum(getCol('secondary') || vals[9]),
        transferredToPatient: parseNum(getCol('transferred to patient') || vals[10]),
        patientPaid: parseNum(getCol('patient pay') || getCol('patient paid') || vals[11]),
        prType: String(getCol('pr type') || vals[12] || 'Copay').trim(),
        location: String(getCol('location') || '').trim(),
      });
    });
  }

  const locationSummary = buildLocationSummary(lineItems, checkRows);

  return {
    reportTitle,
    monthYear: monthYear || 'September 2026',
    particulars,
    promptPosting,
    locationSummary,
    checkRows,
    lineItems,
  };
}

/**
 * Parses a single 2D grid of rows (from CSV or single-sheet Excel)
 * where sections are stacked vertically or side-by-side.
 */
export function parseSingleSheetGrid(grid) {
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

  let locationSummary = null;
  const checkRows = [];
  const lineItems = [];

  let state = 'SCAN'; // 'SCAN' | 'LOCATION_WISE' | 'PAYER_TABLE' | 'LINEITEM_TABLE'
  let payerHeaderIdxs = null;
  let lineItemHeaderIdxs = null;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map(v => (v != null ? String(v).trim() : ''));
    if (row.length === 0 || row.every(c => c === '')) continue;

    const rowStr = row.join(' ').toLowerCase();

    // 1. Detect Report Title and Month/Year
    if (!monthYear && rowStr.includes('collection report')) {
      const found = row.find(c => /collection report/i.test(c));
      if (found) {
        reportTitle = found;
        const match = found.match(/-\s*([A-Za-z]+\s*\d{4})/i) || found.match(/([A-Za-z]+\s+\d{4})/i);
        if (match) monthYear = match[1];
      }
    }

    // 2. Detect Particulars Summary items (only in top SCAN stage)
    if (state === 'SCAN') {
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;

        const rest = row.slice(c + 1).filter(v => v !== '');
        const nextVal = rest.length > 0 ? parseNum(rest[0]) : 0;

        if (/check amount/i.test(cell)) particulars.checkAmount = nextVal;
        else if (/patient payment/i.test(cell)) particulars.patientPayment = nextVal;
        else if (/total amount/i.test(cell)) particulars.total = nextVal;
      }
    }

    // 3. Detect Location Wise Summary Header
    if (rowStr.includes('location wise summary') || (rowStr.includes('payment type') && (rowStr.includes('home-based') || rowStr.includes('spring house')))) {
      // Find where 'payment type' appears
      let ptCol = row.findIndex(c => /^payment type$/i.test(c) || /payment type/i.test(c));
      // If there are multiple 'payment type' on this row (e.g. left side and right side), take the second one
      const allPt = [];
      row.forEach((c, idx) => { if (/payment type/i.test(c)) allPt.push(idx); });
      if (allPt.length > 1) ptCol = allPt[1];

      if (ptCol !== -1) {
        const locations = [];
        for (let c = ptCol + 1; c < row.length; c++) {
          if (row[c]) locations.push(row[c]);
        }

        if (locations.length > 0) {
          locationSummary = {
            locations,
            rows: [],
          };
          state = 'LOCATION_WISE';
          continue;
        }
      }
    }

    // If reading Location Wise Summary rows
    if (state === 'LOCATION_WISE') {
      if (rowStr.includes('payer') && rowStr.includes('payment method')) {
        state = 'PAYER_TABLE';
      } else {
        const ptIdx = row.findIndex(c =>
          /insurance payment/i.test(c) ||
          /coinsurance/i.test(c) ||
          /copay/i.test(c) ||
          /deductible/i.test(c) ||
          /self pay/i.test(c) ||
          /grand total/i.test(c)
        );

        if (ptIdx !== -1 && locationSummary) {
          const type = row[ptIdx];
          const valObj = { type };
          let rowTotal = 0;
          locationSummary.locations.forEach((loc, lIdx) => {
            const val = parseNum(row[ptIdx + 1 + lIdx]);
            valObj[loc] = val;
            rowTotal += val;
          });
          valObj.total = rowTotal;
          locationSummary.rows.push(valObj);

          // Update promptPosting summary metrics
          if (/insurance payment/i.test(type)) promptPosting.insurancePayment = rowTotal;
          else if (/coinsurance/i.test(type)) promptPosting.coinsurance = rowTotal;
          else if (/copay/i.test(type)) promptPosting.copay = rowTotal;
          else if (/deductible/i.test(type)) promptPosting.deductible = rowTotal;
          else if (/grand total/i.test(type)) promptPosting.grandTotal = rowTotal;
          continue;
        }
      }
    }

    // 4. Detect Payer / Check table header
    if (rowStr.includes('payer') && (rowStr.includes('payment method') || rowStr.includes('payment reference'))) {
      state = 'PAYER_TABLE';
      payerHeaderIdxs = {
        payer: row.findIndex(c => /^payer$/i.test(c) || /payer/i.test(c)),
        method: row.findIndex(c => /method/i.test(c)),
        reference: row.findIndex(c => /reference/i.test(c)),
        postedDate: row.findIndex(c => /posted date/i.test(c) || /payment date/i.test(c)),
        bankDate: row.findIndex(c => /bank date/i.test(c)),
        paymentAmount: row.findIndex(c => /payment amount/i.test(c)),
        totalPosted: row.findIndex(c => /total posted/i.test(c)),
        unposted: row.findIndex(c => /unposted/i.test(c)),
        location: row.findIndex(c => /location/i.test(c)),
        remarks: row.findIndex(c => /remark/i.test(c)),
      };
      continue;
    }

    // If reading Payer Table rows
    if (state === 'PAYER_TABLE') {
      if (rowStr.includes('patient name') && rowStr.includes('date of service')) {
        state = 'LINEITEM_TABLE';
      } else {
        // Skip totals row
        const isTotalsRow = !row[payerHeaderIdxs?.payer || 0] && row.some(c => parseNum(c) > 0);
        if (isTotalsRow) continue;

        const payer = row[payerHeaderIdxs?.payer || 0];
        if (!payer) continue;

        checkRows.push({
          payer,
          paymentMethod: row[payerHeaderIdxs?.method || 1] || 'CHK',
          paymentReference: row[payerHeaderIdxs?.reference || 2] || '',
          paymentDate: formatDateVal(row[payerHeaderIdxs?.postedDate || 3]),
          bankDate: formatDateVal(row[payerHeaderIdxs?.bankDate || 4]),
          paymentAmount: parseNum(row[payerHeaderIdxs?.paymentAmount || 5]),
          totalPosted: parseNum(row[payerHeaderIdxs?.totalPosted || 6]),
          unposted: parseNum(row[payerHeaderIdxs?.unposted || 7]),
          location: row[payerHeaderIdxs?.location || 8] || '',
          remarks: row[payerHeaderIdxs?.remarks || 9] || '',
        });
        continue;
      }
    }

    // 5. Detect Line Item Table Header
    if (rowStr.includes('patient name') && (rowStr.includes('date of service') || rowStr.includes('reference number'))) {
      state = 'LINEITEM_TABLE';
      lineItemHeaderIdxs = {
        patientName: row.findIndex(c => /patient name/i.test(c) || /^patient$/i.test(c)),
        dos: row.findIndex(c => /date of service/i.test(c) || /^dos$/i.test(c) || /service/i.test(c)),
        ref: row.findIndex(c => /reference/i.test(c)),
        bankDate: row.findIndex(c => /bank date/i.test(c)),
        postingDate: row.findIndex(c => /posting date/i.test(c) || /payment date/i.test(c)),
        charge: row.findIndex(c => /charge/i.test(c)),
        allowed: row.findIndex(c => /allowed/i.test(c)),
        insurancePayment: row.findIndex(c => /insurance payment/i.test(c)),
        adjustment: row.findIndex(c => /adjust/i.test(c)),
        patientPayment: row.findIndex(c => /patient payment/i.test(c) || /patient paid/i.test(c)),
        prType: row.findIndex(c => /pr type/i.test(c)),
        location: row.findIndex(c => /location/i.test(c)),
      };
      continue;
    }

    // If reading Line Item Table rows
    if (state === 'LINEITEM_TABLE') {
      const patientName = row[lineItemHeaderIdxs?.patientName ?? 0];
      if (!patientName) continue;

      lineItems.push({
        patientName,
        dateOfService: formatDateVal(row[lineItemHeaderIdxs?.dos ?? 1]),
        referenceNumber: row[lineItemHeaderIdxs?.ref ?? 2] || '',
        bankDate: formatDateVal(row[lineItemHeaderIdxs?.bankDate ?? 3]),
        paymentDate: formatDateVal(row[lineItemHeaderIdxs?.postingDate ?? 4]),
        chargedAmount: parseNum(row[lineItemHeaderIdxs?.charge ?? 5]),
        allowedAmount: lineItemHeaderIdxs?.allowed !== -1 && lineItemHeaderIdxs?.allowed != null ? parseNum(row[lineItemHeaderIdxs.allowed]) : 0,
        insurancePayment: parseNum(row[lineItemHeaderIdxs?.insurancePayment ?? 6]),
        adjustedAmount: parseNum(row[lineItemHeaderIdxs?.adjustment ?? 7]),
        patientPaid: parseNum(row[lineItemHeaderIdxs?.patientPayment ?? 8]),
        prType: row[lineItemHeaderIdxs?.prType ?? 9] || 'Copay',
        location: row[lineItemHeaderIdxs?.location ?? 10] || '',
      });
    }
  }

  // Fallback calculations if summary wasn't provided or totals were 0
  if (particulars.total === 0 && (checkRows.length > 0 || lineItems.length > 0)) {
    const totalInsurance = checkRows.reduce((sum, r) => sum + (r.paymentAmount || 0), 0) ||
      lineItems.reduce((sum, r) => sum + (r.insurancePayment || 0), 0);
    const totalPatient = lineItems.reduce((sum, r) => sum + (r.patientPaid || 0), 0);

    particulars.checkAmount = totalInsurance;
    particulars.patientPayment = totalPatient;
    particulars.total = totalInsurance + totalPatient;
  }

  if (promptPosting.grandTotal === 0 && (lineItems.length > 0 || checkRows.length > 0)) {
    const totalInsurance = checkRows.reduce((sum, r) => sum + (r.paymentAmount || 0), 0) ||
      lineItems.reduce((sum, r) => sum + (r.insurancePayment || 0), 0);
    promptPosting.insurancePayment = totalInsurance;
    promptPosting.copay = lineItems.filter(r => /copay/i.test(r.prType)).reduce((sum, r) => sum + (r.patientPaid || 0), 0);
    promptPosting.coinsurance = lineItems.filter(r => /coins/i.test(r.prType)).reduce((sum, r) => sum + (r.patientPaid || 0), 0);
    promptPosting.deductible = lineItems.filter(r => /deduct/i.test(r.prType)).reduce((sum, r) => sum + (r.patientPaid || 0), 0);
    promptPosting.grandTotal = totalInsurance + promptPosting.copay + promptPosting.coinsurance + promptPosting.deductible;
  }

  // If locationSummary was not in file, build from line items and check rows
  if (!locationSummary && (lineItems.length > 0 || checkRows.length > 0)) {
    locationSummary = buildLocationSummary(lineItems, checkRows);
  }

  return {
    reportTitle,
    monthYear: monthYear || 'September 2026',
    particulars,
    promptPosting,
    locationSummary,
    checkRows,
    lineItems,
  };
}

function buildLocationSummary(lineItems, checkRows) {
  const locSet = new Set();
  lineItems.forEach(r => { if (r.location) locSet.add(r.location); });
  checkRows.forEach(r => { if (r.location) locSet.add(r.location); });

  const locations = Array.from(locSet);
  if (locations.length === 0) return null;

  const types = ['Insurance Payment', 'Coinsurance', 'Copay', 'Deductible', 'Self Pay', 'Grand total'];
  const summaryRows = types.map(type => {
    const rowObj = { type };
    let rowTotal = 0;

    locations.forEach(loc => {
      let val = 0;
      if (type === 'Insurance Payment') {
        val = checkRows.filter(r => r.location === loc).reduce((sum, r) => sum + (r.paymentAmount || 0), 0) ||
              lineItems.filter(r => r.location === loc).reduce((sum, r) => sum + (r.insurancePayment || 0), 0);
      } else if (type === 'Coinsurance') {
        val = lineItems.filter(r => r.location === loc && /coins/i.test(r.prType)).reduce((sum, r) => sum + (r.patientPaid || 0), 0);
      } else if (type === 'Copay') {
        val = lineItems.filter(r => r.location === loc && /copay/i.test(r.prType)).reduce((sum, r) => sum + (r.patientPaid || 0), 0);
      } else if (type === 'Deductible') {
        val = lineItems.filter(r => r.location === loc && /deduct/i.test(r.prType)).reduce((sum, r) => sum + (r.patientPaid || 0), 0);
      } else if (type === 'Self Pay') {
        val = lineItems.filter(r => r.location === loc && /self/i.test(r.prType)).reduce((sum, r) => sum + (r.patientPaid || 0), 0);
      }

      rowObj[loc] = val;
      rowTotal += val;
    });

    rowObj.total = rowTotal;
    return rowObj;
  });

  // Calculate Grand Total row
  const grandTotalRow = summaryRows.find(r => r.type === 'Grand total');
  if (grandTotalRow) {
    let grandGrandTotal = 0;
    locations.forEach(loc => {
      const locTotal = summaryRows
        .filter(r => r.type !== 'Grand total')
        .reduce((sum, r) => sum + (r[loc] || 0), 0);
      grandTotalRow[loc] = locTotal;
      grandGrandTotal += locTotal;
    });
    grandTotalRow.total = grandGrandTotal;
  }

  return {
    locations,
    rows: summaryRows,
  };
}
