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
function cleanStr(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Matches extracted PDFs to validated statement rows.
 * Uses a multi-heuristic scoring approach:
 *   1. Exact account number
 *   2. Account number + patient name in filename
 *   3. Exact patient name
 *   4. Account number as distinct token (e.g. stmt_12345.pdf)
 *   5. Normalized account number without leading zeros
 *   6. Patient name parts reversed (e.g. Doe, John vs John Doe)
 *   7. Row index match (e.g. row_1.pdf, 1.pdf)
 *   8. Sequential 1-to-1 fallback if counts match exactly
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

    for (let pIdx = 0; pIdx < pdfEntries.length; pIdx++) {
      const pdf = pdfEntries[pIdx];
      const nameWithoutExt = pdf.originalFilename.replace(/\.pdf$/i, '').trim();
      const cleanName = cleanStr(nameWithoutExt);

      let score = 0;

      // 1. Exact match on clean account number
      if (cleanAcct && cleanName === cleanAcct) {
        score = 100;
      }
      // 2. Both account number and patient name in filename
      else if (cleanAcct && cleanPat && cleanName.includes(cleanAcct) && cleanName.includes(cleanPat)) {
        score = 98;
      }
      // 3. Exact match on clean patient name
      else if (cleanPat && cleanName === cleanPat) {
        score = 95;
      }
      // 4. Stripped account prefix matches (e.g. ACC-1001 vs 1001.pdf)
      else if (
        cleanAcct.replace(/^[a-z]+/, '') &&
        cleanAcct.replace(/^[a-z]+/, '').length >= 3 &&
        (cleanAcct.replace(/^[a-z]+/, '') === cleanName ||
          cleanAcct.replace(/^[a-z]+/, '') === cleanName.replace(/^[a-z]+/, ''))
      ) {
        score = 93;
      }
      // 5. Exact account number delimited by non-alphanumeric chars or start/end
      else if (
        cleanAcct &&
        cleanAcct.length >= 3 &&
        new RegExp(`(^|[^a-z0-9])${cleanAcct}([^a-z0-9]|$)`, 'i').test(nameWithoutExt)
      ) {
        score = 92;
      }
      // 6. Digits-only match (e.g. ACC-1001 vs statement_1001.pdf)
      else if (
        cleanAcct.replace(/\D/g, '').length >= 3 &&
        cleanAcct.replace(/\D/g, '') === cleanName.replace(/\D/g, '')
      ) {
        score = 91;
      }
      // 7. Account number without leading zeros matches
      else if (
        cleanAcct &&
        cleanAcct.replace(/^0+/, '') &&
        cleanAcct.replace(/^0+/, '') === cleanName.replace(/^0+/, '')
      ) {
        score = 90;
      }
      // 6. Patient reversed name matches (e.g. "doe john" vs "john doe")
      else if (patParts.length >= 2 && patParts.slice().reverse().join('') === cleanName) {
        score = 88;
      }
      // 7. All patient name parts appear in filename
      else if (patParts.length >= 2 && patParts.every((part) => nameWithoutExt.toLowerCase().includes(part))) {
        score = 85;
      }
      // 8. Filename contains account number (at least 4 chars)
      else if (cleanAcct && cleanAcct.length >= 4 && cleanName.includes(cleanAcct)) {
        score = 80;
      }
      // 9. Row number match (e.g. "1.pdf", "row_1.pdf")
      else if (
        cleanName === String(row.rowNumber) ||
        cleanName === `row${row.rowNumber}` ||
        cleanName === `statement${row.rowNumber}`
      ) {
        score = 75;
      }

      if (score > 0) {
        scoredPairs.push({ rIdx, pIdx, score });
      }
    }
  }

  // Greedy highest-score 1-to-1 matching
  scoredPairs.sort((a, b) => b.score - a.score);

  const matchedRows = new Set();
  const matchedPdfs = new Set();
  const assignments = new Map();

  for (const pair of scoredPairs) {
    if (!matchedRows.has(pair.rIdx) && !matchedPdfs.has(pair.pIdx)) {
      matchedRows.add(pair.rIdx);
      matchedPdfs.add(pair.pIdx);
      assignments.set(pair.rIdx, pair.pIdx);
    }
  }

  // Sequential 1-to-1 fallback if counts match exactly and none matched
  if (matchedRows.size === 0 && pdfEntries.length === rows.length) {
    for (let i = 0; i < rows.length; i++) {
      assignments.set(i, i);
      matchedRows.add(i);
      matchedPdfs.add(i);
    }
  }

  return {
    assignments,
    matchedCount: matchedRows.size,
    unmatchedRowsCount: rows.length - matchedRows.size,
    unmatchedPdfsCount: pdfEntries.length - matchedPdfs.size,
  };
}
