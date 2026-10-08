import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../src/migrations-runner.js';

// Runs against a second, throwaway database (not the one setup.js already
// migrated for the rest of the suite) specifically so this file can test
// runMigrations() against a genuinely fresh, unmigrated database — the
// shared test DB from setup.js already has all migrations applied by the
// time any test file runs.
async function createFreshUnmigratedDb() {
  const baseUrl = process.env.DATABASE_URL.replace(/\/[^/]+$/, '');
  const dbName = `alux_migtest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const adminPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
  await adminPool.query(`CREATE DATABASE ${dbName}`);
  await adminPool.end();

  const pool = new pg.Pool({ connectionString: `${baseUrl}/${dbName}` });
  return {
    pool,
    async cleanup() {
      await pool.end();
      const cleanupPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
      await cleanupPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await cleanupPool.end();
    },
  };
}

describe('migrations-runner.js', () => {
  it('applies all migrations to a brand-new database', async () => {
    const { pool, cleanup } = await createFreshUnmigratedDb();
    try {
      const count = await runMigrations(pool);
      expect(count).toBeGreaterThanOrEqual(2); // 001_init + 002_add_metrics_table at minimum

      const { rows } = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
      );
      const tables = rows.map((r) => r.table_name);
      expect(tables).toEqual(
        expect.arrayContaining(['contacts', 'admin_users', 'metrics', '_migrations'])
      );
    } finally {
      await cleanup();
    }
  });

  it('is idempotent - running twice applies nothing the second time', async () => {
    const { pool, cleanup } = await createFreshUnmigratedDb();
    try {
      await runMigrations(pool);
      const secondRunCount = await runMigrations(pool);
      expect(secondRunCount).toBe(0);
    } finally {
      await cleanup();
    }
  });

  it('records every applied migration in the _migrations ledger', async () => {
    const { pool, cleanup } = await createFreshUnmigratedDb();
    try {
      await runMigrations(pool);
      const { rows } = await pool.query('SELECT filename FROM _migrations');
      const applied = rows.map((r) => r.filename);
      expect(applied).toEqual(
        expect.arrayContaining(['001_init.sql', '002_add_metrics_table.sql'])
      );
    } finally {
      await cleanup();
    }
  });
});
