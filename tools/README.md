[README.md](https://github.com/user-attachments/files/30592244/README.md)

# Tools

Real, tested scripts backing the services described in `docs/`. Every tool
here is passive-first, non-destructive, and intended to be run only against
systems you own or have explicit written authorization to test.

**Read this before selling or running any of these against a client's
systems.** Each entry below states plainly what the tool catches - and
just as importantly, what it does NOT catch. Being upfront about this is
what makes these services credible; overselling their depth is exactly the
kind of gap that undermines trust in a security practice.

## auth_audit.py — Access Control & Authentication Audit

**Checks:** TLS/HTTPS enforcement, security headers (HSTS/CSP/X-Frame-Options/
etc.), cookie flags (Secure/HttpOnly/SameSite), JWT hygiene (algorithm,
expiry, sensitive claims), login-endpoint rate-limiting signal.

**Does NOT check:** SQL injection, XSS, business-logic flaws (e.g. can user
A access user B's order by changing an ID in the URL), CSRF, server-side
request forgery, or anything requiring authenticated/logged-in testing
beyond a single supplied JWT. This is a **configuration and hygiene audit**,
not a penetration test. If a client needs those deeper checks, that's a
different, more manual (and typically more expensive) engagement - say so
explicitly rather than letting the service name imply broader coverage
than it has.

**Now integrated into the product, not just a CLI script:** the admin
dashboard's **Tools** tab (`/admin` -> Tools) lets you enter a target URL
and run this tool directly, with results rendered inline and saved to a
`tool_runs` history table (see `backend/src/routes/tools.js` and
`backend/migrations/003_add_tool_runs.sql`). This closes the gap where a
contact-form lead asking for this exact service had no actual delivery
path other than someone manually running a terminal command. The CLI
(`python3 tools/auth_audit.py <url>`) still works standalone too - the
dashboard calls the same script with a `--json` flag added for clean
machine-readable output (`--json` suppresses all the colored human-
readable printing and outputs a single JSON object instead).

## network_audit.py — Firewall & Network Hardening Audit

**Checks:** a capped list of 10 commonly-exposed management/database ports
(TCP-connect only, not a stealth scan), SPF/DMARC email security records,
CAA DNS records, TLS certificate expiry.

**Does NOT check:** actual firewall rule configuration (requires
server/console access this tool doesn't have), VPN setup, internal network
segmentation, or anything beyond the 10 scanned ports. A clean scan means
"none of these 10 specific ports are exposed" - not "this network has no
vulnerabilities."

## vuln_assessment.py — Vulnerability Assessment & Risk Scoring

**Checks:** a small set of sensitive exposed paths (`.git/HEAD`, `.env`,
common backups), software/version disclosure in headers, legacy TLS 1.0/1.1
support, `security.txt` presence. Produces a transparent, hand-verifiable
risk score (see the methodology doc for the exact formula).

**Does NOT check:** SQL injection, XSS, authentication bypass, business
logic flaws, or anything requiring active exploitation attempts. **Known
false-positive risk:** platforms with username/org-based routing (where any
path resolves to _some_ real content, e.g. GitHub itself) can trigger a
false FAIL on the exposed-paths check - always manually verify a FAIL
before it goes in a client report (see the methodology doc's "Known
limitation" section).

## backup_audit.py — Data Backup & Encryption Audit

**Checks:** plaintext sensitive files (SQL/CSV/JSON exports, `.env`, private
keys) and their permission bits in a local folder, whether found `.zip`
archives are actually password-protected (a real functional test), HTTPS on
a given backup destination URL, public-listing exposure on a given S3-style
bucket name.

**Does NOT check:** cloud-provider-side encryption-at-rest settings (can't
verify these without credentials - flagged as "confirm manually" rather
than guessed), backup retention policy, or whether backups are actually
restorable (a real, important question this tool cannot answer at all -
see the methodology doc).

## honeypot.js + report.js — Honeypot & Intrusion-Attempt Monitoring

**Does:** arms ~16 decoy Express routes that log real request data (IP,
path, user-agent) when touched; `report.js` summarizes the resulting log.

**Does NOT:** block, rate-limit, or take any action against an attacker -
this is detection/logging only. See "how could it stop any threats" in the
project history: none of these 9 tools are active defenses by design. If
you want active blocking, that's a real but separate feature (e.g. an
IP-ban script watching this log) - not built here yet.

## llm_security_review.py — AI/LLM Application Security Review

**Checks:** 4 of the OWASP Top 10 for LLM Applications categories that are
actually black-box testable from outside: prompt injection (LLM01),
improper output handling (LLM05), system prompt leakage (LLM07), unbounded
consumption/rate limiting (LLM10).

**Does NOT check:** the other 6 OWASP LLM categories (Sensitive Information
Disclosure, Supply Chain, Data/Model Poisoning, Excessive Agency,
Vector/Embedding Weaknesses, Misinformation) - these require architectural
review with actual system access, not an external API test. See the
methodology doc for why each of those can't be black-boxed.

## pqc_readiness.py — Post-Quantum Cryptography Readiness

**Checks:** TLS certificate algorithm (RSA/ECDSA) and key size, TLS version,
attempts to detect hybrid post-quantum key exchange support (requires
OpenSSL 3.5+ on the machine running the tool - honestly reports "could not
determine" rather than guessing when that's unavailable).

**Does NOT check:** anything beyond the TLS layer - this doesn't assess
application-level cryptography (e.g. how the app itself encrypts data at
rest), just the public TLS handshake. This is also, honestly, the
**lowest-urgency** service of the set - see the methodology doc's framing
guidance before selling it as time-sensitive.

## secrets_scanner.py — lightweight repo secrets scanner (bonus utility)

A simple regex-based scanner that walks a local repository/folder looking
for lines that look like hardcoded API keys, passwords, or secrets. This is
a genuinely different, simpler tool than the others above - not part of
the 9 named services, just a useful sanity-check to run over your own
codebase before a commit or a client handoff.

**Known limitation:** it's a heuristic regex match, not a real static-
analysis tool - it will flag its own source code (since it contains the
words "secret" and "password" in comments/variable names) and can miss
secrets that don't match its patterns, or flag things that aren't secrets
at all. Review every hit manually; don't treat "no hits" as proof a repo is
clean.

---

## The common thread

Every tool above is intentionally scoped to what can be checked passively,
safely, and legally without deep manual access or client-provided
credentials beyond what's explicitly documented per tool. That scope is a
deliberate choice, not a shortcut - but it means **the manual review step in
each service's methodology doc is not optional filler**. The tools generate
real, honest raw findings; turning those into a trustworthy client report
still requires a person applying judgment on top.
