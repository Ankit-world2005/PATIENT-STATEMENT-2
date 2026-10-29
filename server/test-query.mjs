import { readFile } from 'node:fs/promises';
import { parseImportFile } from './src/services/imports/parse.js';
import { validateRows, markDuplicates } from './src/services/imports/validate.js';
import { pool } from './src/db/pool.js';

async function testNamaste() {
  try {
    const buffer = await readFile('../DOCS/Namaste Rehab Clinics LLC.xlsx');
    console.log('Read Namaste file, size:', buffer.length);
    const parsed = await parseImportFile(buffer, 'Namaste Rehab Clinics LLC.xlsx');
    console.log('Parsed successfully! Total rows:', parsed.rows.length, 'Ignored:', parsed.ignoredColumns);
    const validated = validateRows(parsed.rows);
    console.log('Validated rows! Outcomes:', {
      valid: validated.filter(r => r.outcome === 'valid').length,
      invalid: validated.filter(r => r.outcome === 'invalid').length,
      duplicate: validated.filter(r => r.outcome === 'duplicate').length,
    });
    const marked = await markDuplicates(pool, '1629c91c-66d9-4210-b927-7f58f60f3e84', validated);
    console.log('Marked duplicates successfully! Duplicates:', marked.filter(r => r.outcome === 'duplicate').length);
  } catch (err) {
    console.error('FAILED with error:', err);
  }
  await pool.end();
}

testNamaste();
