import fs from 'node:fs';
import path from 'node:path';
import { pool, query } from '../src/db/pool.js';
import { config } from '../src/config.js';

async function cleanDemoData() {
  console.log('--- Cleaning Demo Data from Supabase Database ---');

  const client = await pool.connect();
  try {
    console.log('Disabling user immutability triggers for cleanup...');
    await client.query('ALTER TABLE remark DISABLE TRIGGER trg_remark_immutable');
    await client.query('ALTER TABLE statement_file DISABLE TRIGGER trg_statement_file_immutable');
    await client.query('ALTER TABLE statement DISABLE TRIGGER trg_statement_immutable');
    await client.query('ALTER TABLE audit_event DISABLE TRIGGER trg_audit_immutable');
    await client.query('ALTER TABLE audit_event DISABLE TRIGGER trg_audit_no_truncate');

    console.log('1. Deleting remarks...');
    const rRes = await client.query('DELETE FROM remark');
    console.log(`   Deleted ${rRes.rowCount} remarks.`);

    console.log('2. Deleting statement files and storage objects...');
    const sfRes = await client.query('DELETE FROM statement_file');
    const soRes = await client.query('DELETE FROM storage_object').catch(() => ({ rowCount: 0 }));
    console.log(`   Deleted ${sfRes.rowCount} statement files and ${soRes.rowCount} storage objects.`);

    console.log('3. Deleting import rows and drafts...');
    const irRes = await client.query('DELETE FROM import_row');
    const udRes = await client.query('DELETE FROM upload_draft');
    console.log(`   Deleted ${irRes.rowCount} import rows and ${udRes.rowCount} drafts.`);

    console.log('4. Deleting statements (child versions first, then base versions)...');
    const sChild = await client.query('DELETE FROM statement WHERE supersedes_id IS NOT NULL');
    const sBase = await client.query('DELETE FROM statement');
    console.log(`   Deleted ${sChild.rowCount} updated versions and ${sBase.rowCount} base statements.`);

    console.log('5. Deleting import batches...');
    const ibRes = await client.query('DELETE FROM import_batch');
    console.log(`   Deleted ${ibRes.rowCount} import batches.`);

    console.log('6. Cleaning statement/import audit events...');
    const aeRes = await client.query(
      "DELETE FROM audit_event WHERE target_type IN ('statement', 'import_batch', 'remark', 'file', 'upload_draft')"
    );
    console.log(`   Deleted ${aeRes.rowCount} audit events.`);
  } catch (err) {
    console.error('Error during step:', err.message);
  } finally {
    console.log('Re-enabling all triggers...');
    await client.query('ALTER TABLE remark ENABLE TRIGGER trg_remark_immutable').catch(() => {});
    await client.query('ALTER TABLE statement_file ENABLE TRIGGER trg_statement_file_immutable').catch(() => {});
    await client.query('ALTER TABLE statement ENABLE TRIGGER trg_statement_immutable').catch(() => {});
    await client.query('ALTER TABLE audit_event ENABLE TRIGGER trg_audit_immutable').catch(() => {});
    await client.query('ALTER TABLE audit_event ENABLE TRIGGER trg_audit_no_truncate').catch(() => {});
    client.release();
  }

  // Clean local storage files
  try {
    const storageDir = config.storageDir;
    if (storageDir && fs.existsSync(storageDir)) {
      console.log('7. Cleaning local storage files in', storageDir);
      const subdirs = ['statements', 'drafts', 'imports'];
      for (const sub of subdirs) {
        const p = path.join(storageDir, sub);
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
          fs.mkdirSync(p, { recursive: true });
        }
      }
      console.log('   Storage subdirectories emptied.');
    }
  } catch (err) {
    console.warn('   Note: Could not clean local storage dir:', err.message);
  }

  // Display remaining table counts
  console.log('\n--- Current Database Summary ---');
  const tables = ['clinic', 'app_user', 'statement', 'remark', 'import_batch', 'statement_file', 'audit_event'];
  for (const t of tables) {
    const c = await query(`SELECT count(*)::int as c FROM "${t}"`);
    console.log(`- ${t}: ${c.rows[0].c} records`);
  }

  console.log('\nDemo data successfully removed! The portal now has a clean slate for real statements.');
}

cleanDemoData()
  .catch((err) => {
    console.error('Cleanup failed:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
