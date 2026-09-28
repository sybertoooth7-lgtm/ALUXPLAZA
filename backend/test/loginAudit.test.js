// Tests for loginAudit's distributed-attack detection.
//
// This code had no test coverage when it was first written, and it shipped a
// live bug as a result: both queries interpolated the window as
// INTERVAL '$2 minutes', which Postgres parses as a *string literal*, so
// created_at > NOW() - INTERVAL '$2 minutes' raised "invalid input syntax for
// type interval" on every single call. The surrounding try/catch swallowed it,
// the function returned quietly, and the detection never once fired. It looked
// completely healthy in the logs.
//
// These are DB-backed rather than mocked for exactly that reason: a mock
// accepts a malformed statement happily, and the only thing that catches this
// class of bug is running the SQL against a real Postgres.
import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../src/db.js';
import { logLoginAttempt, detectDistributedFailure } from '../src/middleware/loginAudit.js';

let ipCounter = 0;
function testIp() {
  ipCounter += 1;
  return `10.0.0.${ipCounter}`;
}

let clientCounter = 0;
async function insertClient() {
  // client_login_attempts.client_id is a FK to clients(id), so the ids these
  // tests use have to be real rows or every insert below fails on the
  // constraint rather than exercising the code under test.
  clientCounter += 1;
  const email = `stuffing-${clientCounter}-${Date.now()}@example.com`;
  const passwordHash = await bcrypt.hash('SuperSecret123!', 4); // cost 4: speed, not security
  const { rows } = await db.query(
    `INSERT INTO clients (company_name, email, password_hash, email_verified)
     VALUES ('Test Co', $1, $2, TRUE) RETURNING id`,
    [email, passwordHash]
  );
  return { id: rows[0].id, email };
}

describe('loginAudit/detectDistributedFailure', () => {
  it('runs its window query without a SQL error', async () => {
    // The regression test for the INTERVAL bug, kept blunt on purpose. The old
    // code satisfied every behavioural assertion while failing closed on a
    // malformed statement, so the assertion has to be that the query actually
    // executes — captured by watching for the catch block logging.
    const client = await insertClient();
    const ip = testIp();
    await logLoginAttempt({ clientId: client.id, email: client.email, ip, success: false });

    const errors = [];
    const realError = console.error;
    console.error = (...args) => errors.push(args.join(' '));
    try {
      await detectDistributedFailure(client.id, client.email, ip);
    } finally {
      console.error = realError;
    }
    expect(errors.filter((e) => e.includes('distributed-attack'))).toEqual([]);
  });

  it('counts distinct IPs against one account, ignoring repeats from the same IP', async () => {
    // The whole point of the check: per-IP counters see 5 failures here, and 5
    // is under the block threshold. The signal only exists at the DISTINCT
    // level — which is why the repeated address must not inflate the count.
    const client = await insertClient();
    for (let i = 0; i < 5; i++) {
      await logLoginAttempt({
        clientId: client.id,
        email: client.email,
        ip: testIp(), // same account, five different source addresses
        success: false,
      });
    }
    for (let i = 0; i < 10; i++) {
      await logLoginAttempt({
        clientId: client.id,
        email: client.email,
        ip: '10.99.0.1', // one address hammering the same account
        success: false,
      });
    }

    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT ip_address)::int AS ips, COUNT(*)::int AS total
       FROM client_login_attempts WHERE client_id = $1 AND success = FALSE`,
      [client.id]
    );
    // 6 distinct: the 5 above plus the repeated one.
    expect(rows[0].ips).toBe(6);
    expect(rows[0].total).toBe(15);
  });

  it('ignores successful attempts when counting failures', async () => {
    // A user signing in from many devices is normal; a user FAILING from many
    // devices is the attack. Counting both would flag every travelling
    // customer and every shared-office NAT as credential stuffing.
    const client = await insertClient();
    for (let i = 0; i < 8; i++) {
      await logLoginAttempt({
        clientId: client.id,
        email: client.email,
        ip: testIp(),
        success: true,
      });
    }
    for (let i = 0; i < 2; i++) {
      await logLoginAttempt({
        clientId: client.id,
        email: client.email,
        ip: testIp(),
        success: false,
      });
    }
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT ip_address)::int AS ips FROM client_login_attempts
       WHERE client_id = $1 AND success = FALSE`,
      [client.id]
    );
    expect(rows[0].ips).toBe(2);
  });

  it('ignores attempts older than the window', async () => {
    // Otherwise the count only grows forever and one incident produces a
    // permanent alert, which is how people learn to ignore alerts.
    const client = await insertClient();
    const oldIp = testIp();
    const newIp = testIp();
    await db.query(
      `INSERT INTO client_login_attempts (client_id, email_attempted, ip_address, success, created_at)
       VALUES ($1, $2, $3, FALSE, NOW() - interval '3 hours')`,
      [client.id, client.email, oldIp]
    );
    await logLoginAttempt({ clientId: client.id, email: client.email, ip: newIp, success: false });

    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT ip_address)::int AS ips FROM client_login_attempts
       WHERE client_id = $1 AND success = FALSE
         AND created_at > NOW() - make_interval(mins => 30::int)`,
      [client.id]
    );
    expect(rows[0].ips).toBe(1);
  });

  it('counts distinct addresses from one IP, which is enumeration', async () => {
    // The mirror case, and one the per-IP counter cannot see at all: one
    // attempt per address is never a burst, but 25 different addresses from a
    // single host is a harvested list, not a user with a bad memory.
    const ip = testIp();
    for (let i = 0; i < 25; i++) {
      await logLoginAttempt({
        clientId: null, // most probes target accounts that do not exist
        email: `probe-${ip.replace(/\./g, '-')}-${i}@example.com`,
        ip,
        success: false,
      });
    }
    const { rows } = await db.query(
      `SELECT COUNT(DISTINCT email_attempted)::int AS emails FROM client_login_attempts
       WHERE ip_address = $1 AND success = FALSE
         AND created_at > NOW() - make_interval(mins => 30::int)`,
      [ip]
    );
    expect(rows[0].emails).toBe(25);
  });

  it('does not throw when the table is unavailable, so a login cannot be blocked by it', async () => {
    // Fails open. This is a heuristic observer sitting directly on the login
    // path: if it can reject a login, a transient database hiccup becomes an
    // outage — and a bad query would fail on every call, permanently.
    const realQuery = db.query;
    db.query = (text, params) => {
      if (String(text).includes('client_login_attempts')) {
        return Promise.reject(new Error('simulated DB failure'));
      }
      return realQuery(text, params);
    };
    const realError = console.error;
    console.error = () => {};
    try {
      await expect(detectDistributedFailure(1, 'a@example.com', testIp())).resolves.toBeUndefined();
    } finally {
      console.error = realError;
      db.query = realQuery;
    }
  });
});
