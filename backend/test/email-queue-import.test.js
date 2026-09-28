import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards lib/email-queue.js's real imports. Deliberately does NOT mock pg-boss.
 *
 * The rest of the email-queue tests stub pg-boss, so they never load the real
 * package. That gap shipped `import PgBoss from 'pg-boss'`, which is wrong:
 * pg-boss 12 is pure ESM ("type": "module") and exports only the named
 * `PgBoss`, so Node throws "does not provide an export named 'default'" at
 * import time. Because index.js imports email-queue.js, that took down the
 * entire app at boot — test-backend and boot-admin-warning both went red.
 *
 * This must run the import in a real Node process. Under vitest, both
 * `await import('pg-boss')` and importing email-queue.js itself are transpiled
 * with CJS interop, which synthesises a `default` and makes the broken form
 * pass. A first attempt at this guard asserted the package's export shape via
 * createRequire and still passed with the broken import — verified by
 * deliberately reverting it. Only a real Node resolution catches this.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

function importInRealNode(specifier, expression) {
  return new Promise((resolve) => {
    const script = `const m = await import(${JSON.stringify(specifier)}); console.log(typeof m[${JSON.stringify(expression)}]);`;
    const proc = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd: backendRoot,
      env: {
        ...process.env,
        JWT_SECRET: process.env.JWT_SECRET || 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X',
      },
    });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => {
      out += c.toString();
    });
    proc.stderr.on('data', (c) => {
      err += c.toString();
    });
    proc.on('close', (code) => resolve({ code, out, err }));
  });
}

describe('lib/email-queue.js import shape', () => {
  it('pg-boss has a named PgBoss export and no default, under real Node', async () => {
    const { code, out, err } = await importInRealNode('pg-boss', 'PgBoss');
    expect(err, `real Node failed to import pg-boss: ${err}`).toBe('');
    expect(code).toBe(0);
    expect(out.trim()).toBe('function');
  }, 30_000);

  it('lib/email-queue.js loads under real Node', async () => {
    // This is the exact check that would have caught the boot failure.
    const { code, out, err } = await importInRealNode(
      './src/lib/email-queue.js',
      'startEmailQueue'
    );
    expect(err, `real Node could not load email-queue.js: ${err}`).toBe('');
    expect(code).toBe(0);
    expect(out.trim()).toBe('function');
  }, 30_000);
});
