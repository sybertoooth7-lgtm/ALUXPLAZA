import { defineConfig } from 'vitest/config';

// Runs only test/email-queue.test.js, with no global setupFiles, so it can
// execute on a machine with no PostgreSQL (the file stubs pg-boss and never
// queries a database). Lets the queue logic be verified locally, and keeps it
// out of the DB-dependent path.
//
//   npx vitest run --config vitest.email-queue.config.js
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/email-queue.test.js'],
    fileParallelism: false,
  },
});
