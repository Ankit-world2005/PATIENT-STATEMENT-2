import { pool, query } from '../src/db/pool.js';

async function main() {
  try {
    console.log('Connecting to Azure PostgreSQL database...\n');
    
    // 1. Get all tables in public schema
    const tablesRes = await query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename;
    `);

    if (tablesRes.rows.length === 0) {
      console.log('No tables found in public schema.');
      return;
    }

    console.log('=== Tables and Record Counts ===');
    const tableCounts = [];
    for (const row of tablesRes.rows) {
      const countRes = await query(`SELECT COUNT(*) as count FROM "${row.tablename}"`);
      tableCounts.push({
        'Table Name': row.tablename,
        'Total Records': parseInt(countRes.rows[0].count, 10),
      });
    }
    console.table(tableCounts);

    // 2. Sample data from key tables
    const keyTables = ['clinic', 'app_user', 'patient', 'statement', 'patient_ledger'];

    for (const tbl of keyTables) {
      const exists = tablesRes.rows.some((r) => r.tablename === tbl);
      if (!exists) continue;

      console.log(`\n=== Recent records from: ${tbl} ===`);
      // Omit sensitive columns like password_hash or totp_secret_enc
      let selectClause = '*';
      if (tbl === 'app_user') {
        selectClause = 'id, email, full_name, role, status, last_login, created_at';
      }

      const sampleRes = await query(`SELECT ${selectClause} FROM "${tbl}" ORDER BY created_at DESC LIMIT 5`);
      if (sampleRes.rows.length === 0) {
        console.log(`(Table "${tbl}" is empty)`);
      } else {
        console.table(sampleRes.rows);
      }
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('\nDatabase query error:', err.message);
  } finally {
    await pool.end();
  }
}

main();
