import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabaseConnection, pool } from '../src/config/database.js';

const migrationsDirectory = fileURLToPath(new URL('../database/migrations/', import.meta.url));
const baselineOnly = process.argv.includes('--baseline');

async function run() {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
  );

  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith('.sql'))
    .sort();
  const appliedResult = await pool.query('SELECT filename FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map((row) => row.filename));

  for (const filename of filenames) {
    if (applied.has(filename)) {
      continue;
    }

    if (!baselineOnly) {
      const sql = await readFile(path.join(migrationsDirectory, filename), 'utf8');
      await pool.query(sql);
    }

    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
    console.log(`${baselineOnly ? 'Baselined' : 'Applied'} migration ${filename}.`);
  }

  console.log(baselineOnly ? 'Migration baseline recorded.' : 'Database migrations are up to date.');
}

try {
  await run();
} finally {
  await closeDatabaseConnection();
}
