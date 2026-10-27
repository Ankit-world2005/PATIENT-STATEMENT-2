import crypto from 'node:crypto';
import path from 'node:path';
import JSZip from 'jszip';
import { badRequest } from '../../lib/errors.js';
import { sha256Hex, statementFileKey, storage } from '../../lib/storage.js';

/**
 * Extracts and validates all PDF files inside an uploaded ZIP buffer.
 * Filters out macOS metadata, directories, and non-PDF files.
 * Returns an array of { originalFilename, relativePath, buffer, sizeBytes, sha256 }
 */
export async function extractPdfsFromZip(zipBuffer) {
  if (!zipBuffer || zipBuffer.length === 0) {
    throw badRequest('Upload the ZIP file containing statement PDFs.', {
      zip: 'Upload a .zip file containing statement PDFs.',
    });
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(zipBuffer);
  } catch (err) {
    throw badRequest('The uploaded file is not a valid ZIP archive.', {
      zip: 'The uploaded file is not a valid ZIP archive.',
    });
  }

  const pdfEntries = [];
  for (const [relativePath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const baseName = path.basename(relativePath);
    // Ignore hidden files, macOS metadata, and non-pdf files
    if (baseName.startsWith('.') || relativePath.includes('__MACOSX') || relativePath.includes('/.')) continue;
    if (!/\.pdf$/i.test(baseName)) continue;

    const buffer = await entry.async('nodebuffer');
    // Validate PDF magic bytes (%PDF)
    if (buffer.length < 5 || buffer.slice(0, 4).toString() !== '%PDF') continue;

    pdfEntries.push({
      originalFilename: baseName,
      relativePath,
      buffer,
      sizeBytes: buffer.length,
      sha256: sha256Hex(buffer),
    });
  }

  if (pdfEntries.length === 0) {
    throw badRequest('No valid statement PDFs were found inside the ZIP file.', {
      zip: 'The ZIP archive must contain at least one .pdf statement file.',
    });
  }

  return pdfEntries;
}

/**
 * Normalizes a string for matching (lowercase, alphanumeric only).
 */
export function cleanStr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Parses the specialist PDF naming syntax:
 *   Patient Name_$00.00_West AZ_1st or 2nd or 3rd.pdf
 * (e.g. "Dolores Beatty_$538.91_West AZ_1st.pdf" or "John Doe_$00.00_West AZ_2nd.pdf")
 */
export function parsePatientStatementPdfSyntax(filename) {
  const base = filename.replace(/\.pdf$/i, '').trim();
  const segments = base.split('_').map((s) => s.trim()).filter(Boolean);

  if (segments.length >= 2) {
    // Find amount segment (e.g. "$538.91", "$00.00", "538.91", "$1,200.50")
    let amountStr = null;
    let amountNum = null;
    let amountIdx = -1;
    for (let i = 1; i < segments.length; i++) {
      const match = segments[i].match(/^\$?(-?[\d,]+(?:\.\d{1,2})?)$/);
      if (match) {
        amountStr = match[1].replace(/,/g, '');
        amountNum = parseFloat(amountStr);
        amountIdx = i;
        break;
      }
    }

    // Patient name is everything before the amount segment (supports "lastname, Firstname" or "lastname_Firstname")
    const nameSegments = amountIdx > 1 ? segments.slice(0, amountIdx) : [segments[0]];
    const rawPatientName = nameSegments.join(' ').replace(/\s*,\s*/g, ', ');

    // Find cycle segment (e.g. "1st", "2nd", "3rd", "1st Electronic Statement", "cycle 1", etc.)
    let cycleStr = null;
    let cycleNum = null;
    let cycleIdx = -1;
    for (let i = 1; i < segments.length; i++) {
      if (i === amountIdx || (amountIdx > 1 && i < amountIdx)) continue;
      const cMatch = segments[i].match(/^(1st|2nd|3rd|1|2|3)\b/i);
      if (cMatch) {
        cycleStr = cMatch[1].toLowerCase();
        cycleNum = cycleStr.startsWith('1') ? 1 : cycleStr.startsWith('2') ? 2 : 3;
        cycleIdx = i;
        break;
      }
    }

    // Remaining segments represent location / clinic (e.g. "West AZ")
    const locationSegments = segments.filter((_, idx) => {
      if (amountIdx > 1 ? idx < amountIdx : idx === 0) return false;
      if (idx === amountIdx || idx === cycleIdx) return false;
      return true;
    });
    const locationStr = locationSegments.join(' ');

    return {
      isSyntaxMatch: true,
      patientName: rawPatientName,
      cleanPatientName: cleanStr(rawPatientName),
      amountStr,
      amountNum,
      cycleStr,
      cycleNum,
      locationStr,
      cleanLocation: cleanStr(locationStr),
    };
  }

  return {
    isSyntaxMatch: false,
    patientName: null,
    cleanPatientName: '',
    amountStr: null,
    amountNum: null,
    cycleStr: null,
    cycleNum: null,
    locationStr: '',
    cleanLocation: '',
  };
}

/**
 * Matches extracted PDFs to validated statement rows.
 * Supports:
 *   1. Specialist Syntax: lastname, Firstname_$00.00_West AZ_1st (Scores 105 - 125)
 *   2. Exact account number (Score 100)
 *   3. Account number + patient name in filename (Score 98)
 *   4. Exact patient name (Score 95)
 *   5. Stripped account prefix / digits match (Score 91 - 93)
 *   6. Reversed patient name (Score 88)
 *   7. Sequential 1-to-1 fallback if counts match exactly
 */
export function matchPdfsToRows(pdfEntries, rows) {
  const scoredPairs = [];

  for (let rIdx = 0; rIdx < rows.length; rIdx++) {
    const row = rows[rIdx];
    const data = row.data || row.raw || {};
    const acct = String(data.account_number || '').trim();
    const cleanAcct = cleanStr(acct);
    const patName = String(data.patient_name || '').trim();
    const cleanPat = cleanStr(patName);
    const patParts = patName.toLowerCase().split(/[\s,._-]+/).filter((p) => p.length >= 2);
    const rowBalances = [
      data.balance_due,
      data.current_balance,
      data.cycle1_balance,
      data.cycle2_balance,
      data.cycle3_balance,
    ]
      .filter((v) => v !== undefined && v !== null && v !== '')
      .map(Number);
    const rowLoc = cleanStr(data.location_name || data.location);

    for (let pIdx = 0; pIdx < pdfEntries.length; pIdx++) {
      const pdf = pdfEntries[pIdx];
      const nameWithoutExt = pdf.originalFilename.replace(/\.pdf$/i, '').trim();
      const cleanName = cleanStr(nameWithoutExt);

      let score = 0;

      // Check specialist syntax: lastname, Firstname_$00.00_West AZ_1st or 2nd or 3rd
      const syntax = parsePatientStatementPdfSyntax(pdf.originalFilename);
      if (syntax.isSyntaxMatch && syntax.cleanPatientName && cleanPat) {
        const sPat = syntax.cleanPatientName;
        const sPatParts = (syntax.patientName || '').toLowerCase().split(/[\s,._-]+/).filter((p) => p.length >= 2);

        // Token match: check if first & last name parts appear in both (handles lastname, Firstname vs Firstname Lastname)
        const sharedParts = sPatParts.filter((p) => patParts.includes(p));
        const tokenMatch = (sPatParts.length >= 2 && sharedParts.length >= 2) ||
                           (sPatParts.length === 1 && patParts.includes(sPatParts[0]));

        const isNameMatch =
          cleanPat === sPat ||
          (patParts.length >= 2 && patParts.slice().reverse().join('') === sPat) ||
          (sPatParts.length >= 2 && sPatParts.slice().reverse().join('') === cleanPat) ||
          tokenMatch ||
          (cleanPat.length >= 5 && sPat.includes(cleanPat)) ||
          (sPat.length >= 5 && cleanPat.includes(sPat));

        if (isNameMatch) {
          let syntaxScore = 110;

          // Balance verification
          if (syntax.amountNum !== null && rowBalances.some((b) => Math.abs(b - syntax.amountNum) < 0.01)) {
            syntaxScore += 10;
          }

          // Location verification (e.g. "West AZ")
          if (syntax.cleanLocation && rowLoc && (rowLoc.includes(syntax.cleanLocation) || syntax.cleanLocation.includes(rowLoc))) {
            syntaxScore += 5;
          }

          // Cycle verification
          if (syntax.cycleNum) {
            syntaxScore += 2;
          }

          score = Math.max(score, syntaxScore);
        }
      }

      // Standard account number & name heuristics
      // 1. Exact match on clean account number
      if (cleanAcct && cleanName === cleanAcct) {
        score = Math.max(score, 100);
      }
      // 2. Both account number and patient name in filename
      else if (cleanAcct && cleanPat && cleanName.includes(cleanAcct) && cleanName.includes(cleanPat)) {
        score = Math.max(score, 98);
      }
      // 3. Exact match on clean patient name
      else if (cleanPat && cleanName === cleanPat) {
        score = Math.max(score, 95);
      }
      // 4. Stripped account prefix matches (e.g. ACC-1001 vs 1001.pdf)
      else if (
        cleanAcct.replace(/^[a-z]+/, '') &&
        cleanAcct.replace(/^[a-z]+/, '').length >= 3 &&
        (cleanAcct.replace(/^[a-z]+/, '') === cleanName ||
          cleanAcct.replace(/^[a-z]+/, '') === cleanName.replace(/^[a-z]+/, ''))
      ) {
        score = Math.max(score, 93);
      }
      // 5. Exact account number delimited by non-alphanumeric chars or start/end
      else if (
        cleanAcct &&
        cleanAcct.length >= 3 &&
        new RegExp(`(^|[^a-z0-9])${cleanAcct}([^a-z0-9]|$)`, 'i').test(nameWithoutExt)
      ) {
        score = Math.max(score, 92);
      }
      // 6. Digits-only match (e.g. ACC-1001 vs statement_1001.pdf)
      else if (
        cleanAcct.replace(/\D/g, '').length >= 3 &&
        cleanAcct.replace(/\D/g, '') === cleanName.replace(/\D/g, '')
      ) {
        score = Math.max(score, 91);
      }
      // 7. Account number without leading zeros matches
      else if (
        cleanAcct &&
        cleanAcct.replace(/^0+/, '') &&
        cleanAcct.replace(/^0+/, '') === cleanName.replace(/^0+/, '')
      ) {
        score = Math.max(score, 90);
      }
      // 8. Patient reversed name matches (e.g. "doe john" vs "john doe")
      else if (patParts.length >= 2 && patParts.slice().reverse().join('') === cleanName) {
        score = Math.max(score, 88);
      }
      // 9. All patient name parts appear in filename
      else if (patParts.length >= 2 && patParts.every((part) => nameWithoutExt.toLowerCase().includes(part))) {
        score = Math.max(score, 85);
      }
      // 10. Filename contains account number (at least 4 chars)
      else if (cleanAcct && cleanAcct.length >= 4 && cleanName.includes(cleanAcct)) {
        score = Math.max(score, 80);
      }
      // 11. Row number match (e.g. "1.pdf", "row_1.pdf")
      else if (
        cleanName === String(row.rowNumber) ||
        cleanName === `row${row.rowNumber}` ||
        cleanName === `statement${row.rowNumber}`
      ) {
        score = Math.max(score, 75);
      }

      if (score > 0) {
        scoredPairs.push({ rIdx, pIdx, score });
      }
    }
  }

  // Sort highest scores first
  scoredPairs.sort((a, b) => b.score - a.score);

  const matchedRows = new Set();
  const matchedPdfs = new Set();
  const assignments = new Map(); // rIdx -> primary pIdx
  const rowPdfs = new Map();     // rIdx -> number[]

  for (const pair of scoredPairs) {
    if (!matchedPdfs.has(pair.pIdx)) {
      matchedPdfs.add(pair.pIdx);
      matchedRows.add(pair.rIdx);

      if (!rowPdfs.has(pair.rIdx)) {
        rowPdfs.set(pair.rIdx, []);
      }
      rowPdfs.get(pair.rIdx).push(pair.pIdx);

      if (!assignments.has(pair.rIdx)) {
        assignments.set(pair.rIdx, pair.pIdx);
      }
    }
  }

  // Sequential 1-to-1 fallback if counts match exactly and none matched
  if (matchedRows.size === 0 && pdfEntries.length === rows.length) {
    for (let i = 0; i < rows.length; i++) {
      assignments.set(i, i);
      rowPdfs.set(i, [i]);
      matchedRows.add(i);
      matchedPdfs.add(i);
    }
  }

  return {
    assignments,
    rowPdfs,
    matchedCount: matchedRows.size,
    matchedPdfsCount: matchedPdfs.size,
    unmatchedRowsCount: rows.length - matchedRows.size,
    unmatchedPdfsCount: pdfEntries.length - matchedPdfs.size,
  };
}
