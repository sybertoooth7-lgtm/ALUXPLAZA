[access-control-audit-methodology.md](https://github.com/user-attachments/files/30592160/access-control-audit-methodology.md)

# Access Control & Authentication Audit — Service Methodology

_A real, deliverable security service. Replaces "Behavioral Biometric AI" fiction with an actual auditable process._

## What this service actually is

A structured review of how a website or web app handles login, sessions, and access control — checking it against known best practices and producing a prioritized, evidence-based report. No AI theater, no invented scores. Every finding in the report is something the client (or anyone else) can independently reproduce and verify.

## Who it's for

Small businesses running their own login system — e-commerce admin panels, SaaS dashboards, client portals. A natural first market: Shopify store owners and small web-app operators who built custom auth themselves or hired freelancers and have never had it reviewed.

## Scope of a typical engagement

| Phase                   | What happens                                                                                                                                                                          | Deliverable                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1. Scoping call         | Confirm what's in scope (which domains/subdomains, is production or staging okay to test, any login credentials provided for authenticated testing) and get **written authorization** | Signed scope-of-work / authorization letter |
| 2. Automated pass       | Run the audit tool against the target: transport security, headers, cookies, JWT hygiene (if applicable), login endpoint hardening probe                                              | Raw findings (JSON)                         |
| 3. Manual review        | Human review of anything the tool flagged WARN/FAIL, plus manual checks the tool can't do (password reset flow, account enumeration, MFA presence, role/permission boundaries)        | Annotated findings                          |
| 4. Report               | Plain-English report: what was found, why it matters, how to fix it, ranked by real-world risk                                                                                        | PDF/Word report                             |
| 5. Follow-up (optional) | Re-test after client applies fixes                                                                                                                                                    | Confirmation letter / before-after summary  |

## What the automated tool checks (see `auth_audit.py`)

**Delivery path:** this tool is runnable directly from the admin dashboard (`/admin` → Tools tab) — enter a target URL, get results rendered inline, saved to a persistent run history. It no longer requires terminal/CLI access to deliver, closing the gap between "a client asks for this service via the contact form" and "someone actually runs it."

1. **Transport security** — is everything forced over HTTPS, does the TLS cert validate
2. **Security headers** — HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and whether server/version info is leaking
3. **Cookie security** — Secure / HttpOnly / SameSite flags on session cookies
4. **JWT hygiene** (if a sample token is provided) — signing algorithm, expiry, sensitive data in payload
5. **Login endpoint hardening** — a small, capped probe (default 5 requests) to see if the login endpoint signals any rate-limiting/lockout behavior

## What requires manual review (not automatable, and where your judgment/labor is the actual product)

- Password reset flow: does it leak whether an email exists (account enumeration)? Is the reset token single-use and short-lived?
- MFA: is it offered, and is it enforced for admin/privileged accounts?
- Role-based access control: can a low-privilege account reach admin-only URLs/API routes directly?
- Session handling: does logout actually invalidate the session server-side, or just clear the client cookie?
- Default/leftover credentials: any admin panels still on default passwords or exposed without auth?

## Sample severity framework for the report

- **Critical** — actively exploitable, e.g. alg=none JWT, admin panel reachable with no auth
- **High** — exploitable with modest effort, e.g. no rate limiting on login, weak session cookie flags
- **Medium** — best-practice gaps that raise risk, e.g. missing CSP, long-lived tokens
- **Low / Informational** — hardening suggestions, e.g. server version disclosure

## Legal & ethical guardrails (non-negotiable)

- Written authorization before any testing, every time — even on your own client's site, get it in writing (email is fine, but get it).
- Never test systems you don't have explicit permission for.
- The login-hardening probe is capped and non-destructive — it never attempts real credential guessing against real accounts.
- If you find something serious (e.g. an exposed admin panel), pause and report immediately rather than exploring further.

## Suggested starting price point (Kenya freelance/small-business market)

- Single small site (one login system, no complex RBAC): a fixed-scope engagement, priced as a flat deliverable rather than hourly, so the client knows the cost upfront.
- Position it as "Access Control & Authentication Audit" on your site/Fiverr gig — concrete and Google-able, unlike "Behavioral Biometric AI."
