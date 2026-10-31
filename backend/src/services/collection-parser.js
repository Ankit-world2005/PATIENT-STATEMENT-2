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

  let state = 'SCAN'; // 'SCAN' | 'LOCATION_WISE' | 'PAYER_TABLE' | 'SUMMARY' | 'LINEITEM_TABLE'
  let payerHeaderIdxs = null;
  let lineItemHeaderIdxs = null;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map(v => (v != null ? String(v).trim() : ''));
    if (row.length === 0 || row.every(c => c === '')) continue;

    const rowStr = row.join(' ').toLowerCase();

    // 1. Detect Report Title and Month/Year anywhere
    if (rowStr.includes('collection report')) {
      const found = row.find(c => /collection report/i.test(c));
      if (found) {
        reportTitle = found;
        const match = found.match(/-s*(?:tills+)?([A-Za-z]+s*d{4})/i) || found.match(/([A-Za-z]+s+d{4})/i);
        if (match) monthYear = match[1];
      }
      if (state === 'PAYER_TABLE') {
        state = 'SUMMARY';
      }
    }

    // 2. Check for Payer / Check table header
    if (rowStr.includes('payer') && (rowStr.includes('payment method') || rowStr.includes('payment reference'))) {
      state = 'PAYER_TABLE';
      payerHeaderIdxs = {
        payer: row.findIndex(c => /^payer$/i.test(c) || /payer/i.test(c)),
        method: row.findIndex(c => /method/i.test(c)),
        reference: row.findIndex(c => /reference/i.test(c)),
        postedDate: row.findIndex(c => /posted date/i.test(c) || /payment date/i.test(c)),
        bankDate: row.findIndex(c => /bank date/i.test(c)),
        createdBy: row.findIndex(c => /created by/i.test(c)),
        paymentAmount: row.findIndex(c => /payment amount/i.test(c)),
        totalPosted: row.findIndex(c => /total posted/i.test(c)),
        unposted: row.findIndex(c => /unposted/i.test(c)),
        recoupment: row.findIndex(c => /recoup/i.test(c)),
        location: row.findIndex(c => /location/i.test(c)),
        remarks: row.findIndex(c => /remark/i.test(c)),
      };
      continue;
    }

    // 3. Check for Line Item Table Header
    if (rowStr.includes('patient name') && (rowStr.includes('date of service') || rowStr.includes('reference number') || rowStr.includes('claim'))) {
      state = 'LINEITEM_TABLE';
      lineItemHeaderIdxs = {
        patientName: row.findIndex(c => /patient name/i.test(c) || /^patient$/i.test(c)),
        claimNumber: row.findIndex(c => /claim number/i.test(c) || /prompt claim/i.test(c) || /claims*#/i.test(c)),
        dos: row.findIndex(c => /date of service/i.test(c) || /^dos$/i.test(c) || /service/i.test(c)),
        ref: row.findIndex(c => /reference/i.test(c)),
        bankDate: row.findIndex(c => /remittance bank date/i.test(c) || /bank date/i.test(c)),
        postingDate: row.findIndex(c => /remittance payment date/i.test(c) || /posting date/i.test(c) || /payment date/i.test(c)),
        charge: row.findIndex(c => /submitted/i.test(c) || /charge/i.test(c)),
        allowed: row.findIndex(c => /allowed/i.test(c)),
        insurancePayment: row.findIndex(c => /paid amount/i.test(c) || /insurance payment/i.test(c)),
        adjustment: row.findIndex(c => /adjusted/i.test(c) || /adjust/i.test(c)),
        transferredSec: row.findIndex(c => /transferred to secondary/i.test(c) || /secondary/i.test(c)),
        transferredPt: row.findIndex(c => /transferred to patient/i.test(c)),
        patientPayment: row.findIndex(c => /patient payment/i.test(c) || /patient paid/i.test(c)),
        prType: row.findIndex(c => /pr type/i.test(c)),
        location: row.findIndex(c => /location/i.test(c)),
      };
      continue;
    }

    // 4. Check for Location Wise Summary Header
    if (rowStr.includes('location wise summary') || (rowStr.includes('payment type') && (rowStr.includes('home-based') || rowStr.includes('spring house')))) {
      let ptCol = row.findIndex(c => /^payment type$/i.test(c) || /payment type/i.test(c));
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

    // 5. Check for summary section transition
    const hasSummaryKeywords =
      rowStr.includes('particular') ||
      rowStr.includes('prompt posting') ||
      rowStr.includes('check amount') ||
      rowStr.includes('patient payment') ||
      rowStr.includes('recoupment offset');

    if (hasSummaryKeywords && state === 'PAYER_TABLE') {
      state = 'SUMMARY';
    }

    // If reading Location Wise Summary rows
    if (state === 'LOCATION_WISE') {
      if (rowStr.includes('payer') && (rowStr.includes('payment method') || rowStr.includes('payment reference'))) {
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

          if (/insurance payment/i.test(type)) promptPosting.insurancePayment = rowTotal;
          else if (/coinsurance/i.test(type)) promptPosting.coinsurance = rowTotal;
          else if (/copay/i.test(type)) promptPosting.copay = rowTotal;
          else if (/deductible/i.test(type)) promptPosting.deductible = rowTotal;
          else if (/grand total/i.test(type)) promptPosting.grandTotal = rowTotal;
          continue;
        }
      }
    }

    // Parse summary blocks (Particulars & Prompt Posting)
    if (state === 'SCAN' || state === 'SUMMARY') {
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;

        const rest = row.slice(c + 1).filter(v => v !== '');
        const nextVal = rest.length > 0 ? parseNum(rest[0]) : 0;

        if (/check amount/i.test(cell)) {
          particulars.checkAmount = nextVal;
        } else if (/patient payment/i.test(cell)) {
          particulars.patientPayment = nextVal;
        } else if (/^total(s+amount)?$/i.test(cell)) {
          particulars.total = nextVal;
        } else if (/insurance payment/i.test(cell)) {
          promptPosting.insurancePayment = nextVal;
        } else if (/recoupment/i.test(cell)) {
          promptPosting.recoupmentOffset = nextVal;
        } else if (/deductible/i.test(cell)) {
          promptPosting.deductible = nextVal;
        } else if (/coinsurance/i.test(cell)) {
          promptPosting.coinsurance = nextVal;
        } else if (/copay/i.test(cell)) {
          promptPosting.copay = nextVal;
        } else if (/grand total/i.test(cell)) {
          promptPosting.grandTotal = nextVal;
        }
      }
      if (hasSummaryKeywords) continue;
    }

    // If reading Payer Table rows
    if (state === 'PAYER_TABLE') {
      if (rowStr.includes('patient name') && (rowStr.includes('date of service') || rowStr.includes('reference') || rowStr.includes('claim'))) {
        state = 'LINEITEM_TABLE';
      } else {
        const payer = row[payerHeaderIdxs?.payer || 0];
        if (!payer || /^total/i.test(payer)) continue;

        checkRows.push({
          payer,
          paymentMethod: payerHeaderIdxs?.method !== -1 && row[payerHeaderIdxs?.method] ? row[payerHeaderIdxs.method] : 'CHK',
          paymentReference: payerHeaderIdxs?.reference !== -1 ? row[payerHeaderIdxs?.reference] || '' : '',
          paymentDate: formatDateVal(payerHeaderIdxs?.postedDate !== -1 ? row[payerHeaderIdxs?.postedDate] : ''),
          bankDate: formatDateVal(payerHeaderIdxs?.bankDate !== -1 ? row[payerHeaderIdxs?.bankDate] : ''),
          createdBy: payerHeaderIdxs?.createdBy !== -1 && payerHeaderIdxs?.createdBy != null ? row[payerHeaderIdxs.createdBy] || '' : '',
          paymentAmount: parseNum(payerHeaderIdxs?.paymentAmount !== -1 ? row[payerHeaderIdxs?.paymentAmount] : 0),
          totalPosted: parseNum(payerHeaderIdxs?.totalPosted !== -1 ? row[payerHeaderIdxs?.totalPosted] : 0),
          unposted: parseNum(payerHeaderIdxs?.unposted !== -1 ? row[payerHeaderIdxs?.unposted] : 0),
          recoupment: payerHeaderIdxs?.recoupment !== -1 && payerHeaderIdxs?.recoupment != null ? parseNum(row[payerHeaderIdxs.recoupment]) : 0,
          location: payerHeaderIdxs?.location !== -1 && payerHeaderIdxs?.location != null ? row[payerHeaderIdxs.location] || '' : '',
          remarks: payerHeaderIdxs?.remarks !== -1 && payerHeaderIdxs?.remarks != null ? row[payerHeaderIdxs.remarks] || '' : '',
        });
        continue;
      }
    }

    // If reading Line Item Table rows
    if (state === 'LINEITEM_TABLE') {
      const patientName = row[lineItemHeaderIdxs?.patientName ?? 0];
      if (!patientName || /^total/i.test(patientName)) continue;

      lineItems.push({
        patientName,
        claimNumber: lineItemHeaderIdxs?.claimNumber !== -1 && lineItemHeaderIdxs?.claimNumber != null ? row[lineItemHeaderIdxs.claimNumber] || '' : '',
        dateOfService: formatDateVal(row[lineItemHeaderIdxs?.dos ?? 1]),
        referenceNumber: row[lineItemHeaderIdxs?.ref ?? 2] || '',
        bankDate: formatDateVal(row[lineItemHeaderIdxs?.bankDate ?? 3]),
        paymentDate: formatDateVal(row[lineItemHeaderIdxs?.postingDate ?? 4]),
        chargedAmount: parseNum(row[lineItemHeaderIdxs?.charge ?? 5]),
        allowedAmount: lineItemHeaderIdxs?.allowed !== -1 && lineItemHeaderIdxs?.allowed != null ? parseNum(row[lineItemHeaderIdxs.allowed]) : 0,
        insurancePayment: parseNum(row[lineItemHeaderIdxs?.insurancePayment ?? 6]),
        adjustedAmount: parseNum(row[lineItemHeaderIdxs?.adjustment ?? 7]),
        transferredToSecondary: lineItemHeaderIdxs?.transferredSec !== -1 && lineItemHeaderIdxs?.transferredSec != null ? parseNum(row[lineItemHeaderIdxs.transferredSec]) : 0,
        transferredToPatient: lineItemHeaderIdxs?.transferredPt !== -1 && lineItemHeaderIdxs?.transferredPt != null ? parseNum(row[lineItemHeaderIdxs.transferredPt]) : 0,
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
