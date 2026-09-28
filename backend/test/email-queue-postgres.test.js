import { describe, it, expect } from 'vitest';
import pg from 'pg';
import { runMigrations } from '../src/migrations-runner.js';

/**
 * Verifies the pgboss schema half of the email queue against a real Postgres.
 *
 * The unit tests in email-queue.test.js stub pg-boss, so they can't catch the
 * thing most likely to break in production: that the app's DB role can't
 * actually create pg-boss's tables inside the schema migration 023 creates.
 * That needs a live server, so this file only runs in the `test-backend` job.
 */

async function createFreshDb(prefix) {
  const baseUrl = process.env.DATABASE_URL.replace(/\/[^/]+$/, '');
  const dbName = `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  const adminPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
  await adminPool.query(`CREATE DATABASE ${dbName}`);
  await adminPool.end();

  const pool = new pg.Pool({ connectionString: `${baseUrl}/${dbName}` });
  return {
    pool,
    // pg-boss takes a connection string, not a pool. Handing it the fresh
    // database explicitly matters: process.env.DATABASE_URL still points at
    // the shared per-run database, so using that here would migrate one
    // database and then queue against another.
    connectionString: `${baseUrl}/${dbName}`,
    async cleanup() {
      await pool.end();
      const cleanupPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
      await cleanupPool.query(`DROP DATABASE IF EXISTS ${dbName}`);
      await cleanupPool.end();
    },
  };
}

describe('email queue: pgboss schema', () => {
  it('migration 023 creates the pgboss schema', async () => {
    const { pool, cleanup } = await createFreshDb('alux_pgboss_schema');
    try {
      await runMigrations(pool);
      const { rows } = await pool.query(
        `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'pgboss'`
      );
      expect(rows).toHaveLength(1);
    } finally {
      await cleanup();
    }
  }, 30_000);

  it('lets pg-boss install its own tables without CREATE SCHEMA', async () => {
    // The whole reason the schema is created by a migration rather than by
    // pg-boss's createSchema option. If this fails in production, every email
    // silently degrades to the un-retried fallback.
    const { pool, connectionString, cleanup } = await createFreshDb('alux_pgboss_install');
    let boss = null;
    try {
      await runMigrations(pool);
      const { PgBoss } = await import('pg-boss');
      boss = new PgBoss({ connectionString, schema: 'pgboss', createSchema: false });
      await boss.start();

      const { rows } = await pool.query(
        `SELECT count(*)::int AS n
         FROM information_schema.tables
         WHERE table_schema = 'pgboss'`
      );
      expect(rows[0].n).toBeGreaterThan(0);
    } finally {
      if (boss) await boss.stop().catch(() => {});
      await cleanup();
    }
  }, 60_000);

  it('delivers, retries a failed send, and completes the job', async () => {
    // End-to-end against real Postgres: this is the durability claim. A send
    // that fails twice must still be delivered on the third attempt, and the
    // job must end 'completed' rather than 'failed'.
    const { pool, connectionString, cleanup } = await createFreshDb('alux_pgboss_e2e');
    let boss = null;
    try {
      await runMigrations(pool);
      const { PgBoss } = await import('pg-boss');
      boss = new PgBoss({ connectionString, schema: 'pgboss', createSchema: false });
      await boss.start();
      await boss.createQueue('email', {
        retryLimit: 5,
        retryDelay: 1,
        retryBackoff: true,
        retryDelayMax: 60,
        expireInSeconds: 300,
        retentionSeconds: 3600,
      });

      let attempts = 0;
      await boss.work('email', { batchSize: 1 }, async (arg) => {
        const job = Array.isArray(arg) ? arg[0] : arg;
        if (!job) return;
        attempts += 1;
        if (attempts < 3) throw new Error('simulated Resend 503');
      });

      const jobId = await boss.send('email', { kind: 'verification', payload: { email: 'a@b.c' } });
      expect(jobId).toBeTruthy();

      let final = null;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const jobs = await boss.findJobs('email', { id: jobId });
        if (jobs.length && ['completed', 'failed'].includes(jobs[0].state)) {
          final = jobs[0];
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }

      expect(final, 'job never reached a terminal state').not.toBeNull();
      expect(final.state).toBe('completed');
      expect(attempts).toBeGreaterThanOrEqual(3);
    } finally {
      if (boss) await boss.stop().catch(() => {});
      await cleanup();
    }
  }, 60_000);
});
