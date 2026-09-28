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
    ],
    fileParallelism: false,
  },
});
