import pg from 'pg';
const { Pool } = pg;
import { runMigrations } from './migrations-runner.js';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production' && process.env.DB_SSL !== 'false'
      ? { rejectUnauthorized: process.env.DB_SSL_VERIFY !== 'false' }
      : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function initDb(maxRetries = 5, delayMs = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('[db] PostgreSQL connected');
      await runMigrations(pool);
      return;
    } catch (err) {
      console.error(`[db] Connection attempt ${i + 1}/${maxRetries} failed: ${err.message}`);
      if (i === maxRetries - 1) {
        console.error('[db] FATAL: Could not connect to database after all retries.');
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
}

export const db = {
  query(sql, params) {
    return pool.query(sql, params);
  },
  exec(sql) {
    return pool.query(sql);
  },
  async transaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
  end() {
    return pool.end();
  },
};

export default db;
