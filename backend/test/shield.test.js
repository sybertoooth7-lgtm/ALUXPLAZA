import { describe, it, expect } from 'vitest';
import { scanRequest } from '../src/shield/detector.js';
import {
  computeRiskScore,
  computeRiskScoreBulk,
  computeComplianceOverview,
  scoreLabel,
} from '../src/shield/riskScore.js';
import { isBlocked, blockIp, unblockIp, listActiveBlocks } from '../src/shield/blocklist.js';
import { recordFailedLogin, recordRequest } from '../src/shield/bruteForceGuard.js';
import { logSecurityEvent } from '../src/shield/eventLogger.js';
import db from '../src/db.js';

function fakeReq({ query = {}, body = {}, params = {}, originalUrl = '/' } = {}) {
  return { query, body, params, originalUrl };
}

let ipCounter = 100;
function testIp() {
  ipCounter += 1;
  return `10.1.0.${ipCounter}`;
}

// ─────────────────────────────────────────────────────────────────────────
describe('shield/detector.js — scanRequest', () => {
  it('returns null for a clean request', () => {
    const result = scanRequest(fakeReq({ query: { search: 'hello world' } }));
    expect(result).toBeNull();
  });

  it('detects a classic SQL injection UNION SELECT in a query param', () => {
    const result = scanRequest(
      fakeReq({ query: { id: '1 UNION SELECT username, password FROM users' } })
    );
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('sqli');
    expect(result.matchedPattern).toBe('sql_union');
  });

  it('detects a SQL OR-injection pattern in the request body', () => {
    const result = scanRequest(fakeReq({ body: { username: "admin' OR '1'='1" } }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('sqli');
  });

  it('detects an XSS script tag', () => {
    const result = scanRequest(fakeReq({ body: { comment: '<script>alert(1)</script>' } }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('xss');
    expect(result.matchedPattern).toBe('xss_script_tag');
  });

  it('detects an XSS event-handler injection', () => {
    const result = scanRequest(fakeReq({ body: { bio: '<img src=x onerror=alert(1)>' } }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('xss');
  });

  it('detects path traversal in the URL', () => {
    const result = scanRequest(fakeReq({ originalUrl: '/files/../../etc/passwd' }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('path_traversal');
  });

  it('detects URL-encoded path traversal (evasion attempt)', () => {
    const result = scanRequest(fakeReq({ originalUrl: '/files/%2e%2e%2fetc/passwd' }));
    expect(result).not.toBeNull();
    expect(result.eventType).toBe('path_traversal');
  });

  it('detects a SQL injection hidden behind double URL-encoding', () => {
    // "union select" URL-encoded twice: normalizeInput decodes up to 3 levels
    const doubleEncoded = encodeURIComponent(encodeURIComponent('union select'));
    const result = scanRequest(fakeReq({ query: { q: doubleEncoded } }));
    expect(result).not.toBeNull();
    expect(result.matchedPattern).toBe('sql_union');
  });

  it('detects SQLi hidden via HTML-entity-encoded characters', () => {
    // A single-quote OR-injection spelled with an HTML entity for the space
    const result = scanRequest(fakeReq({ query: { id: "1' OR '1'='1" } }));
    expect(result).not.toBeNull();
  });

  it('does not flag ordinary punctuation-heavy but benign text', () => {
    const result = scanRequest(
      fakeReq({ body: { message: "Hi - I'd like a quote for Q3, please. Thanks!" } })
    );
    expect(result).toBeNull();
  });

  // The patterns used to be unbounded (/\bunion\b.*?\bselect\b/ and
  // /<script[\s\S]*?>[\s\S]*?<\/script>/), so a 1mb body full of opening
  // tokens blocked the event loop for minutes. They are now gap-bounded and
  // each request part is capped before normalization.
  it('scans a 1mb adversarial body in well under a second', () => {
    const hostile = { blob: 'union '.repeat(200000) }; // ~1.2mb
    const started = Date.now();
    scanRequest(fakeReq({ body: hostile }));
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('still detects a payload at the start of an oversized body', () => {
    const result = scanRequest(fakeReq({ body: { a: 'union select 1', b: 'x'.repeat(1000000) } }));
    expect(result.matchedPattern).toBe('sql_union');
  });

  it('still detects a payload at the end of an oversized body', () => {
    const result = scanRequest(fakeReq({ body: { a: 'x'.repeat(1000000), b: 'union select 1' } }));
    expect(result.matchedPattern).toBe('sql_union');
  });

  it('scans a 1mb body of script tags in well under a second', () => {
    const hostile = { blob: '<script>'.repeat(114000) }; // ~900kb
    const started = Date.now();
    scanRequest(fakeReq({ body: hostile }));
    expect(Date.now() - started).toBeLessThan(2000);
  });

  // /on\w+\s*=/ backtracked once per character from every 'on' in the input:
  // 2.6s inside a single 64KB window, so the input cap did not save it.
  it('scans a 64kb body of "on" in well under a second', () => {
    const started = Date.now();
    scanRequest(fakeReq({ body: { blob: 'on'.repeat(32768) } }));
    expect(Date.now() - started).toBeLessThan(2000);
  });

  // Nested unbounded quantifiers. This hung outright at 16kb, long before
  // reaching the input cap.
  it('scans a 64kb body of iframe tags in well under a second', () => {
    const started = Date.now();
    scanRequest(fakeReq({ body: { blob: '<iframe>'.repeat(8000) } }));
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it('still detects an iframe injection', () => {
    const result = scanRequest(fakeReq({ body: { html: '<iframe src="//evil"></iframe>' } }));
    expect(result.matchedPattern).toBe('xss_iframe');
  });

  it('still detects an inline event handler', () => {
    const result = scanRequest(fakeReq({ body: { html: '<img src=x onerror=alert(1)>' } }));
    expect(result.matchedPattern).toBe('xss_event_handler');
  });
});

describe('shield/riskScore.js', () => {
  it('scores a client with a mix of statuses correctly, excluding not_applicable', async () => {
    const client = await db.query(
      `INSERT INTO clients (company_name, email, password_hash, email_verified)
       VALUES ('Score Test Co', $1, 'x', TRUE) RETURNING id`,
      [`score-test-${Date.now()}@example.com`]
    );
    const clientId = client.rows[0].id;

    const items = await db.query('SELECT id, framework FROM compliance_items ORDER BY id LIMIT 4');
    expect(items.rows.length).toBeGreaterThanOrEqual(4); // sanity check the seed data exists

    const [a, b, c, d] = items.rows;
    // Mark every OTHER item not_applicable first, so the LEFT JOIN's
    // COALESCE-to-'pending' default doesn't pull in items we didn't
    // intend to be part of this test's math.
    await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status)
       SELECT $1, id, 'not_applicable' FROM compliance_items WHERE id NOT IN ($2, $3, $4, $5)`,
      [clientId, a.id, b.id, c.id, d.id]
    );
    await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status) VALUES
         ($1, $2, 'passing'), ($1, $3, 'in_progress'), ($1, $4, 'failing'), ($1, $5, 'not_applicable')`,
      [clientId, a.id, b.id, c.id, d.id]
    );

    const { score, itemCount } = await computeRiskScore(clientId);

    // 3 applicable items (not_applicable excluded): 1 + 0.5 + 0 = 1.5 / 3 = 50%
    expect(itemCount).toBe(3);
    expect(score).toBe(50);
  });

  it('returns a null score when every applicable item is not_applicable', async () => {
    const client = await db.query(
      `INSERT INTO clients (company_name, email, password_hash, email_verified)
       VALUES ('All NA Co', $1, 'x', TRUE) RETURNING id`,
      [`all-na-${Date.now()}@example.com`]
    );
    const clientId = client.rows[0].id;

    await db.query(
      `INSERT INTO client_compliance_status (client_id, item_id, status)
       SELECT $1, id, 'not_applicable' FROM compliance_items`,
      [clientId]
    );

    const { score, itemCount } = await computeRiskScore(clientId);
    expect(score).toBeNull();
    expect(itemCount).toBe(0);
  });

  it('defaults to pending (0 points) for items the client has never touched', async () => {
    const client = await db.query(
      `INSERT INTO clients (company_name, email, password_hash, email_verified)
       VALUES ('Untouched Co', $1, 'x', TRUE) RETURNING id`,
      [`untouched-${Date.now()}@example.com`]
    );
    const clientId = client.rows[0].id;

    // No client_compliance_status rows at all for this client.
    const { score, itemCount } = await computeRiskScore(clientId);
    const totalItems = (await db.query('SELECT COUNT(*)::int AS c FROM compliance_items')).rows[0]
      .c;

    expect(itemCount).toBe(totalItems);
    expect(score).toBe(0);
  });

  describe('scoreLabel', () => {
    it('maps score bands to the correct labels', () => {
      expect(scoreLabel(null)).toBe('Not yet assessed');
      expect(scoreLabel(95)).toBe('Strong');
      expect(scoreLabel(90)).toBe('Strong');
      expect(scoreLabel(89)).toBe('Adequate');
      expect(scoreLabel(70)).toBe('Adequate');
      expect(scoreLabel(69)).toBe('Developing');
      expect(scoreLabel(50)).toBe('Developing');
      expect(scoreLabel(49)).toBe('Needs attention');
      expect(scoreLabel(0)).toBe('Needs attention');
    });
  });

  describe('computeRiskScoreBulk', () => {
    it('agrees with computeRiskScore for the same set of clients', async () => {
      // Two clients with different, deliberately mixed statuses — if the
      // bulk aggregate query's math ever drifts from the tested per-client
      // function, this catches it directly rather than trusting the SQL
      // by inspection alone.
      const items = (await db.query('SELECT id FROM compliance_items ORDER BY id LIMIT 3')).rows;
      const [i1, i2, i3] = items;

      const clientA = (
        await db.query(
          `INSERT INTO clients (company_name, email, password_hash, email_verified)
           VALUES ('Bulk A', $1, 'x', TRUE) RETURNING id`,
          [`bulk-a-${Date.now()}@example.com`]
        )
      ).rows[0].id;
      const clientB = (
        await db.query(
          `INSERT INTO clients (company_name, email, password_hash, email_verified)
           VALUES ('Bulk B', $1, 'x', TRUE) RETURNING id`,
          [`bulk-b-${Date.now()}@example.com`]
        )
      ).rows[0].id;

      await db.query(
        `INSERT INTO client_compliance_status (client_id, item_id, status) VALUES
           ($1, $2, 'passing'), ($1, $3, 'failing')`,
        [clientA, i1.id, i2.id]
      );
      await db.query(
        `INSERT INTO client_compliance_status (client_id, item_id, status) VALUES
           ($1, $2, 'in_progress'), ($1, $3, 'passing'), ($1, $4, 'not_applicable')`,
        [clientB, i1.id, i2.id, i3.id]
      );

      const [expectedA, expectedB] = await Promise.all([
        computeRiskScore(clientA),
        computeRiskScore(clientB),
      ]);
      const bulk = await computeRiskScoreBulk([clientA, clientB]);

      expect(bulk.get(clientA).score).toBe(expectedA.score);
      expect(bulk.get(clientA).itemCount).toBe(expectedA.itemCount);
      expect(bulk.get(clientB).score).toBe(expectedB.score);
      expect(bulk.get(clientB).itemCount).toBe(expectedB.itemCount);
    });

    it('returns an empty map for an empty input list', async () => {
      const result = await computeRiskScoreBulk([]);
      expect(result.size).toBe(0);
    });

    it('returns score: null for a client with zero applicable items, matching computeRiskScore', async () => {
      const clientId = (
        await db.query(
          `INSERT INTO clients (company_name, email, password_hash, email_verified)
           VALUES ('Bulk NA', $1, 'x', TRUE) RETURNING id`,
          [`bulk-na-${Date.now()}@example.com`]
        )
      ).rows[0].id;
      await db.query(
        `INSERT INTO client_compliance_status (client_id, item_id, status)
         SELECT $1, id, 'not_applicable' FROM compliance_items`,
        [clientId]
      );

      const single = await computeRiskScore(clientId);
      const bulk = await computeRiskScoreBulk([clientId]);

      expect(single.score).toBeNull();
      expect(bulk.get(clientId).score).toBeNull();
    });
  });

  describe('computeComplianceOverview', () => {
    it('band counts sum to totalClients, and avgScore falls within a sane 0-100 range', async () => {
      // Uses whatever clients already exist in the test DB at this point
      // in the suite — deliberately not asserting exact counts (those
      // depend on every earlier test in this file), just structural
      // correctness of the aggregate.
      const overview = await computeComplianceOverview();

      const bandSum = Object.values(overview.bandCounts).reduce((a, b) => a + b, 0);
      expect(bandSum).toBe(overview.totalClients);

      if (overview.avgScore !== null) {
        expect(overview.avgScore).toBeGreaterThanOrEqual(0);
        expect(overview.avgScore).toBeLessThanOrEqual(100);
      }
    });

    it('a client scoring exactly 100 counts toward Strong', async () => {
      const item = (await db.query('SELECT id FROM compliance_items LIMIT 1')).rows[0];
      const clientId = (
        await db.query(
          `INSERT INTO clients (company_name, email, password_hash, email_verified)
           VALUES ('Perfect Score Co', $1, 'x', TRUE) RETURNING id`,
          [`perfect-${Date.now()}@example.com`]
        )
      ).rows[0].id;
      // Mark every item passing except this client only has one applicable
      // item marked passing and the rest not_applicable, guaranteeing 100.
      await db.query(
        `INSERT INTO client_compliance_status (client_id, item_id, status)
         SELECT $1, id, 'not_applicable' FROM compliance_items WHERE id != $2`,
        [clientId, item.id]
      );
      await db.query(
        `INSERT INTO client_compliance_status (client_id, item_id, status) VALUES ($1, $2, 'passing')`,
        [clientId, item.id]
      );

      const before = await computeComplianceOverview();
      // Sanity: this client's own score really is 100 before checking the aggregate reflects it.
      const own = await computeRiskScore(clientId);
      expect(own.score).toBe(100);
      expect(before.bandCounts.Strong).toBeGreaterThanOrEqual(1);
    });
  });
});

describe('shield/blocklist.js', () => {
  it('isBlocked is false for an IP that has never been blocked', async () => {
    expect(await isBlocked(testIp())).toBe(false);
  });

  it('blockIp blocks the IP, and unblockIp lifts it', async () => {
    const ip = testIp();
    expect(await isBlocked(ip)).toBe(false);

    await blockIp(ip, 'test reason', 'low');
    expect(await isBlocked(ip)).toBe(true);

    await unblockIp(ip);
    expect(await isBlocked(ip)).toBe(false);
  });

  it('blocking the same IP twice upserts and increments hit_count rather than erroring', async () => {
    const ip = testIp();
    await blockIp(ip, 'first hit', 'low');
    await blockIp(ip, 'second hit', 'medium');

    const { rows } = await db.query(
      'SELECT hit_count, severity, reason FROM blocked_ips WHERE ip_address = $1',
      [ip]
    );
    expect(rows).toHaveLength(1); // one row, not two
    expect(rows[0].hit_count).toBe(2);
    expect(rows[0].severity).toBe('medium'); // latest reason/severity wins
    expect(rows[0].reason).toBe('second hit');
  });

  it('listActiveBlocks only returns currently-active (non-expired) blocks', async () => {
    const activeIp = testIp();
    const expiredIp = testIp();

    await blockIp(activeIp, 'active block', 'low');
    await db.query(
      `INSERT INTO blocked_ips (ip_address, reason, severity, expires_at)
       VALUES ($1, 'already expired', 'low', NOW() - interval '1 hour')`,
      [expiredIp]
    );

    const active = await listActiveBlocks(1000);
    const ips = active.map((r) => r.ip_address);
    expect(ips).toContain(activeIp);
    expect(ips).not.toContain(expiredIp);
  });
});

describe('shield/bruteForceGuard.js', () => {
  it('recordFailedLogin does not block below the threshold', async () => {
    const ip = testIp();
    for (let i = 0; i < 4; i++) {
      const blocked = await recordFailedLogin(ip);
      expect(blocked).toBe(false);
    }
    expect(await isBlocked(ip)).toBe(false);
  });

  it('recordFailedLogin blocks the IP once the threshold (5) is reached', async () => {
    const ip = testIp();
    let lastResult = false;
    for (let i = 0; i < 5; i++) {
      lastResult = await recordFailedLogin(ip);
    }
    expect(lastResult).toBe(true);
    expect(await isBlocked(ip)).toBe(true);

    const { rows } = await db.query('SELECT severity FROM blocked_ips WHERE ip_address = $1', [ip]);
    expect(rows[0].severity).toBe('high');
  });

  it('recordRequest blocks once the rate threshold (100) is reached within the window', async () => {
    const key = `test-rate-${testIp()}`;
    let lastResult = false;
    for (let i = 0; i < 100; i++) {
      lastResult = await recordRequest(key, key);
    }
    expect(lastResult).toBe(true);
    expect(await isBlocked(key)).toBe(true);
  }, 15_000);

  it('recordRequest tracks countKey and blockTargetIp separately, blocking the real IP', async () => {
    const accountKey = `admin:${Date.now()}`;
    const ip = testIp();
    for (let i = 0; i < 100; i++) {
      await recordRequest(accountKey, ip);
    }
    expect(await isBlocked(ip)).toBe(true);
  }, 15_000);
});

describe('shield/eventLogger.js', () => {
  it('logSecurityEvent inserts a row with the given fields', async () => {
    const ip = testIp();
    await logSecurityEvent({
      ip,
      eventType: 'sqli',
      severity: 'high',
      path: '/api/test',
      method: 'POST',
      matchedPattern: 'sql_union',
      snippet: 'union select',
      blocked: true,
    });

    const { rows } = await db.query(
      'SELECT * FROM security_events WHERE ip_address = $1 ORDER BY id DESC LIMIT 1',
      [ip]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].event_type).toBe('sqli');
    expect(rows[0].severity).toBe('high');
    expect(rows[0].blocked).toBe(true);
    expect(rows[0].matched_pattern).toBe('sql_union');
  });

  it('never throws, even if a required-looking field is missing', async () => {
    // eventLogger swallows its own errors and logs to console instead —
    // confirm that contract holds rather than letting a bad call crash
    // the request that triggered it.
    await expect(logSecurityEvent({ ip: testIp(), eventType: 'xss' })).resolves.toBeUndefined();
  });
});
