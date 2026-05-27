import pg from 'pg';
import { env } from './env.js';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.dbSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error.message);
});

export async function checkDatabaseConnection() {
  const result = await pool.query('SELECT NOW() AS server_time');
  return result.rows[0].server_time;
}

export async function closeDatabaseConnection() {
  await pool.end();
}
