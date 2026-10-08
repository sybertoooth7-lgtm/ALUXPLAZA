import { describe, it, expect, vi } from 'vitest';
import db from '../src/db.js';

// This is the test that actually matters for the original bug report:
// "restart the server and your uptime counter, request counts, and
// honeypot catches reset to zero." We simulate a restart by resetting
// the ESM module cache and re-importing stats.js fresh, against the SAME
// underlying Postgres database - exactly what happens on a real redeploy.
describe('stats persistence across a simulated restart', () => {
  it('reloads cumulative counters from Postgres instead of resetting to zero', async () => {
    const statsModuleA = await import('../src/stats.js');

    statsModuleA.recordRequest(20, false);
    statsModuleA.recordRequest(30, false);
    statsModuleA.recordHoneypotBlocked();
    statsModuleA.recordContactAttempt();
    statsModuleA.recordContactSuccess();

    const requestCountBeforeRestart = statsModuleA.stats.requestCount;
    const honeypotBeforeRestart = statsModuleA.stats.honeypotBlocked;
    const contactAttemptsBeforeRestart = statsModuleA.stats.contactAttempts;

    // Simulate the flush that happens periodically / on SIGTERM in real
    // deployments (Railway sends SIGTERM before killing the container).
    await statsModuleA.persistStats();

    // Simulate a process restart: reset the module registry and re-import.
    // A brand-new process would run stats.js's module code fresh, but
    // unlike a naive design, this stats.js does NOT auto-load persisted
    // values as an import-time side effect - index.js calls
    // loadPersistedValues() explicitly during boot, after the DB
    // connection is confirmed. So the test does the same thing a real
    // restart's boot sequence does.
    vi.resetModules();
    const statsModuleB = await import('../src/stats.js');
    await statsModuleB.loadPersistedValues();

    expect(statsModuleB.stats.requestCount).toBe(requestCountBeforeRestart);
    expect(statsModuleB.stats.honeypotBlocked).toBe(honeypotBeforeRestart);
    expect(statsModuleB.stats.contactAttempts).toBe(contactAttemptsBeforeRestart);

    // Uptime SHOULD reset - that's correct, not a bug (it means "time since
    // this process started"), so we only assert it exists and is small.
    expect(statsModuleB.getUptimeSeconds()).toBeLessThan(5);

    // vi.resetModules() orphaned the original db.js pool from setup.js and
    // gave stats.js (and this test, importing the same resolved path) a
    // brand-new one. Nothing else holds a reference to close it - leaving
    // it open would otherwise surface as a noisy unhandled connection
    // error when the suite's teardown later has to force-terminate it.
    const dbModuleB = await import('../src/db.js');
    await dbModuleB.default.end();
  });

  it('metrics table actually contains the persisted rows', async () => {
    const { rows } = await db.query('SELECT key, value FROM metrics');
    const keys = rows.map((r) => r.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'requestCount',
        'honeypotBlocked',
        'contactAttempts',
        'contactSuccesses',
      ])
    );
  });
});
