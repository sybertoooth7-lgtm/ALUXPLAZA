import fs from 'node:fs';
import path from 'node:path';

const migrationsDir = path.join(import.meta.dirname, '..', 'migrations');

// Arbitrary but fixed key so every instance of this app contends on the
// same lock. Postgres advisory locks are per-database, so an unrelated app
// sharing the database is unaffected.
const MIGRATION_LOCK_KEY = 8412062;

// How long to wait for a peer instance to finish migrating before giving up
// and letting initDb()'s retry loop try again. Without this, a booting
// instance blocks indefinitely on the lock.
const MIGRATION_LOCK_TIMEOUT = '30s';

export async function runMigrations(pool) {
  // Migrations run on every boot, so N starting instances read the same
  // unapplied set and race each other into CREATE/ALTER failures. Held on
  // one dedicated connection for the whole run so concurrent boots
  // serialize instead.
  const client = await pool.connect();
  try {
    await client.query(`SET lock_timeout = '${MIGRATION_LOCK_TIMEOUT}'`);
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      return await applyPendingMigrations(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

async function applyPendingMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const { rows } = await client.query('SELECT filename FROM _migrations');
  const applied = new Set(rows.map((r) => r.filename));

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        'INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING',
        [file]
      );
      await client.query('COMMIT');
      appliedCount++;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    }
  }
  return appliedCount;
}
