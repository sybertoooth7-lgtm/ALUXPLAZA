// Runs before any test file's imports. Sets required env vars to safe test
// values BEFORE db.js/config.js are ever imported, since those modules read
// process.env at module-load time.
//
// Requires a real, reachable PostgreSQL server — set TEST_DATABASE_URL to
// point at one (a throwaway local Postgres, or a dedicated CI service
// container). A fresh, uniquely-named database is created and migrated
// once per test run, then dropped at the end.
import { afterAll } from 'vitest';
import pg from 'pg';

const adminUrl = process.env.TEST_DATABASE_URL || 'postgresql://alux:test@localhost:5432/postgres';
const testDbName = `alux_test_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

const url = new URL(adminUrl);
const baseUrl = `${url.protocol}//${url.username}:${url.password}@${url.host}`;

const adminPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
await adminPool.query(`CREATE DATABASE ${testDbName}`);
await adminPool.end();

process.env.NODE_ENV = 'development'; // avoid tripping CORS_ORIGIN's production-only requirement
process.env.JWT_SECRET = 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X';
process.env.DATABASE_URL = `${baseUrl}/${testDbName}`;
process.env.DB_SSL = 'false';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.CONTACT_RATE_LIMIT_MAX = '1000'; // avoid rate-limit interference between tests

// Run migrations against the fresh test database using the exact same code
// path production uses on boot — testing the real thing, not a
// reimplementation of it.
const { initDb } = await import('../src/db.js');
const { default: db } = await import('../src/db.js');
await initDb();

async function teardownTestDatabase() {
  await db.end();
  // Give db.end()'s own graceful socket close a moment to finish before
  // force-terminating anything else - terminating a connection that's
  // already mid-close otherwise surfaces as a spurious "unhandled error"
  // in the test output even though nothing is actually wrong.
  await new Promise((resolve) => setTimeout(resolve, 100));

  const cleanupPool = new pg.Pool({ connectionString: `${baseUrl}/postgres` });
  cleanupPool.on('error', () => {}); // pool-level errors here are expected noise from terminating backends, not real failures
  try {
    await cleanupPool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [testDbName]
    );
  } catch {
    // best-effort - if this fails, the DROP DATABASE below will just fail
    // too and that's a much clearer signal than this cleanup step's error
  }
  await cleanupPool.query(`DROP DATABASE IF EXISTS ${testDbName}`);
  await cleanupPool.end();
}

afterAll(teardownTestDatabase);
