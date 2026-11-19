// Wipes the full-stack E2E database so every Playwright run starts from nothing.
//
// SAFETY: this drops every table. It refuses to run unless the database name in
// DATABASE_URL ends in "_e2e", so pointing it at a development, staging or
// production database by mistake does nothing but print an error and exit.
//
// The backend recreates the schema itself on boot (migrations run at startup),
// and pg-boss recreates its own "pgboss" schema.
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[e2e-reset-db] DATABASE_URL is not set. Refusing to continue.');
  process.exit(1);
}

let databaseName;
try {
  databaseName = decodeURIComponent(new URL(connectionString).pathname.replace(/^\//, ''));
} catch {
  console.error('[e2e-reset-db] DATABASE_URL could not be parsed. Refusing to continue.');
  process.exit(1);
}

if (!databaseName.endsWith('_e2e')) {
  console.error(
    `[e2e-reset-db] Refusing to wipe database "${databaseName}": its name must end in "_e2e".`
  );
  process.exit(1);
}

const client = new pg.Client({ connectionString });

try {
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS pgboss CASCADE');
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  console.log(`[e2e-reset-db] Reset database "${databaseName}".`);
} catch (err) {
  console.error('[e2e-reset-db] Reset failed:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
