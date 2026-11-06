import { defineConfig } from 'vitest/config';

// Runs the tests that need no PostgreSQL, with no global setupFiles, so they
// can execute on a machine with no database. Every file listed here is also
// picked up by the default config (which has no `include`, so vitest's default
// glob matches test/*.test.js) and therefore still runs in CI under
// `npm run test:coverage`. This config is only for verifying them locally,
// which is impossible otherwise: test/setup.js provisions a per-file database
// and throws ECONNREFUSED when Postgres is absent.
//
//   npx vitest run --config vitest.nodb.config.js
export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'test/email-queue.test.js',
      'test/email-queue-import.test.js',
      'test/body-limit.test.js',
      'test/email-strict.test.js',
      // Pure address-parsing functions, no database and no network. The SSRF
      // blocklist can be tested honestly only without a live server bound to
      // a private address, so it belongs in the set that runs everywhere.
      'test/authAudit.test.js',
      // Cookie attribute helpers. Pure functions of config, and the SSRF-style
      // caveat applies here too: the wrong Path is only observable in the raw
      // Set-Cookie header, never through supertest's path-less .set('Cookie').
      'test/auth-cookie.test.js',
      // CSRF origin allowlist. Child-process probes, no database.
      'test/csrf-origin.test.js',
      // Pure scrubbing and crypto helpers; no database or network.
      'test/monitoring-scrub.test.js',
      'test/mfa-backup.test.js',
      // Access-log URL scrubbing — pure functions over strings.
      'test/log-redaction.test.js',
      // Pure request-path predicate used by the general API limiter.
      'test/rate-limit-path.test.js',
      // Rate-limit bucket keys. Pure: no request is sent and no store is hit.
      'test/rate-limit-key.test.js',
      // Pure query-string parsers used before pagination reaches SQL.
      'test/pagination.test.js',
      // Client-address normalisation for Shield: pure, and the whole point is
      // rejecting values that never reach a database column.
      'test/shield-ip.test.js',
      // Event-log column clipping. The insert is mocked, so no database.
      'test/eventLogger.test.js',
      // Shield's deny-vs-persist decision, with the guard modules mocked.
      'test/shield-failopen.test.js',
    ],
    fileParallelism: false,
  },
});
