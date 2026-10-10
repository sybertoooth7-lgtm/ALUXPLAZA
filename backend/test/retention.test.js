import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'crypto';
import db from '../src/db.js';
import {
  RETENTION,
  DEFAULT_MAX_ROWS_PER_RUN,
  retentionMode,
  runRetention,
} from '../src/jobs/retention.js';
import { runCleanup } from '../src/jobs/cleanup.js';
import { QUEUE_OPTIONS } from '../src/lib/email-queue.js';

// ── seed helpers ──────────────────────────────────────────────────────────
// Ages are given in months so they cross the retention cutoff by a wide margin
// (13 vs 12, 25 vs 24) and never flap on calendar-length differences.
const ago = (months) => `NOW() - make_interval(months => ${Number(months)})`;
const agoDays = (days) => `NOW() - make_interval(days => ${Number(days)})`;

async function insertContact({ label, updatedMonths, createdMonths }) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const created = createdMonths ?? updatedMonths;
  const { rows } = await db.query(
    `INSERT INTO contacts (name, email, message, status, created_at, updated_at)
     VALUES ($1, $2, 'msg', 'new', ${ago(created)}, ${ago(updatedMonths)})
     RETURNING id`,
    [label, email]
  );
  return rows[0].id;
}

async function insertClient({ label, disabledMonths = null }) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const { rows } = await db.query(
    `INSERT INTO clients (company_name, email, password_hash, email_verified, created_at, disabled_at)
     VALUES ($1, $2, 'x', TRUE, ${ago(60)}, ${disabledMonths === null ? 'NULL' : ago(disabledMonths)})
     RETURNING id`,
    [label, email]
  );
  return rows[0].id;
}

async function insertAudit({ action, months }) {
  const { rows } = await db.query(
    `INSERT INTO audit_logs (admin_email, action, created_at)
     VALUES ('staff@staff.example.com', $1, ${ago(months)}) RETURNING id`,
    [action]
  );
  return rows[0].id;
}

const exists = async (table, id) =>
  (await db.query(`SELECT 1 FROM ${table} WHERE id = $1`, [id])).rowCount === 1;

const ENV_KEYS = ['RETENTION_MODE'];
let savedEnv;

beforeEach(async () => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  ENV_KEYS.forEach((k) => delete process.env[k]);
  await db.query('DELETE FROM contacts');
  await db.query('DELETE FROM audit_logs');
  await db.query('DELETE FROM clients');
  await db.query('DELETE FROM client_login_attempts');
  await db.query('DELETE FROM blocked_ips');
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('retentionMode', () => {
  it.each([
    [undefined, 'dry-run'],
    ['', 'dry-run'],
    ['   ', 'dry-run'],
    ['dry-run', 'dry-run'],
    ['enforce', 'enforce'],
    ['  ENFORCE ', 'enforce'],
    ['off', 'off'],
    ['enforced', 'dry-run'], // a typo must never turn into deletion
    ['true', 'dry-run'],
    ['1', 'dry-run'],
  ])('RETENTION_MODE=%j resolves to %s', (raw, expected) => {
    expect(retentionMode(raw)).toBe(expected);
  });

  it('reads the environment when called without an argument', () => {
    process.env.RETENTION_MODE = 'enforce';
    expect(retentionMode()).toBe('enforce');
    delete process.env.RETENTION_MODE;
    expect(retentionMode()).toBe('dry-run');
  });
});

describe('runRetention — contacts (12 months since last update)', () => {
  it('deletes only contacts not updated within the period', async () => {
    const stale = await insertContact({ label: 'stale', updatedMonths: 13 });
    const fresh = await insertContact({ label: 'fresh', updatedMonths: 11 });
    // Old enquiry, but an admin touched it recently: the clock is last update.
    const touched = await insertContact({ label: 'touched', createdMonths: 40, updatedMonths: 2 });

    const { results } = await runRetention({ mode: 'enforce' });

    expect(results.contacts).toEqual({ eligible: 1, deleted: 1, capped: false });
    expect(await exists('contacts', stale)).toBe(false);
    expect(await exists('contacts', fresh)).toBe(true);
    expect(await exists('contacts', touched)).toBe(true);
  });

  it('dry-run reports what would be deleted and deletes nothing', async () => {
    const stale = await insertContact({ label: 'stale', updatedMonths: 13 });
    const { mode, results } = await runRetention({ mode: 'dry-run' });

    expect(mode).toBe('dry-run');
    expect(results.contacts).toEqual({ eligible: 1, deleted: 0, capped: false });
    expect(await exists('contacts', stale)).toBe(true);
  });

  it('off does nothing at all', async () => {
    const stale = await insertContact({ label: 'stale', updatedMonths: 13 });
    const out = await runRetention({ mode: 'off' });

    expect(out).toEqual({ mode: 'off', results: {} });
    expect(await exists('contacts', stale)).toBe(true);
  });
});

describe('runRetention — closed client accounts (24 months since closure)', () => {
  it('deletes long-closed accounts with everything attached, and never touches open or recently closed ones', async () => {
    const closedLong = await insertClient({ label: 'closedlong', disabledMonths: 25 });
    const closedRecent = await insertClient({ label: 'closedrecent', disabledMonths: 23 });
    const open = await insertClient({ label: 'open' }); // created 60 months ago, never closed

    // Everything that hangs off the long-closed account.
    const item = (await db.query('SELECT id FROM compliance_items ORDER BY id LIMIT 1')).rows[0];
    await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status, notes, updated_by)
       VALUES ($1, $2, 'passing', 'n', 'staff@staff.example.com')`,
      [closedLong, item.id]
    );
    await db.query(
      `INSERT INTO risk_score_shares (client_id, token, created_by) VALUES ($1, $2, 's')`,
      [closedLong, `tok-${crypto.randomUUID()}`]
    );
    await db.query(
      `INSERT INTO client_login_attempts (client_id, email_attempted, ip_address, success)
       VALUES ($1, 'a@b.c', '203.0.113.50', TRUE)`,
      [closedLong]
    );
    await db.query(
      `INSERT INTO client_sessions (client_id, jti, expires_at) VALUES ($1, $2, NOW() + interval '1 hour')`,
      [closedLong, crypto.randomUUID()]
    );
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [closedLong, `h-${crypto.randomUUID()}`]
    );
    await db.query(
      `INSERT INTO client_password_resets (client_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + interval '1 hour')`,
      [closedLong, `r-${crypto.randomUUID()}`]
    );

    const { results } = await runRetention({ mode: 'enforce' });

    expect(results.closedClients).toEqual({ eligible: 1, deleted: 1, capped: false });
    expect(await exists('clients', closedLong)).toBe(false);
    expect(await exists('clients', closedRecent)).toBe(true);
    expect(await exists('clients', open)).toBe(true);

    for (const table of [
      'client_compliance_status',
      'risk_score_shares',
      'client_login_attempts',
      'client_sessions',
      'client_email_verifications',
      'client_password_resets',
    ]) {
      const r = await db.query(`SELECT 1 FROM ${table} WHERE client_id = $1`, [closedLong]);
      expect(r.rowCount, `${table} should be empty for the deleted client`).toBe(0);
    }
  });
});

describe('runRetention — audit log (24 months)', () => {
  it('deletes old entries, keeps newer ones, and records a counts-only purge entry', async () => {
    const old = await insertAudit({ action: 'old.entry', months: 25 });
    const recent = await insertAudit({ action: 'recent.entry', months: 23 });

    await runRetention({ mode: 'enforce' });

    expect(await exists('audit_logs', old)).toBe(false);
    expect(await exists('audit_logs', recent)).toBe(true);

    const purge = await db.query(`SELECT * FROM audit_logs WHERE action = 'retention.purge'`);
    expect(purge.rowCount).toBe(1);
    expect(purge.rows[0].admin_email).toBe('system:retention');
    expect(purge.rows[0].new_value).toMatchObject({
      audit_logs: 1,
      contacts: 0,
      closed_clients: 0,
    });
  });

  it('writes no purge entry when nothing was deleted, and none in dry-run', async () => {
    await insertAudit({ action: 'recent.entry', months: 1 });
    await runRetention({ mode: 'enforce' });
    expect(
      (await db.query(`SELECT 1 FROM audit_logs WHERE action = 'retention.purge'`)).rowCount
    ).toBe(0);

    await insertContact({ label: 'stale', updatedMonths: 13 });
    await runRetention({ mode: 'dry-run' });
    expect(
      (await db.query(`SELECT 1 FROM audit_logs WHERE action = 'retention.purge'`)).rowCount
    ).toBe(0);
  });
});

describe('runRetention — per-run cap', () => {
  it('deletes at most maxRows per rule per run, oldest first, and drains over later runs', async () => {
    const ids = [];
    for (let i = 0; i < 5; i += 1) {
      ids.push(await insertContact({ label: `bulk${i}`, updatedMonths: 40 - i })); // ids[0] oldest
    }

    const first = await runRetention({ mode: 'enforce', maxRows: 2 });
    expect(first.results.contacts).toEqual({ eligible: 5, deleted: 2, capped: true });
    expect(await exists('contacts', ids[0])).toBe(false);
    expect(await exists('contacts', ids[1])).toBe(false);
    expect(await exists('contacts', ids[2])).toBe(true); // oldest first: newer ones wait

    const second = await runRetention({ mode: 'enforce', maxRows: 2 });
    expect(second.results.contacts).toEqual({ eligible: 3, deleted: 2, capped: true });

    const third = await runRetention({ mode: 'enforce', maxRows: 2 });
    expect(third.results.contacts).toEqual({ eligible: 1, deleted: 1, capped: false });
    expect((await db.query('SELECT 1 FROM contacts')).rowCount).toBe(0);
  });

  it('has a sensible default cap', () => {
    expect(DEFAULT_MAX_ROWS_PER_RUN).toBe(500);
  });
});

describe('runCleanup — the daily job end to end', () => {
  it('default (no RETENTION_MODE): clears expired links but only reports retention, deleting no personal data', async () => {
    const stale = await insertContact({ label: 'stale', updatedMonths: 13 });
    const clientId = await insertClient({ label: 'tokens' });
    const tag = crypto.randomUUID().slice(0, 8);
    const hashes = {
      verifyExpired: `verify-expired-${tag}`,
      verifyLive: `verify-live-${tag}`,
      resetExpired: `reset-expired-${tag}`,
      resetLive: `reset-live-${tag}`,
    };
    await db.query(
      `INSERT INTO client_email_verifications (client_id, token_hash, expires_at) VALUES
         ($1, $2, NOW() - interval '1 hour'), ($1, $3, NOW() + interval '1 hour')`,
      [clientId, hashes.verifyExpired, hashes.verifyLive]
    );
    await db.query(
      `INSERT INTO client_password_resets (client_id, token_hash, expires_at) VALUES
         ($1, $2, NOW() - interval '1 hour'), ($1, $3, NOW() + interval '1 hour')`,
      [clientId, hashes.resetExpired, hashes.resetLive]
    );

    await runCleanup();

    // The expired link is gone and the still-valid one is the one left.
    const v = await db.query(
      'SELECT token_hash FROM client_email_verifications WHERE client_id = $1',
      [clientId]
    );
    const r = await db.query('SELECT token_hash FROM client_password_resets WHERE client_id = $1', [
      clientId,
    ]);
    expect(v.rows.map((x) => x.token_hash)).toEqual([hashes.verifyLive]);
    expect(r.rows.map((x) => x.token_hash)).toEqual([hashes.resetLive]);
    // Dry-run default: the stale contact is still there.
    expect(await exists('contacts', stale)).toBe(true);
  });

  it('with RETENTION_MODE=enforce it also applies the retention rules', async () => {
    process.env.RETENTION_MODE = 'enforce';
    const stale = await insertContact({ label: 'stale', updatedMonths: 13 });
    const fresh = await insertContact({ label: 'fresh', updatedMonths: 1 });

    await runCleanup();

    expect(await exists('contacts', stale)).toBe(false);
    expect(await exists('contacts', fresh)).toBe(true);
  });

  it('login attempts are purged after 90 days and not before (the period the policy states)', async () => {
    await db.query(
      `INSERT INTO client_login_attempts (email_attempted, ip_address, success, created_at) VALUES
         ('old@example.com', '203.0.113.51', FALSE, ${agoDays(91)}),
         ('recent@example.com', '203.0.113.52', FALSE, ${agoDays(89)})`
    );
    await runCleanup();
    const left = await db.query('SELECT email_attempted FROM client_login_attempts');
    expect(left.rows.map((x) => x.email_attempted)).toEqual(['recent@example.com']);
  });

  it('blocked IPs are purged 7 days after the block ends and not before (the period the policy states)', async () => {
    await db.query(
      `INSERT INTO blocked_ips (ip_address, reason, expires_at) VALUES
         ('203.0.113.1', 'test', ${agoDays(8)}),
         ('203.0.113.2', 'test', ${agoDays(6)}),
         ('203.0.113.3', 'test', NULL)`
    );
    await runCleanup();
    const left = await db.query('SELECT ip_address FROM blocked_ips ORDER BY ip_address');
    expect(left.rows.map((x) => x.ip_address)).toEqual(['203.0.113.2', '203.0.113.3']);
  });
});

describe('the privacy policy page and the code state the same periods', () => {
  const policyPath = path.join(
    import.meta.dirname,
    '..',
    '..',
    'frontend',
    'src',
    'pages',
    'PrivacyPolicy.tsx'
  );

  function policyRows() {
    const src = fs.readFileSync(policyPath, 'utf8');
    const block = src.slice(src.indexOf('const RETENTION'), src.indexOf('const PROVIDERS'));
    return [...block.matchAll(/data:\s*'([^']+)',(?:\s*\/\/[^\n]*)?\s*kept:\s*'([^']+)'/g)].map(
      (m) => ({ data: m[1], kept: m[2] })
    );
  }
  const find = (rows, prefix) => rows.find((r) => r.data.startsWith(prefix));

  it('reads the retention table out of the policy source', () => {
    expect(policyRows().length).toBeGreaterThanOrEqual(7);
  });

  it('contact messages, closed accounts and staff-action records match the code constants', () => {
    const rows = policyRows();
    expect(find(rows, 'Messages sent through the contact form').kept).toBe(
      `${RETENTION.contactMonths} months after the enquiry was last updated`
    );
    expect(find(rows, 'Client accounts and engagement records').kept).toBe(
      `${RETENTION.closedClientMonths} months after the account is closed`
    );
    expect(find(rows, 'Records of actions taken by our staff').kept).toBe(
      `${RETENTION.auditLogMonths} months`
    );
  });

  it('the queued-email row matches the queue setting', () => {
    const row = find(policyRows(), 'Emails waiting in or recently sent');
    expect(row.kept).toBe('About 24 hours after sending');
    expect(QUEUE_OPTIONS.deleteAfterSeconds).toBe(24 * 60 * 60);
    expect(QUEUE_OPTIONS.retentionSeconds).toBe(24 * 60 * 60);
  });

  it('the cleanup-job rows state the periods the cleanup tests above enforce', () => {
    const rows = policyRows();
    expect(find(rows, 'Sign-in attempts').kept).toBe('90 days');
    expect(find(rows, 'Blocked IP addresses').kept).toBe('Removed 7 days after the block ends');
    expect(find(rows, 'Active sessions, email verification links').kept).toBe(
      'Until they expire (hours to days)'
    );
  });

  it('every row in the policy table is accounted for here, so a new row cannot be added without enforcement', () => {
    const known = [
      'Messages sent through the contact form',
      'Client accounts and engagement records',
      'Sign-in attempts',
      'Blocked IP addresses',
      'Active sessions, email verification links',
      'Records of actions taken by our staff',
      'Emails waiting in or recently sent',
    ];
    const unknown = policyRows().filter((r) => !known.some((k) => r.data.startsWith(k)));
    expect(
      unknown,
      'A retention row was added to PrivacyPolicy.tsx. Enforce it in jobs/retention.js or jobs/cleanup.js, then list it here.'
    ).toEqual([]);
  });
});
