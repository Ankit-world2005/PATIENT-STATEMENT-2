import ExcelJS from 'exceljs';

export function formatDateVal(v) {
  if (!v) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    const y = v.getUTCFullYear();
    return `${m}/${d}/${y}`;
  }
  // Handle Excel date serial numbers (e.g. 45530)
  if (typeof v === 'number' && v > 20000 && v < 65000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(v));
    const m = String(epoch.getUTCMonth() + 1).padStart(2, '0');
    const d = String(epoch.getUTCDate()).padStart(2, '0');
    const y = epoch.getUTCFullYear();
    return `${m}/${d}/${y}`;
  }
  const s = String(v).trim();
  if (!s || s === '—' || s === '-') return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const parts = s.slice(0, 10).split('-');
    return `${parts[1]}/${parts[2]}/${parts[0]}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    if (s.includes('GMT') || s.includes('T') || s.includes('Z')) {
      const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      const d = String(parsed.getUTCDate()).padStart(2, '0');
      const y = parsed.getUTCFullYear();
      return `${m}/${d}/${y}`;
    }
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    const y = parsed.getFullYear();
    return `${m}/${d}/${y}`;
  }
  return s;
}

export function extractCellValue(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v instanceof Date) return formatDateVal(v);
    if (v.result !== undefined) {
      return v.result != null ? v.result : '';
    }
    if (v.text !== undefined) return v.text;
    if (Array.isArray(v.richText)) {
      return v.richText.map(t => (t && t.text ? t.text : '')).join('');
    }
    if (v.sharedString !== undefined) return v.sharedString;
  }
  return v;
}

export function parseNum(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'object') {
    if (v.result !== undefined) {
      v = v.result;
    } else if (v.text !== undefined) {
      v = v.text;
    }
  }
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  let str = String(v).trim();
  if (!str) return 0;

  // Handle accounting format: "(159.25)" -> -159.25 or "($159.25)" -> -159.25
  const isParenNegative = /^\s*\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\)\s*$/.test(str);
  if (isParenNegative) {
    const matched = str.match(/^\s*\(\s*\$?\s*([\d,]+(?:\.\d+)?)\s*\)\s*$/);
    const n = Number(matched[1].replace(/,/g, ''));
    return isNaN(n) ? 0 : -n;
  }

  // Handle standard negative or positive with dollar signs / commas
  const cleaned = str.replace(/[$,\s]/g, '');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
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
 * Automatically inspects a 2D grid of rows and detects whether it is:
 * - 'combined'  (Prompt + Therabill hybrid format)
 * - 'therabill' (Therabill standalone format)
 * - 'prompt'    (Prompt standalone format)
 */
export function detectCollectionFormat(grid) {
  if (!grid || !Array.isArray(grid) || grid.length === 0) return 'prompt';

  const fullText = grid.map(r => r.join(' ').toLowerCase()).join('\n');

  // 1. Check for Combined / Hybrid signatures
  const hasCombinedTitle = /prompt\s*\+\s*therabill|therabill\s*\+\s*prompt/i.test(fullText);
  const hasDualPosting = /therabill posting summary/i.test(fullText) && /prompt posting summary/i.test(fullText);
  const hasDualPayment = /therabill payment summary/i.test(fullText) && /prompt payment summary/i.test(fullText);
  if (hasCombinedTitle || hasDualPosting || hasDualPayment) {
    return 'combined';
  }

  // 2. Check for Therabill signatures
  const hasTherabillKeyword = /therabill/i.test(fullText);
  const hasClientNameHeader = /client name\s*\(\s*last\s*,\s*first\s*\)/i.test(fullText);
  const hasEobSource = /eob source/i.test(fullText) && /era\/eob/i.test(fullText);
  const hasChargeForService = /charge for service/i.test(fullText) && /pmt type/i.test(fullText);

  if (hasTherabillKeyword || (hasClientNameHeader && (hasEobSource || hasChargeForService))) {
    return 'therabill';
  }

  // 3. Default to Prompt
  return 'prompt';
}

/**
 * Universal Clinic Collection Parser with automatic format detection.
 */
export async function parseCollectionExcel(buffer) {
  let isXlsx = false;
  const wb = new ExcelJS.Workbook();
  try {
    if (buffer && buffer[0] === 0x50 && buffer[1] === 0x4b) {
      await wb.xlsx.load(buffer);
      isXlsx = true;
    }
  } catch (err) {
    isXlsx = false;
  }

  // If CSV, parse as grid and auto-detect
  if (!isXlsx) {
    const text = buffer.toString('utf8');
    const rows = parseCsvRows(text);
    return parseAutoGrid(rows);
  }

  // 1. Check multi-sheet names
  const findSheet = (pattern) => {
    return wb.worksheets.find(ws => pattern.test(ws.name.trim().toLowerCase()));
  };

  const hasPromptCheck = findSheet(/prompt\s*-\s*check/);
  const hasPromptLine = findSheet(/prompt\s*-\s*line/);
  const hasTherabillCheck = findSheet(/therabill\s*-\s*check|therabill\s*-\s*remit/);
  const hasTherabillLine = findSheet(/therabill\s*-\s*line/);
  const hasCombinedSheet = findSheet(/prompt\s*\+\s*therabill|therabill\s*\+\s*prompt|hybrid/);

  // Generic check and lineitem sheet matching (e.g. "Check Sheet", "Checks", "Lineitem", "Line Items", "Claims")
  const genericCheckSheet = findSheet(/check|remit|era|payment/i);
  const genericLineSheet = findSheet(/line\s*item|lineitem|claim|patient/i);

  // Check if any sheet contains explicit Therabill columns
  const hasTherabillContent = wb.worksheets.some(ws => {
    let matched = false;
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const rowText = ws.getRow(r).values.slice(1).map(extractCellValue).join(' ').toLowerCase();
      if (rowText.includes('eob source') || rowText.includes('charge for service') || /therabill/i.test(rowText)) {
        matched = true;
        break;
      }
    }
    return matched;
  });

  // Check if any sheet contains explicit Prompt columns
  const hasPromptContent = wb.worksheets.some(ws => {
    let matched = false;
    for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
      const rowText = ws.getRow(r).values.slice(1).map(extractCellValue).join(' ').toLowerCase();
      if (rowText.includes('prompt claim') || rowText.includes('prompt posting') || rowText.includes('remittance bank date')) {
        matched = true;
        break;
      }
    }
    return matched;
  });

  const hasMultiSheetMatches = Boolean(
    hasPromptCheck ||
    hasPromptLine ||
    hasTherabillCheck ||
    hasTherabillLine ||
    hasCombinedSheet ||
    (wb.worksheets.length > 1 && (genericCheckSheet || genericLineSheet))
  );

  // If workbook only has 1 worksheet or no multi-sheet matches, parse as stacked grid
  if (!hasMultiSheetMatches || wb.worksheets.length === 1) {
    const sheet = wb.worksheets[0];
    if (sheet) {
      const grid = [];
      sheet.eachRow({ includeEmpty: true }, (row) => {
        grid.push(row.values.slice(1).map(v => {
          const val = extractCellValue(v);
          return val != null ? String(val).trim() : '';
        }));
      });
      return parseAutoGrid(grid);
    }
  }

  // If multi-sheet hybrid (both Prompt & Therabill sheets/content present, or combined sheet name)
  if (hasCombinedSheet || ((hasPromptCheck || hasPromptLine || hasPromptContent) && (hasTherabillCheck || hasTherabillLine || hasTherabillContent))) {
    return parseMultiSheetHybrid(wb);
  }

  // If multi-sheet Therabill
  if (hasTherabillCheck || hasTherabillLine || (hasTherabillContent && !hasPromptContent)) {
    return parseMultiSheetTherabill(wb);
  }

  // Otherwise standard multi-sheet Prompt (including Summary + Check Sheet + Lineitem)
  return parseMultiSheetPrompt(wb);
}

/**
 * Auto-detects format from a 2D grid and delegates to the appropriate parser.
 */
export function parseAutoGrid(grid) {
  const format = detectCollectionFormat(grid);
  if (format === 'combined') {
    return parseCombinedGrid(grid);
  }
  if (format === 'therabill') {
    return parseTherabillGrid(grid);
  }
  return parsePromptGrid(grid);
}

/**
 * ============================================================================
 * 1. COMBINED / HYBRID FORMAT PARSER (PROMPT + THERABILL)
 * ============================================================================
 */
export function parseCombinedGrid(grid) {
  let reportTitle = 'Prompt + Therabill Combined Collection Report';
  let monthYear = '';

  const particulars = { checkAmount: 0, patientPayment: 0, total: 0 };
  const tbParticulars = { checkAmount: 0, patientPayment: 0, total: 0 };
  const promptParticulars = { checkAmount: 0, patientPayment: 0, total: 0 };

  const promptPosting = {
    insurancePayment: 0,
    recoupmentOffset: 0,
    deductible: 0,
    coinsurance: 0,
    copay: 0,
    selfPay: 0,
    noShow: 0,
    cancellationFee: 0,
    dryNeedling: 0,
    scottStamp: 0,
    grandTotal: 0,
  };

  const tbPosting = { ...promptPosting };
  const prPosting = { ...promptPosting };

  let tbLocationSummary = null;
  let prLocationSummary = null;
  const checkRows = [];
  const lineItems = [];

  let state = 'SCAN';
  let activeTableType = null; // 'TB_CHECK' | 'TB_LINE' | 'PR_CHECK' | 'PR_LINE'
  let activeHeaderMap = null;

  for (let r = 0; r < grid.length; r++) {
    const rawRow = grid[r];
    const row = rawRow.map(v => (v != null ? String(v).trim() : ''));
    if (row.length === 0 || row.every(c => c === '')) continue;
    const rowStr = row.join(' ').toLowerCase();

    // Month / Title discovery
    if (rowStr.includes('collection report')) {
      const found = row.find(c => /collection report/i.test(c));
      if (found) {
        reportTitle = found;
        const match = found.match(/-\s*([A-Za-z]+\s*\d{4})/i) || found.match(/([A-Za-z]+\s+\d{4})/i);
        if (match) monthYear = match[1];
      }
    }

    // Top Summary Blocks detection (before tables or matrix)
    if (state === 'SCAN' && !activeTableType) {
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;

        const rest = row.slice(c + 1).filter(v => v !== '');
        const val = rest.length > 0 ? parseNum(rest[0]) : 0;

        if (/check amount|insurance payment/i.test(cell)) {
          if (c < 3) particulars.checkAmount = val;
          else if (c < 8) tbParticulars.checkAmount = val;
          else promptParticulars.checkAmount = val;
        } else if (/patient payment/i.test(cell)) {
          if (c < 3) particulars.patientPayment = val;
          else if (c < 8) tbParticulars.patientPayment = val;
          else promptParticulars.patientPayment = val;
        } else if (/^total|^grand total/i.test(cell)) {
          if (c < 3) particulars.total = val;
          else if (c < 8) tbParticulars.total = val;
          else promptParticulars.total = val;
        }
      }
    }

    // Location Wise Posting Summaries (Therabill vs Prompt side-by-side or stacked)
    if (rowStr.includes('posting summary') || rowStr.includes('location wise payment info')) {
      continue;
    }

    // Detect Matrix Header Row (Type, Airpark, Tempe, Grand total)
    if (rowStr.includes('type') && (rowStr.includes('airpark') || rowStr.includes('tempe') || rowStr.includes('grand total'))) {
      const typeCols = [];
      row.forEach((c, idx) => {
        if (/^type$/i.test(c)) typeCols.push(idx);
      });

      if (typeCols.length > 0) {
        // Therabill side is first typeCol
        const tbStart = typeCols[0];
        const tbLocs = [];
        const nextCol = typeCols[1] || row.length;
        for (let i = tbStart + 1; i < nextCol; i++) {
          if (row[i] && !/grand total/i.test(row[i])) tbLocs.push(row[i]);
        }
        tbLocationSummary = { locations: tbLocs, rows: [] };

        // Prompt side is second typeCol if present
        if (typeCols.length > 1) {
          const prStart = typeCols[1];
          const prLocs = [];
          for (let i = prStart + 1; i < row.length; i++) {
            if (row[i] && !/grand total/i.test(row[i])) prLocs.push(row[i]);
          }
          prLocationSummary = { locations: prLocs, rows: [] };
        }
        state = 'LOCATION_MATRIX';
        continue;
      }
    }

    // Parse Location Matrix Rows
    if (state === 'LOCATION_MATRIX') {
      const isCategoryRow = /insurance|recoupment|deductible|coinsurance|copay|self pay|no show|cancellation fee|dry needling|scott stamp|grand total/i.test(row[0]);
      if (isCategoryRow && tbLocationSummary) {
        const cat = row[0];
        const tbRowObj = { type: cat };
        let tbRowSum = 0;
        tbLocationSummary.locations.forEach((loc, idx) => {
          const v = parseNum(row[1 + idx]);
          tbRowObj[loc] = v;
          tbRowSum += v;
        });
        tbRowObj.total = tbRowSum;
        tbLocationSummary.rows.push(tbRowObj);

        // Map into tbPosting
        applyCategoryToPosting(cat, tbRowSum, tbPosting);

        // Check prompt side if present on same row
        if (prLocationSummary && row.length > tbLocationSummary.locations.length + 2) {
          const prOffset = tbLocationSummary.locations.length + 2;
          const prCat = row[prOffset] || cat;
          const prRowObj = { type: prCat };
          let prRowSum = 0;
          prLocationSummary.locations.forEach((loc, idx) => {
            const v = parseNum(row[prOffset + 1 + idx]);
            prRowObj[loc] = v;
            prRowSum += v;
          });
          prRowObj.total = prRowSum;
          prLocationSummary.rows.push(prRowObj);
          applyCategoryToPosting(prCat, prRowSum, prPosting);
        }
        continue;
      }
    }

    // Detect Therabill Check Table Header:
    // Clinic,Payer,EOB Source,Method,ERA/EOB,Check no,Check Date,Check Amount,Posted Amount,Remaining Amount,Recoupment,Status,Posted date,Locations,Remarks
    if (rowStr.includes('eob source') && rowStr.includes('era/eob')) {
      activeTableType = 'TB_CHECK';
      activeHeaderMap = row.map(h => h.trim().toLowerCase());
      state = 'TABLE';
      continue;
    }

    // Detect Therabill Lineitem Table Header:
    // "Client Name (Last, First)",Payer name,Check #,Check date,DOS,Service code,Charge for Service,Pmt Type,Pmt Amount,Deposit date,Facility Name,Locations
    if (rowStr.includes('client name') && rowStr.includes('charge for service')) {
      activeTableType = 'TB_LINE';
      activeHeaderMap = row.map(h => h.trim().toLowerCase());
      state = 'TABLE';
      continue;
    }

    // Detect Prompt Check Table Header:
    // Payer,Payment Method,Payment Reference,Payment Date,Bank Date,Payment Amount,Total Posted,Unposted,Recoupment,Location,Remarks
    if (rowStr.includes('payer') && (rowStr.includes('payment method') || rowStr.includes('payment reference'))) {
      activeTableType = 'PR_CHECK';
      activeHeaderMap = row.map(h => h.trim().toLowerCase());
      state = 'TABLE';
      continue;
    }

    // Detect Prompt Lineitem Table Header:
    // Patient Name,Date of Service,Visit Facility,Reference Number,Remittance Bank Date,Remittance Payment Date,Submitted Amount,Paid Amount,Adjusted Amount,Transferred to Secondary,Transferred to Patient,Patient paid,PR Type
    if (rowStr.includes('patient name') && (rowStr.includes('date of service') || rowStr.includes('reference number') || rowStr.includes('submitted amount'))) {
      activeTableType = 'PR_LINE';
      activeHeaderMap = row.map(h => h.trim().toLowerCase());
      state = 'TABLE';
      continue;
    }

    // Parse Table Rows
    if (state === 'TABLE' && activeTableType && activeHeaderMap) {
      const getVal = (pattern) => {
        const idx = activeHeaderMap.findIndex(h => pattern.test(h));
        return idx !== -1 ? row[idx] : '';
      };

      if (activeTableType === 'TB_CHECK') {
        const payer = getVal(/^payer/) || row[1];
        if (!payer || /^total/i.test(payer)) continue;

        checkRows.push({
          sourceSystem: 'Therabill',
          payer,
          paymentMethod: getVal(/method/) || 'EFT',
          paymentReference: getVal(/check no|check\s*#|reference/) || row[5] || '',
          paymentDate: formatDateVal(getVal(/posted date/) || getVal(/check date/) || row[6]),
          bankDate: formatDateVal(getVal(/check date/) || row[6]),
          paymentAmount: parseNum(getVal(/check amount|payment amount/) || row[7]),
          totalPosted: parseNum(getVal(/posted amount|total posted/) || row[8]),
          unposted: parseNum(getVal(/remaining amount|unposted/) || row[9]),
          recoupment: parseNum(getVal(/recoupment/) || row[10]),
          status: getVal(/status/) || 'Posted',
          eobSource: getVal(/eob source/) || '',
          eraEob: getVal(/era\/eob/) || '',
          location: getVal(/location|clinic/) || row[13] || '',
          remarks: getVal(/remark/) || row[14] || '',
        });
      } else if (activeTableType === 'TB_LINE') {
        const patientName = getVal(/client name|patient name/) || row[0];
        if (!patientName || /^total/i.test(patientName)) continue;

        const pmtType = getVal(/pmt type|pr type/) || 'Copay';
        const pmtAmt = parseNum(getVal(/pmt amount|paid amount|payment amount/) || row[8]);
        const isInsurance = /insurance/i.test(pmtType);

        lineItems.push({
          sourceSystem: 'Therabill',
          patientName,
          payerName: getVal(/payer/) || row[1] || '',
          referenceNumber: getVal(/check\s*#|check no|reference/) || row[2] || '',
          dateOfService: formatDateVal(getVal(/dos|service date|date of service/) || row[4]),
          serviceCode: getVal(/service code/) || row[5] || '',
          chargedAmount: parseNum(getVal(/charge for service|charged amount|submitted amount/) || row[6]),
          allowedAmount: 0,
          insurancePayment: isInsurance ? pmtAmt : 0,
          adjustedAmount: 0,
          transferredToSecondary: 0,
          transferredToPatient: 0,
          patientPaid: isInsurance ? 0 : pmtAmt,
          prType: pmtType,
          bankDate: formatDateVal(getVal(/deposit date|check date/) || row[9]),
          paymentDate: formatDateVal(getVal(/check date|deposit date/) || row[3]),
          location: getVal(/facility name|locations|location/) || row[10] || '',
        });
      } else if (activeTableType === 'PR_CHECK') {
        const payer = getVal(/^payer/) || row[0];
        if (!payer || /^total/i.test(payer)) continue;

        checkRows.push({
          sourceSystem: 'Prompt',
          payer,
          paymentMethod: getVal(/method/) || 'EFT',
          paymentReference: getVal(/reference|check/) || row[2] || '',
          paymentDate: formatDateVal(getVal(/payment date|posted date/) || row[3]),
          bankDate: formatDateVal(getVal(/bank date/) || row[4]),
          paymentAmount: parseNum(getVal(/payment amount|check amount/) || row[5]),
          totalPosted: parseNum(getVal(/total posted|posted amount/) || row[6]),
          unposted: parseNum(getVal(/unposted|remaining amount/) || row[7]),
          recoupment: parseNum(getVal(/recoupment/) || row[8]),
          location: getVal(/location/) || row[9] || '',
          remarks: getVal(/remark/) || row[10] || '',
        });
      } else if (activeTableType === 'PR_LINE') {
        const patientName = getVal(/patient name/) || row[0];
        if (!patientName || /^total/i.test(patientName)) continue;

        lineItems.push({
          sourceSystem: 'Prompt',
          patientName,
          dateOfService: formatDateVal(getVal(/date of service|service/) || row[1]),
          referenceNumber: getVal(/reference|check/) || row[3] || row[2] || '',
          bankDate: formatDateVal(getVal(/bank date/) || row[4] || row[3]),
          paymentDate: formatDateVal(getVal(/payment date|posting date/) || row[5] || row[4]),
          chargedAmount: parseNum(getVal(/submitted amount|charged amount/) || row[6] || row[5]),
          allowedAmount: parseNum(getVal(/allowed amount/) || 0),
          insurancePayment: parseNum(getVal(/paid amount|insurance payment/) || row[7]),
          adjustedAmount: parseNum(getVal(/adjusted amount/) || row[8]),
          transferredToSecondary: parseNum(getVal(/transferred to secondary/) || row[9]),
          transferredToPatient: parseNum(getVal(/transferred to patient/) || row[10]),
          patientPaid: parseNum(getVal(/patient paid|patient payment/) || row[11]),
          prType: getVal(/pr type/) || 'Copay',
          location: getVal(/visit facility|facility|location/) || row[2] || '',
        });
      }
    }
  }

  // Combine posting summaries
  combinePostingSummaries(promptPosting, tbPosting, prPosting);

  // Fallback calculations for particulars if not directly supplied
  if (particulars.total === 0 && (checkRows.length > 0 || lineItems.length > 0)) {
    const totalInsurance = checkRows.reduce((sum, r) => sum + (r.paymentAmount || 0), 0) ||
      lineItems.reduce((sum, r) => sum + (r.insurancePayment || 0), 0);
    const totalPatient = lineItems.reduce((sum, r) => sum + (r.patientPaid || 0), 0);
    particulars.checkAmount = totalInsurance;
    particulars.patientPayment = totalPatient;
    particulars.total = totalInsurance + totalPatient;
  }

  // Build combined Location Summary
  const combinedLocationSummary = mergeLocationSummaries(tbLocationSummary, prLocationSummary) ||
    buildLocationSummary(lineItems, checkRows);

  return {
    detectedFormat: 'combined',
    formatLabel: 'Therabill + Prompt (Hybrid)',
    reportTitle,
    monthYear: monthYear || 'September 2026',
    particulars,
    promptPosting,
    postingSummary: promptPosting,
    locationSummary: combinedLocationSummary,
    hybridSummaries: {
      therabill: { particulars: tbParticulars, postingSummary: tbPosting, locationSummary: tbLocationSummary },
      prompt: { particulars: promptParticulars, postingSummary: prPosting, locationSummary: prLocationSummary },
      combined: { particulars, postingSummary: promptPosting, locationSummary: combinedLocationSummary },
    },
    checkRows,
    lineItems,
  };
}

/**
 * ============================================================================
 * 2. STANDALONE THERABILL FORMAT PARSER
 * ============================================================================
 */
export function parseTherabillGrid(grid) {
  let reportTitle = 'Therabill Collection Report';
  let monthYear = '';

  const particulars = { checkAmount: 0, patientPayment: 0, total: 0 };
  const promptPosting = {
    insurancePayment: 0,
    recoupmentOffset: 0,
    deductible: 0,
    coinsurance: 0,
    copay: 0,
    selfPay: 0,
    noShow: 0,
    cancellationFee: 0,
    dryNeedling: 0,
    scottStamp: 0,
    grandTotal: 0,
  };

  const checkRows = [];
  const lineItems = [];
  let state = 'SCAN';
  let activeTableType = null;
  let activeHeaderMap = null;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map(v => (v != null ? String(v).trim() : ''));
    if (row.length === 0 || row.every(c => c === '')) continue;
    const rowStr = row.join(' ').toLowerCase();

    // 1. Report Title & Month
    if (rowStr.includes('therabill') || rowStr.includes('collection report')) {
      const found = row.find(c => /collection report/i.test(c) || /therabill/i.test(c));
      if (found) {
        if (/collection report/i.test(found)) reportTitle = found;
        const match = found.match(/-\s*([A-Za-z]+\s*\d{4})/i) || found.match(/([A-Za-z]+\s+\d{4})/i);
        if (match) monthYear = match[1];
      }
    }

    // Detect Therabill Check Table Header:
    // Payee,Payer,EOB Source,ERA/EOB,Method,Check no,Check Date,Check Amount,Posted Amount,Remaining Amount,Recoupment,Status,Posted date,Remarks
    if (rowStr.includes('eob source') || (rowStr.includes('check no') && rowStr.includes('posted amount'))) {
      activeTableType = 'TB_CHECK';
      activeHeaderMap = row.map(h => h.trim().toLowerCase());
      state = 'TABLE';
      continue;
    }

    // Detect Therabill Lineitem Table Header:
    // "Client Name (Last, First)",Payer name,Check #,Check date,DOS,Service code,Charge for Service,Pmt Type,Pmt Amount,Deposit date,Facility Name
    if (rowStr.includes('client name') || (rowStr.includes('charge for service') && rowStr.includes('pmt type'))) {
      activeTableType = 'TB_LINE';
      activeHeaderMap = row.map(h => h.trim().toLowerCase());
      state = 'TABLE';
      continue;
    }

    // 2. Summary Breakdown (before tables)
    // Left: Particulars | Right: Payment Type, Pmt Amount
    if (state === 'SCAN' && !activeTableType) {
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (!cell) continue;

        const rest = row.slice(c + 1).filter(v => v !== '');
        const val = rest.length > 0 ? parseNum(rest[0]) : 0;

        if (/insurance payment|check amount/i.test(cell) && c < 4) {
          particulars.checkAmount = val;
        } else if (/patient payment/i.test(cell) && c < 4) {
          particulars.patientPayment = val;
        } else if (/^total$/i.test(cell) && c < 4) {
          particulars.total = val;
        } else if (c >= 3) {
          applyCategoryToPosting(cell, val, promptPosting);
        }
      }
    }

    // Parse Table rows
    if (state === 'TABLE' && activeTableType && activeHeaderMap) {
      const getVal = (pattern) => {
        const idx = activeHeaderMap.findIndex(h => pattern.test(h));
        return idx !== -1 ? row[idx] : '';
      };

      if (activeTableType === 'TB_CHECK') {
        const payer = getVal(/^payer/) || row[1] || row[0];
        if (!payer || /^total/i.test(payer)) continue;

        const payee = getVal(/^payee/) || (activeHeaderMap.includes('payee') ? row[activeHeaderMap.indexOf('payee')] : (row.length >= 15 ? row[0] : ''));
        const eobSource = getVal(/eob source/) || '';
        const eraEob = getVal(/era\/eob/) || '';
        const method = getVal(/^method$/) || 'EFT';
        const checkNo = getVal(/check no|check\s*#|reference/) || row[5] || '';
        const checkDate = formatDateVal(getVal(/check date/) || row[6]);
        const checkAmount = parseNum(getVal(/check amount|payment amount/) || row[7]);
        const postedAmount = parseNum(getVal(/posted amount|total posted/) || row[8]);
        const remainingAmount = parseNum(getVal(/remaining amount|unposted/) || row[9]);
        const recoupment = parseNum(getVal(/recoupment/) || row[10]);
        const status = getVal(/^status$/) || 'Posted';
        const postedDate = formatDateVal(getVal(/posted date/) || row[12] || row[6]);
        const remarks = getVal(/remark/) || '';
        const location = getVal(/location|locations|clinic|facility/) || (row.length >= 15 ? row[14] : '');

        checkRows.push({
          sourceSystem: 'Therabill',
          payee,
          payer,
          eobSource,
          eraEob,
          method,
          paymentMethod: method,
          checkNo,
          paymentReference: checkNo,
          checkDate,
          paymentDate: postedDate || checkDate,
          bankDate: checkDate,
          checkAmount,
          paymentAmount: checkAmount,
          postedAmount,
          totalPosted: postedAmount,
          remainingAmount,
          unposted: remainingAmount,
          recoupment,
          status,
          postedDate,
          remarks,
          location,
        });
      } else if (activeTableType === 'TB_LINE') {
        const patientName = getVal(/client name|patient name/) || row[0];
        if (!patientName || /^total/i.test(patientName)) continue;

        const payerName = getVal(/payer/) || row[1] || '';
        const checkNo = getVal(/check\s*#|check no|reference/) || row[2] || '';
        const checkDate = formatDateVal(getVal(/check date/) || row[3]);
        const dateOfService = formatDateVal(getVal(/dos|service date|date of service/) || row[4]);
        const serviceCode = getVal(/service code/) || row[5] || '';
        const chargedAmount = parseNum(getVal(/charge for service|charged amount|submitted amount/) || row[6]);
        const pmtType = getVal(/pmt type|pr type/) || 'Copay';
        const pmtAmt = parseNum(getVal(/pmt amount|paid amount|payment amount/) || row[8]);
        const isInsurance = /insurance/i.test(pmtType);
        const depositDate = formatDateVal(getVal(/deposit date|bank date/) || row[9]);
        const facilityName = getVal(/facility name|locations|location/) || row[10] || '';

        lineItems.push({
          sourceSystem: 'Therabill',
          patientName,
          clientName: patientName,
          payerName,
          referenceNumber: checkNo,
          checkNo,
          checkDate,
          dateOfService,
          dos: dateOfService,
          serviceCode,
          chargedAmount,
          chargeForService: chargedAmount,
          allowedAmount: 0,
          insurancePayment: isInsurance ? pmtAmt : 0,
          adjustedAmount: 0,
          transferredToSecondary: 0,
          transferredToPatient: 0,
          patientPaid: isInsurance ? 0 : pmtAmt,
          prType: pmtType,
          pmtType,
          pmtAmount: pmtAmt,
          depositDate,
          bankDate: depositDate,
          paymentDate: checkDate,
          location: facilityName,
          facilityName,
        });
      }
    }
  }

  // Fallbacks
  if (particulars.total === 0 && (checkRows.length > 0 || lineItems.length > 0)) {
    const totalInsurance = checkRows.reduce((sum, r) => sum + (r.paymentAmount || 0), 0) ||
      lineItems.reduce((sum, r) => sum + (r.insurancePayment || 0), 0);
    const totalPatient = lineItems.reduce((sum, r) => sum + (r.patientPaid || 0), 0);
    particulars.checkAmount = totalInsurance;
    particulars.patientPayment = totalPatient;
    particulars.total = totalInsurance + totalPatient;
  }
  if (!particulars.total || particulars.total === 0) {
    particulars.total = (particulars.checkAmount || 0) + (particulars.patientPayment || 0);
  }
  if (!promptPosting.grandTotal || promptPosting.grandTotal === 0) {
    promptPosting.grandTotal = (promptPosting.insurancePayment || 0) +
      (promptPosting.recoupmentOffset || 0) +
      (promptPosting.deductible || 0) +
      (promptPosting.coinsurance || 0) +
      (promptPosting.copay || 0) +
      (promptPosting.selfPay || 0) +
      (promptPosting.noShow || 0) +
      (promptPosting.cancellationFee || 0) +
      (promptPosting.dryNeedling || 0) +
      (promptPosting.scottStamp || 0);
  }

  const locationSummary = buildLocationSummary(lineItems, checkRows);

  return {
    detectedFormat: 'therabill',
    formatLabel: 'Therabill Format',
    reportTitle,
    monthYear: monthYear || 'September 2026',
    particulars,
    promptPosting,
    postingSummary: promptPosting,
    locationSummary,
    checkRows,
    lineItems,
  };
}

/**
 * ============================================================================
 * 3. STANDALONE PROMPT FORMAT PARSER
 * ============================================================================
 */
export function parsePromptGrid(grid) {
  let reportTitle = 'Prompt Collection Report';
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
    selfPay: 0,
    noShow: 0,
    cancellationFee: 0,
    dryNeedling: 0,
    scottStamp: 0,
    grandTotal: 0,
  };

  let locationSummary = null;
  const checkRows = [];
  const lineItems = [];

  let state = 'SCAN';
  let payerHeaderIdxs = null;
  let lineItemHeaderIdxs = null;

  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map(v => (v != null ? String(v).trim() : ''));
    if (row.length === 0 || row.every(c => c === '')) continue;

    const rowStr = row.join(' ').toLowerCase();

    // 1. Detect Report Title and Month/Year
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
    if (rowStr.includes('patient name') && (rowStr.includes('date of service') || rowStr.includes('reference') || rowStr.includes('claim') || rowStr.includes('submitted'))) {
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
        location: row.findIndex(c => /location|facility/i.test(c)),
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
          locationSummary = { locations, rows: [] };
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
          sourceSystem: 'Prompt',
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
        sourceSystem: 'Prompt',
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

  // Fallback calculations
  if (particulars.total === 0 && (checkRows.length > 0 || lineItems.length > 0)) {
    const totalInsurance = checkRows.reduce((sum, r) => sum + (r.paymentAmount || 0), 0) ||
      lineItems.reduce((sum, r) => sum + (r.insurancePayment || 0), 0);
    const totalPatient = lineItems.reduce((sum, r) => sum + (r.patientPaid || 0), 0);

    particulars.checkAmount = totalInsurance;
    particulars.patientPayment = totalPatient;
    particulars.total = totalInsurance + totalPatient;
  }
  if (!particulars.total || particulars.total === 0) {
    particulars.total = (particulars.checkAmount || 0) + (particulars.patientPayment || 0);
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
  if (!promptPosting.grandTotal || promptPosting.grandTotal === 0) {
    promptPosting.grandTotal = (promptPosting.insurancePayment || 0) +
      (promptPosting.recoupmentOffset || 0) +
      (promptPosting.deductible || 0) +
      (promptPosting.coinsurance || 0) +
      (promptPosting.copay || 0) +
      (promptPosting.selfPay || 0) +
      (promptPosting.noShow || 0) +
      (promptPosting.cancellationFee || 0) +
      (promptPosting.dryNeedling || 0) +
      (promptPosting.scottStamp || 0);
  }

  if (!locationSummary && (lineItems.length > 0 || checkRows.length > 0)) {
    locationSummary = buildLocationSummary(lineItems, checkRows);
  }

  return {
    detectedFormat: 'prompt',
    formatLabel: 'Prompt Format',
    reportTitle,
    monthYear: monthYear || 'September 2026',
    particulars,
    promptPosting,
    postingSummary: promptPosting,
    locationSummary,
    checkRows,
    lineItems,
  };
}

/**
 * Parses Multi-sheet Excel workbook for Prompt format.
 */
function parseMultiSheetPrompt(wb) {
  let reportTitle = 'Prompt Collection Report';
  let monthYear = '';

  const particulars = { checkAmount: 0, patientPayment: 0, total: 0 };
  const promptPosting = {
    insurancePayment: 0,
    recoupmentOffset: 0,
    deductible: 0,
    coinsurance: 0,
    copay: 0,
    selfPay: 0,
    noShow: 0,
    cancellationFee: 0,
    dryNeedling: 0,
    scottStamp: 0,
    grandTotal: 0,
  };

  const findSheet = (pattern) => wb.worksheets.find(ws => pattern.test(ws.name.trim().toLowerCase()));
  const summarySheet = findSheet(/summary|particular|overview/i) || wb.worksheets[0];
  const checkSheet = findSheet(/prompt\s*-\s*check/i) || findSheet(/check|remit|era/i);
  const lineItemSheet = findSheet(/prompt\s*-\s*line/i) || findSheet(/line\s*item|lineitem|claim|patient/i);

  if (summarySheet) {
    summarySheet.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values.slice(1).map(extractCellValue);
      for (let c = 0; c < vals.length; c++) {
        const cell = String(vals[c] || '').trim();
        if (!cell) continue;

        if (!monthYear && /collection report/i.test(cell)) {
          reportTitle = cell;
          const match = cell.match(/-\s*(?:till\s+)?([A-Za-z]+\s*\d{4})/i) || cell.match(/([A-Za-z]+\s+\d{4})/i);
          if (match) monthYear = match[1];
        }

        const rest = vals.slice(c + 1).filter(v => v !== '' && v != null);
        const nextVal = rest.length > 0 ? parseNum(rest[0]) : 0;

        if (/check amount/i.test(cell)) particulars.checkAmount = nextVal;
        else if (/patient payment/i.test(cell)) particulars.patientPayment = nextVal;
        else if (/^total(\s+amount)?$/i.test(cell)) particulars.total = nextVal;
        else if (/insurance payment/i.test(cell)) promptPosting.insurancePayment = nextVal;
        else if (/recoupment/i.test(cell)) promptPosting.recoupmentOffset = nextVal;
        else if (/deductible/i.test(cell)) promptPosting.deductible = nextVal;
        else if (/coinsurance/i.test(cell)) promptPosting.coinsurance = nextVal;
        else if (/copay/i.test(cell)) promptPosting.copay = nextVal;
        else if (/self pay/i.test(cell)) promptPosting.selfPay = nextVal;
        else if (/no show/i.test(cell)) promptPosting.noShow = nextVal;
        else if (/cancellation/i.test(cell)) promptPosting.cancellationFee = nextVal;
        else if (/dry needling/i.test(cell)) promptPosting.dryNeedling = nextVal;
        else if (/scott stamp/i.test(cell)) promptPosting.scottStamp = nextVal;
        else if (/grand total/i.test(cell)) promptPosting.grandTotal = nextVal;
      }
    });
  }

  const checkRows = [];
  if (checkSheet && checkSheet !== summarySheet) {
    let headerMap = null;
    checkSheet.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values.slice(1).map(extractCellValue);
      if (!headerMap) {
        const rowStr = vals.map(v => String(v || '').trim().toLowerCase()).join(' ');
        if (rowStr.includes('payer') || (rowStr.includes('payment') && rowStr.includes('reference'))) {
          headerMap = vals.map(v => String(v || '').trim().toLowerCase());
        }
        return;
      }
      if (vals.every(v => v == null || String(v).trim() === '')) return;

      const getCol = (pattern, fallbackIdx) => {
        const idx = headerMap.findIndex(h => pattern.test(h));
        return idx !== -1 ? vals[idx] : (fallbackIdx != null ? vals[fallbackIdx] : null);
      };
      const getNumCol = (pattern, fallbackIdx) => parseNum(getCol(pattern, fallbackIdx));

      const payer = String(getCol(/^payer/i, 0) || '').trim();
      if (!payer || /^total/i.test(payer)) return;

      checkRows.push({
        sourceSystem: 'Prompt',
        payer,
        paymentMethod: String(getCol(/method/i, 1) || 'EFT').trim(),
        paymentReference: String(getCol(/reference|check/i, 2) || '').trim(),
        paymentDate: formatDateVal(getCol(/posted\s*date|payment\s*date/i, 3)),
        bankDate: formatDateVal(getCol(/bank\s*date/i, 4)),
        createdBy: String(getCol(/created\s*by/i, 5) || '').trim(),
        paymentAmount: getNumCol(/payment\s*amount|check\s*amount/i, 6),
        totalPosted: getNumCol(/total\s*posted|posted\s*amount/i, 7),
        unposted: getNumCol(/unposted|remaining/i, 8),
        recoupment: getNumCol(/recoup/i, 9),
        location: String(getCol(/location/i, null) || '').trim(),
        remarks: String(getCol(/remark/i, 10) || '').trim(),
      });
    });
  }

  const lineItems = [];
  if (lineItemSheet && lineItemSheet !== summarySheet && lineItemSheet !== checkSheet) {
    let headerMap = null;
    lineItemSheet.eachRow({ includeEmpty: false }, (row) => {
      const vals = row.values.slice(1).map(extractCellValue);
      if (!headerMap) {
        const rowStr = vals.map(v => String(v || '').trim().toLowerCase()).join(' ');
        if (rowStr.includes('patient') || (rowStr.includes('service') && rowStr.includes('amount'))) {
          headerMap = vals.map(v => String(v || '').trim().toLowerCase());
        }
        return;
      }
      if (vals.every(v => v == null || String(v).trim() === '')) return;

      const getCol = (pattern, fallbackIdx) => {
        const idx = headerMap.findIndex(h => pattern.test(h));
        return idx !== -1 ? vals[idx] : (fallbackIdx != null ? vals[fallbackIdx] : null);
      };
      const getNumCol = (pattern, fallbackIdx) => parseNum(getCol(pattern, fallbackIdx));

      const patientName = String(getCol(/^patient(\s*name)?$/i, 0) || '').trim();
      if (!patientName || /^total/i.test(patientName)) return;

      lineItems.push({
        sourceSystem: 'Prompt',
        patientName,
        claimNumber: String(getCol(/claim/i, 1) || '').trim(),
        dateOfService: formatDateVal(getCol(/dos|service\s*date|date\s*of\s*service/i, 2)),
        referenceNumber: String(getCol(/reference|check/i, 3) || '').trim(),
        bankDate: formatDateVal(getCol(/bank\s*date/i, 4)),
        paymentDate: formatDateVal(getCol(/remittance\s*payment|payment\s*date|posting\s*date/i, 5)),
        chargedAmount: getNumCol(/submitted|charge/i, 6),
        allowedAmount: getNumCol(/allowed/i, 7),
        insurancePayment: getNumCol(/paid\s*amount|insurance\s*payment/i, 8),
        adjustedAmount: getNumCol(/adjust/i, 9),
        transferredToSecondary: getNumCol(/secondary/i, 10),
        transferredToPatient: getNumCol(/transferred\s*to\s*patient/i, 11),
        patientPaid: getNumCol(/patient\s*paid|patient\s*pay/i, 12),
        prType: String(getCol(/pr\s*type|pmt\s*type/i, 13) || 'Copay').trim(),
        location: String(getCol(/location|facility/i, null) || '').trim(),
      });
    });
  }

  // Automatic math calculation fallbacks
  if (!particulars.total || particulars.total === 0) {
    const computedTotal = (particulars.checkAmount || 0) + (particulars.patientPayment || 0);
    particulars.total = computedTotal > 0 ? computedTotal : (
      checkRows.reduce((sum, r) => sum + (r.paymentAmount || 0), 0) +
      lineItems.reduce((sum, r) => sum + (r.patientPaid || 0), 0)
    );
  }

  if (!promptPosting.grandTotal || promptPosting.grandTotal === 0) {
    const sumPosting = (promptPosting.insurancePayment || 0) +
      (promptPosting.recoupmentOffset || 0) +
      (promptPosting.deductible || 0) +
      (promptPosting.coinsurance || 0) +
      (promptPosting.copay || 0) +
      (promptPosting.selfPay || 0) +
      (promptPosting.noShow || 0) +
      (promptPosting.cancellationFee || 0) +
      (promptPosting.dryNeedling || 0) +
      (promptPosting.scottStamp || 0);
    promptPosting.grandTotal = sumPosting;
  }

  const locationSummary = buildLocationSummary(lineItems, checkRows);

  return {
    detectedFormat: 'prompt',
    formatLabel: 'Prompt Format',
    reportTitle,
    monthYear: monthYear || 'September 2026',
    particulars,
    promptPosting,
    postingSummary: promptPosting,
    locationSummary,
    checkRows,
    lineItems,
  };
}

/**
 * Parses Multi-sheet Excel workbook for Therabill format.
 */
function parseMultiSheetTherabill(wb) {
  // Convert all sheets into a stacked grid and run parseTherabillGrid
  const combinedGrid = [];
  wb.worksheets.forEach(ws => {
    ws.eachRow({ includeEmpty: true }, (row) => {
      combinedGrid.push(row.values.slice(1).map(v => {
        const val = extractCellValue(v);
        return val != null ? String(val).trim() : '';
      }));
    });
  });
  return parseTherabillGrid(combinedGrid);
}

/**
 * Parses Multi-sheet Excel workbook containing both Prompt and Therabill.
 */
function parseMultiSheetHybrid(wb) {
  const combinedGrid = [];
  wb.worksheets.forEach(ws => {
    ws.eachRow({ includeEmpty: true }, (row) => {
      combinedGrid.push(row.values.slice(1).map(v => {
        const val = extractCellValue(v);
        return val != null ? String(val).trim() : '';
      }));
    });
  });
  return parseCombinedGrid(combinedGrid);
}

// Helpers
function applyCategoryToPosting(catStr, val, targetObj) {
  const c = String(catStr).toLowerCase().trim();
  if (/coinsurance/i.test(c) || /^coins/i.test(c)) targetObj.coinsurance = val;
  else if (/^insurance|insurance\s*payment/i.test(c)) targetObj.insurancePayment = val;
  else if (/recoupment/i.test(c)) targetObj.recoupmentOffset = val;
  else if (/deductible/i.test(c)) targetObj.deductible = val;
  else if (/copay/i.test(c)) targetObj.copay = val;
  else if (/self pay/i.test(c)) targetObj.selfPay = val;
  else if (/no show/i.test(c)) targetObj.noShow = val;
  else if (/cancellation/i.test(c)) targetObj.cancellationFee = val;
  else if (/dry needling/i.test(c)) targetObj.dryNeedling = val;
  else if (/scott stamp/i.test(c)) targetObj.scottStamp = val;
  else if (/grand total/i.test(c)) targetObj.grandTotal = val;
}

function combinePostingSummaries(combined, tb, pr) {
  const keys = Object.keys(combined);
  keys.forEach(k => {
    combined[k] = (tb[k] || 0) + (pr[k] || 0);
  });
}

function mergeLocationSummaries(tb, pr) {
  if (!tb && !pr) return null;
  if (!tb) return pr;
  if (!pr) return tb;

  const locSet = new Set([...tb.locations, ...pr.locations]);
  const locations = Array.from(locSet);

  const rowMap = new Map();
  [...tb.rows, ...pr.rows].forEach(r => {
    if (!rowMap.has(r.type)) {
      rowMap.set(r.type, { type: r.type, total: 0 });
    }
    const target = rowMap.get(r.type);
    locations.forEach(loc => {
      const v = r[loc] || 0;
      target[loc] = (target[loc] || 0) + v;
    });
  });

  const mergedRows = Array.from(rowMap.values()).map(r => {
    let t = 0;
    locations.forEach(loc => { t += (r[loc] || 0); });
    r.total = t;
    return r;
  });

  return { locations, rows: mergedRows };
}

export function buildLocationSummary(lineItems, checkRows) {
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
