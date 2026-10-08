# ALUXPLAZA Security Architecture & Hardening Roadmap

**Version:** 1.0  
**Last Updated:** 2026-10-05  
**Status:** Active — guides implementation priorities

---

## Overview

ALUXPLAZA is a multi-tenant compliance and authentication platform handling sensitive user data, admin credentials, and security events. The current architecture has strong foundations in auth, auditing, and threat detection, but faces challenges in operational resilience, maintainability, and alert noise.

This document defines:

1. **Threat model** — what we defend against
2. **Trust boundaries** — where privilege changes
3. **Current strengths** — what's working well
4. **Known gaps** — where complexity creates risk
5. **Hardening roadmap** — phased improvements prioritized by impact

---

## Part 1: Threat Model

### Assets Under Protection

- **Admin accounts** — gateway to platform, customer data, configuration
- **Client accounts** — user credentials, login history, compliance records
- **Login audit trail** — source of truth for detecting account takeover and credential abuse
- **IP blocklist** — defense layer against volumetric and distributed attacks
- **Email delivery** — confirmation, password reset, new-device alerts
- **Configuration state** — JWT secrets, CSRF tokens, rate limits, shield tuning

### Primary Threats

1. **Credential stuffing / brute force** → account takeover
   - Detection: per-IP failed login rate, per-account failed login count
   - Response: temporary IP block, account lockout, new-device alert

2. **Distributed credential attack** → same account, many IPs
   - Detection: >20 distinct IPs failing against one account in 30 min
   - Response: alert only (no automatic block; human judgment required)

3. **Account enumeration / email spraying** → harvest valid emails
   - Detection: >20 distinct emails failing from one IP in 30 min
   - Response: alert only

4. **CSRF attacks** → unintended admin actions
   - Defense: synchronizer token + httpOnly cookie
   - Trust boundary: only requests carrying matching CSRF token proceed

5. **JWT compromise** → impersonation
   - Defense: short-lived tokens, token blocklist for revocation
   - Risk: one leaked token can act until expiry or blocklist prunes

6. **SQL injection / request smuggling** → data exfil, privilege escalation
   - Defense: parameterized queries (all ORM/db.js calls), helmet headers, rate limiting
   - Risk: logic bugs in stored procedures or malformed SQL

7. **Admin account lockout (DoS)** → service unavailability
   - Detection: 5 consecutive failed admin logins
   - Response: 15-min account lockout
   - Risk: attacker knowing admin email can lock them out repeatedly

8. **False positives in Shield** → legitimate users blocked
   - Example: aggressive SQL injection signature blocks valid queries
   - Impact: customer frustration, support burden, potential revenue loss
   - Feedback loop: admins unblock IPs; feedback tuned into signature stats

---

## Part 2: Trust Boundaries & Authentication

### Admin Auth Flow

```
1. Admin submits email + password → POST /api/admin/login
2. Backend verifies password hash
3. JWT issued (httpOnly cookie, signed with JWT_SECRET)
4. JWT decoded on every admin request via middleware
5. On logout or after 12 lockouts, token added to blocklist
6. Blocklist checked on every request
```

**Current issues:**

- No issuer/audience claims → tokens not bound to a specific service/audience
- No refresh token rotation → one leaked token lasts until expiry
- Token blocklist is in-memory → cleared on restart (lost revocation history)
- Lockout is per-account, but attacker knows admin email → can DoS admin indefinitely

### Client Auth Flow

```
1. Client submits email + password → POST /api/client/login
2. Backend verifies password hash
3. JWT issued (httpOnly cookie, signed with JWT_SECRET)
4. On verification code submission, a second JWT is issued (same secret)
5. New-device detected via IP history or user-agent fingerprint
6. Email alert sent (best-effort; no guarantee of delivery)
```

**Current issues:**

- Same JWT_SECRET for admin and client → token confusion possible (see Part 4 below)
- No audience/type claim → server cannot distinguish "admin" from "client" token by design
- New-device alert is best-effort, queued async → no guarantee customer sees it before attacker uses account
- No rate limit on email verification attempts → attacker can spam /api/verify endpoint

### CSRF Defense

```
1. Request arrives without CSRF cookie
2. Server generates random token, returns in cookie
3. Client includes token in X-CSRF-Token header on mutations
4. Server verifies header matches cookie
5. Token regenerated after login to prevent fixation
```

**Current issues:**

- Cookie SameSite not explicitly set in code (relies on Helmet defaults)
- No expiry on CSRF token itself → stale tokens accepted indefinitely
- No per-request token rotation → one stale token can be replayed

---

## Part 3: Current Architecture Strengths

### 1. **Comprehensive Audit Logging**

- Every login attempt recorded with IP, email, success/failure, user-agent
- Enables detection of distributed attacks after the fact
- Audit trail is immutable once written

### 2. **Multi-Layer Rate Limiting**

- Per-IP rate limit on login endpoints
- Per-account failed login counter with 15-min lockout
- Per-email verification window
- Alert throttling to prevent Slack/Discord spam

### 3. **Shield System (Attack Detection)**

- Signature-based request scanning (SQL injection, XSS, etc.)
- IP blocklisting with configurable duration per severity
- Hit-count tracking for repeat offenders
- False-positive feedback loop (unblock → recorded as false-positive)

### 4. **Monitoring & Alerting**

- Sentry integration for error tracking
- Slack/Discord webhook for critical events
- Alert throttling (same key not re-sent within 5 min)
- Structured logging with context (IP, user, severity)

### 5. **Email Queue & Retry**

- Email sent async to avoid blocking login/verify
- Retry logic with exponential backoff
- Fallback to direct Resend API if queue fails

### 6. **Config Validation**

- JWT_SECRET length checked at startup
- CORS_ORIGIN validated on boot
- Missing DATABASE_URL causes startup failure (not silent fallback)

---

## Part 4: Known Gaps & Complexity Risks

### Gap 1: Token Confusion (Admin ↔ Client)

**Risk Level:** MEDIUM

Both admin and client tokens signed with same `JWT_SECRET` and have no `aud` (audience) claim.

**Scenario:**

- Attacker obtains a client JWT (lower-privilege attack surface)
- Attacker submits it to an admin endpoint (e.g., `/api/admin/users`)
- If endpoint only checks token validity (not role), attacker gains admin access

**Current mitigation:**

- `requireAuth()` middleware checks `isAdmin` flag on decoded token
- Client tokens don't have this flag set

**Problem:**

- If a developer forgets to check `isAdmin`, the vulnerability opens
- No validation that admin endpoints are never called with client tokens

**Hardening:** Add JWT audience claim (`aud: 'admin'` or `aud: 'client'`) and validate on every request.

---

### Gap 2: In-Memory Token Blocklist (Ephemeral State)

**Risk Level:** MEDIUM

Token blocklist stored in RAM; cleared on server restart.

**Scenario:**

1. Admin logs out or is compromised at 10:00 AM
2. Token added to `blocklist_tokens` table AND in-memory `tokenBlocklist` Map
3. Server restarts at 10:30 AM
4. In-memory blocklist cleared; DB entry persists
5. Attacker replays token; `isBlocklisted()` checks in-memory Map first, misses it
6. Token is valid for 1 hour (until expiry)

**Current mitigation:**

- `isBlocklisted()` queries DB before accepting token
- But there's a race condition if DB query is slow

**Problem:**

- Why cache at all if you query DB on every request?
- In-memory cache adds complexity with no performance gain on a well-indexed DB

**Hardening:** Remove in-memory cache; always query DB. Add DB index on `(jti, expires_at)` for performance.

---

### Gap 3: Alert Fatigue & Noise

**Risk Level:** LOW (operational, not security)

Alert throttling is in-memory and per-key. Under attack:

- Similar events from different IPs produce different throttle keys
- Alert channel floods with notifications
- Operations team becomes numb; real attacks get missed

**Example:**

```
[10:00] 🛡️ Shield auto-blocked 192.0.2.1 (high): SQL injection detected
[10:02] 🛡️ Shield auto-blocked 192.0.2.2 (high): SQL injection detected
[10:04] 🛡️ Shield auto-blocked 192.0.2.3 (high): SQL injection detected
... (20 more similar) → alert channel drowns, ops doesn't see them
```

**Hardening:** Aggregate alerts by signature; send summaries every 5-15 min instead of per-event.

---

### Gap 4: Stale Security State (No Background Cleanup)

**Risk Level:** MEDIUM

No scheduled jobs to purge expired state:

- `token_blocklist` rows stay indefinitely (disk bloat)
- Old `client_login_attempts` rows accumulate (makes queries slower)
- Shield stats never purge old signatures (noise in tuning reports)

**Impact:**

- Queries get slower over time
- False-positive reports become less interpretable (old junk signatures)
- Disk usage grows unbounded

**Hardening:** Add cron job to purge rows older than 90 days.

---

### Gap 5: Middleware Ordering Not Explicit

**Risk Level:** MEDIUM-HIGH

No documented contract for which middleware runs in which order for each route.

**Risk:**

- CSRF check might run before auth (weird edge cases)
- Rate limit might run after auth (expensive to deny a rate-limited user)
- Shield might run after other checks (attackers bypass if early check fails)

**Example:**

```javascript
// Current index.js — middleware order not documented
app.use(setCsrfCookie);
app.use(helmet());
app.use(rateLimit); // or should this be first?
app.use(shieldMiddleware);
app.use(requireAuth);
app.post('/api/admin/users', adminUsers.create);
```

**Hardening:** Add a route metadata file defining expected middleware order per route.

---

### Gap 6: Distributed Attack Detection is Observe-Only

**Risk Level:** HIGH (operational safety)

When `detectDistributedFailure()` finds >20 distinct IPs failing against one account, it:

- Logs a security event
- Sends an alert
- Does **NOT** block

**Rationale:** Automatic block could lock out real customers (false positive).

**Problem:**

- Attacker can continue brute-forcing if not monitoring alerts
- "Observe-only" is correct but puts all burden on human response
- No automatic escalation if condition persists (e.g., block after 50 distinct IPs?)

**Hardening:** Add tiered response:

- 20+ IPs → alert + log (current)
- 50+ IPs in 30 min → auto-block account for 30 min + stronger alert
- Both actions visible in audit trail for review

---

### Gap 7: No Request Correlation / Tracing

**Risk Level:** LOW-MEDIUM (observability, not security)

When a suspicious user triggers multiple security systems (rate limit + new-device + shield block), the logs are disconnected.

**Scenario:**

```
[10:00:01] Login attempt failed from 192.0.2.1 (wrong password)
[10:00:02] Login attempt failed from 192.0.2.1 (wrong password)
[10:00:03] Shield blocked 192.0.2.1 (SQL injection in User-Agent)
[10:00:05] IP 192.0.2.1 added to blocklist (rate limit)
```

Operator cannot easily see this is one coordinated attack on one user from one IP.

**Hardening:** Attach `X-Request-ID` to every request; include in all logs.

---

### Gap 8: No Formal Security Review / Regression Tests

**Risk Level:** HIGH

No tests for:

- CSRF token mismatch behavior
- Client token cannot access admin endpoints
- Token blocklist actually blocks compromised tokens
- Distributed attack detection thresholds
- Admin lockout behavior
- New-device alert generation

Each of these is a subtle behavior that can regress silently.

**Hardening:** Add dedicated security test suite (see Part 5).

---

## Part 5: Hardening Roadmap

### Phase 1: Critical (Implement First)

**Estimated effort:** 2–3 weeks  
**Impact:** Reduces account takeover and token compromise risk significantly

#### 1.1 Add JWT Audience Claims

- Admin tokens: `aud: 'admin'`, `sub: admin_id`
- Client tokens: `aud: 'client'`, `sub: client_id`
- Validate on every protected route
- **Files:** `backend/src/routes/clientAuth.js`, `backend/src/routes/admin.js`, `backend/src/middleware/auth.js`
- **Test:** `backend/test/clientAuth.test.js`, `backend/test/shield.test.js`

#### 1.2 Remove In-Memory Token Blocklist

- Delete `tokenBlocklist` Map in `auth.js`
- Always query `DB` in `isBlocklisted()`
- Add index: `CREATE INDEX idx_token_blocklist_jti_expires ON token_blocklist (jti, expires_at);`
- Measure query latency; cache in Redis if needed
- **Files:** `backend/src/middleware/auth.js`, `backend/src/migrations/*/add_token_blocklist_index.sql`

#### 1.3 Centralize Security Config

- Create `backend/src/security/config.ts` (or .js) with validated defaults
- Move JWT settings, CSRF settings, rate-limit thresholds, alert config here
- Validate at startup; fail fast on misconfiguration
- **Files:** `backend/src/security/config.js`, `backend/src/index.js`

#### 1.4 Add Security Test Suite

- Test client token cannot access admin endpoints
- Test admin token cannot access client endpoints
- Test token blocklist blocks revoked tokens
- Test CSRF token regeneration after login
- **Files:** `backend/test/security.test.js` (new file)

---

### Phase 2: Important (Implement in 2–3 Weeks)

**Estimated effort:** 2–3 weeks  
**Impact:** Reduces operational overhead and alert fatigue

#### 2.1 Implement Alert Aggregation

- Create `backend/src/alerting/aggregator.js`
- Group similar alerts by signature + severity
- Send summary every 5–15 minutes instead of per-event
- Track in DB: `alert_aggregate` table with signature, count, severity, first_seen, last_seen
- **Files:** `backend/src/alerting/aggregator.js`, `backend/src/monitoring.js`, migrations

#### 2.2 Add Scheduled Cleanup Jobs

- Create `backend/src/jobs/cleanup.js`
- Purge `token_blocklist` rows older than 30 days
- Purge `client_login_attempts` rows older than 90 days
- Purge `shield_events` rows older than 180 days (keep stats, delete raw events)
- Run daily via `node -e "import('./src/jobs/cleanup.js').then(m => m.run())"`
- **Files:** `backend/src/jobs/cleanup.js`, `package.json` (add cron/scheduler dependency)

#### 2.3 Add Request Correlation IDs

- Generate UUID for every request in Express middleware
- Include in all log statements
- Return in response header `X-Request-ID`
- Makes incident review much easier
- **Files:** `backend/src/middleware/`, `backend/src/logger.js`

#### 2.4 Document Middleware Ordering

- Create `MIDDLEWARE_CONTRACT.md` specifying order and purpose per route family
- Update `index.js` with comments
- Example:
  ```
  Global middleware:
  1. Logger + correlation ID
  2. Body parser
  3. Helmet
  4. CORS
  5. Shield (before auth to block requests early)

  Admin routes:
  6. Rate limit (login only)
  7. CSRF verification
  8. Require admin auth
  9. Audit log

  Client routes:
  6. Rate limit (verification only)
  7. CSRF verification (if needed)
  8. Require client auth
  9. Audit log
  ```
- **Files:** `backend/MIDDLEWARE_CONTRACT.md`, `backend/src/index.js`

---

### Phase 3: Operational (Implement in 3–4 Weeks)

**Estimated effort:** 1–2 weeks  
**Impact:** Improves situational awareness and tuning feedback loop

#### 3.1 Add Tiered Distributed Attack Response

- 20+ distinct IPs in 30 min → alert + log (current behavior)
- 50+ distinct IPs in 30 min → auto-block account for 30 min (new)
- 100+ distinct IPs in 15 min → alert with severity "critical" (new)
- Actions logged in `security_events` table with `admin_action` = 'auto_block'
- Allow manual unblock with reason
- **Files:** `backend/src/middleware/loginAudit.js`

#### 3.2 Add False-Positive Review Workflow

- Create admin endpoint: `GET /api/admin/security/false-positives`
- Show:
  - Signature key
  - Block count
  - False-positive count + rate
  - Most recent unblock note
  - List of recent unblocks (email, note, timestamp)
- **Files:** `backend/src/routes/adminSecurity.js`, `backend/src/shield/blocklist.js`

#### 3.3 Add Security Event Dashboard

- Show:
  - Real-time active IP blocks (count, severity distribution)
  - Recent security events (login abuse, new-device, distributed attacks)
  - Alert throughput (events/min over last 24h)
  - Blocklist false-positive rate per signature
- **Files:** Frontend admin dashboard HTML, `backend/src/routes/adminSecurity.js`

---

### Phase 4: Architectural (Implement in 4+ Weeks)

**Estimated effort:** 3–4 weeks  
**Impact:** Foundation for future compliance and scaling

#### 4.1 Separate "Event" from "Action"

- Create `backend/src/security/eventBus.js`
- All security detections emit events (not side effects)
- Events routed to:
  - Logger (always)
  - Alert channel (if severity >= HIGH)
  - Blocklist (if auto-block enabled for this signature)
  - Audit trail (always)
- Example:
  ```javascript
  emit('login_failed', { clientId, email, ip, reason: 'wrong_password' });
  // → auto-routed to logger, audit

  emit('distributed_attack', { eventType: 'credential_stuffing', ... });
  // → routed to logger, audit, alert channel, decision engine

  emit('shield_match', { signature, ip, ... });
  // → routed to logger, audit, blocklist (if auto_block enabled), alert
  ```
- Enables tuning: disable one rule → stop blocking that signature, but keep logging

#### 4.2 Add Security Archive

- Create `security_archive` schema in PostgreSQL
- Monthly snapshots of:
  - IP blocks (active at end of month)
  - Blocked signature stats
  - Unblock feedback
  - Distributed attacks (high-level stats)
- Query for compliance reports, trend analysis
- **Files:** `backend/src/jobs/archive.js`, migrations

#### 4.3 Extend Audit Trail Format

- Capture:
  - Request headers (subset: User-Agent, Referer, X-Forwarded-For)
  - Response status and latency
  - Security events triggered (shield matches, rate limit, new device, etc.)
  - Admin actions (unblock, config change, etc.)
- Use for forensics and anomaly detection
- **Files:** `backend/src/shield/eventLogger.js`, `backend/src/middleware/auditLog.js`

---

## Part 6: Implementation Priority Matrix

| Feature                    | Phase | Effort | Impact | Risk of Not Doing        | Start Date |
| -------------------------- | ----- | ------ | ------ | ------------------------ | ---------- |
| JWT audience claims        | 1     | 5d     | High   | Token confusion          | Week 1     |
| Remove in-memory blocklist | 1     | 3d     | High   | Restart data loss        | Week 1     |
| Centralize security config | 1     | 3d     | Medium | Misconfiguration         | Week 2     |
| Security test suite        | 1     | 5d     | High   | Regressions              | Week 2     |
| Alert aggregation          | 2     | 5d     | Medium | Alert fatigue            | Week 3     |
| Scheduled cleanup          | 2     | 3d     | Medium | Disk bloat, slow queries | Week 3     |
| Request correlation IDs    | 2     | 2d     | Low    | Hard to debug            | Week 4     |
| Middleware documentation   | 2     | 2d     | Medium | Ordering mistakes        | Week 4     |
| Tiered response to attacks | 3     | 3d     | High   | Attacker persistence     | Week 5     |
| False-positive workflow    | 3     | 3d     | Medium | Blind tuning             | Week 5     |
| Event bus refactor         | 4     | 10d    | High   | Foundation for scaling   | Week 7     |

---

## Part 7: Success Metrics

After implementing this roadmap, the system should exhibit:

1. **Zero token-confusion vulnerabilities**
   - Every endpoint validates JWT audience claim
   - Admin and client tokens are cryptographically distinct

2. **Durable revocation**
   - Token blocklist survives server restarts
   - No in-memory state loss

3. **Alert signal-to-noise ratio < 1:10**
   - Aggregated alerts (max 2–3 per minute during attacks)
   - Ops team can respond to critical alerts within 5 min

4. **Query latency < 50ms at p99**
   - Token blocklist queries cached or optimized
   - No timeout issues on auth checks

5. **Audit trail completeness**
   - Every security decision logged with metadata (IP, user, severity, action taken)
   - 90 days retention minimum

6. **Security regression test pass rate = 100%**
   - No silent failures in auth, CSRF, or blocklist logic
   - PRs require security tests to pass

7. **False-positive rate < 1% (by signature)**
   - Lowest-quality signatures tuned or disabled
   - Unblock feedback loop working

8. **On-call response time < 15 min**
   - Alert aggregation makes investigations tractable
   - Request correlation IDs enable quick root cause

---

## Part 8: Rollout Strategy

### For Each Phase:

1. **Branch:** Create feature branch with PR for review
2. **Test:** All security tests pass; no regressions
3. **Deploy to staging:** Full integration test suite
4. **Canary deploy:** 10% of traffic for 24h
5. **Monitor:** Check latency, error rates, alert volume
6. **GA:** Roll out to 100%
7. **Backfill:** Historical data migration (if applicable)

### Communication:

- Post security architecture doc in README
- Add SECURITY.md with vulnerability disclosure policy
- Include breaking changes in CHANGELOG (e.g., JWT audience requirement)

---

## Part 9: Long-Term Vision (6+ Months)

- **Multi-factor auth (TOTP/FIDO2)** for admin accounts
- **Passwordless login** option for clients (OAuth/OIDC)
- **Rate limiting in Redis** (distributed across servers)
- **Machine learning** for anomaly detection (unusual login times/locations)
- **Compliance dashboards** (SOC 2, HIPAA audit trail exports)
- **Zero-knowledge proofs** for sensitive operations (e.g., unblock feedback)

---

## References

- **OWASP Top 10:** https://owasp.org/www-project-top-ten/
- **JWT Best Practices:** https://tools.ietf.org/html/rfc8725
- **NIST Authentication Guidelines:** https://pages.nist.gov/800-63-3/
- **Falsehoods Programmers Believe About Authentication:** https://medium.com/@oxidedbits/falsehoods-programmers-believe-about-authentication-d433fbcf04fd

---

## Appendix: File Changes Summary

### New Files

- `backend/src/security/config.js` — centralized security settings
- `backend/src/alerting/aggregator.js` — alert coalescing logic
- `backend/src/jobs/cleanup.js` — scheduled state purge
- `backend/src/security/eventBus.js` (Phase 4) — event routing
- `backend/test/security.test.js` — security regression tests
- `backend/MIDDLEWARE_CONTRACT.md` — middleware ordering spec
- `SECURITY_ARCHITECTURE.md` (this file)

### Modified Files

- `backend/src/middleware/auth.js` — add JWT audience validation, remove in-memory cache
- `backend/src/middleware/loginAudit.js` — add tiered distributed attack response
- `backend/src/monitoring.js` — integrate alert aggregator
- `backend/src/index.js` — wire up security config, document middleware order
- `backend/src/routes/adminSecurity.js` — add false-positive report, dashboard endpoints
- `backend/src/shield/blocklist.js` — improve stats tracking
- `backend/src/logger.js` — add correlation ID injection
- `backend/package.json` — add scheduler dependency (if needed)

### Database Migrations

- Add index: `token_blocklist (jti, expires_at)`
- Add tables: `alert_aggregate`, `security_archive` (Phase 4)
- Add column: `security_events.request_id` (Phase 2)

---

## Questions & Discussion

**Who's responsible for each phase?**

- Phase 1: Security + Backend leads (critical path)
- Phase 2: Backend + DevOps (operational health)
- Phase 3: Backend + Security (tuning feedback)
- Phase 4: Architecture + Backend (scaling foundation)

**Do we need to migrate existing JWT tokens?**

- Yes: add `aud` and `sub` claims to all new tokens issued
- Existing tokens without `aud` still accepted during transition period (30 days)
- After grace period, reject tokens without `aud`

**Will this break existing integrations?**

- Client libraries must pass `aud: 'client'` on login requests (no change to API)
- Admin dashboards must validate JWT audience (internal change only)
- No breaking API changes if done correctly

**Timeline?**

- Phase 1 + 2: 4–6 weeks
- Phase 3: 6–8 weeks
- Phase 4: 8–12 weeks
- Full hardening: ~3 months

---

**Document maintained by:** Security Team  
**Last reviewed:** 2026-10-05  
**Next review:** 2026-11-05
