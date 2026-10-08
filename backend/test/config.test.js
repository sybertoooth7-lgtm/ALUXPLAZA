import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, '..');

// config.js calls process.exit(1) on invalid config, which would kill the
// test runner itself if imported in-process. We test it the same way it
// actually runs in production: as a real child process with a real
// environment, and check the real exit code/stderr.
function runNodeWithEnv(env) {
  try {
    const output = execFileSync(
      'node',
      ['-e', "import('./src/config.js').then(() => console.log('CONFIG_OK'))"],
      {
        cwd: backendRoot,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        stdio: 'pipe',
      }
    );
    return { code: 0, output };
  } catch (err) {
    return { code: err.status, output: (err.stdout || '') + (err.stderr || '') };
  }
}

describe('config.js fail-fast validation', () => {
  it('exits non-zero in production with no JWT_SECRET or CORS_ORIGIN set', () => {
    const { code, output } = runNodeWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: '',
      CORS_ORIGIN: '',
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/JWT_SECRET is not set/);
    expect(output).toMatch(/CORS_ORIGIN is not set/);
  });

  it('exits non-zero in production with JWT_SECRET set but CORS_ORIGIN missing (the original footgun)', () => {
    const { code, output } = runNodeWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X',
      CORS_ORIGIN: '',
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/CORS_ORIGIN is not set/);
  });

  it('starts successfully in production with both JWT_SECRET and CORS_ORIGIN set', () => {
    const { code, output } = runNodeWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X',
      CORS_ORIGIN: 'https://example.com',
    });
    expect(code).toBe(0);
    expect(output).toMatch(/CONFIG_OK/);
  });

  it('does not require CORS_ORIGIN outside of production (local dev stays convenient)', () => {
    const { code, output } = runNodeWithEnv({
      NODE_ENV: 'development',
      JWT_SECRET: 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X',
      CORS_ORIGIN: '',
    });
    expect(code).toBe(0);
    expect(output).toMatch(/CONFIG_OK/);
  });

  it('rejects a CORS_ORIGIN missing the http(s):// scheme (a common real deployment mistake)', () => {
    const { code, output } = runNodeWithEnv({
      NODE_ENV: 'production',
      JWT_SECRET: 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X',
      CORS_ORIGIN: 'aluxplaza.com', // missing scheme - would never match a real Origin header
    });
    expect(code).not.toBe(0);
    expect(output).toMatch(/missing scheme/);
  });

  it('strips a trailing slash from CORS_ORIGIN rather than leaving a value that can never match', () => {
    const output = execFileSync(
      'node',
      [
        '-e',
        "import('./src/config.js').then(m => console.log(JSON.stringify(m.config.corsOrigins)))",
      ],
      {
        cwd: backendRoot,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          JWT_SECRET: 'kQ7mZx2Rp9LtVb4WnJf8CyU3HdEa6Ns1Mg5X',
          CORS_ORIGIN: 'https://aluxplaza.com/',
        },
        encoding: 'utf8',
      }
    );
    expect(JSON.parse(output.trim())).toEqual(['https://aluxplaza.com']);
  });
});
