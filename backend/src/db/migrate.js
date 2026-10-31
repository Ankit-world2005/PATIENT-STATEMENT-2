export { migrate } from '../../../database/migrate.js';

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from '../../../database/migrate.js';
import { pool } from '../../../database/pool.js';

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntry) {
  const reset = process.argv.includes('--reset');
  migrate({ reset })
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
