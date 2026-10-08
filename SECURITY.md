# Security Policy

Alux Plaza is a cybersecurity consultancy platform — we hold ourselves to
the same standard we ask of our clients. If you've found a security issue
in this codebase or in the deployed platform, we want to hear about it.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
Public issues are visible to everyone, including anyone who might exploit
the report before a fix ships.

Instead, email:

> **[SECURITY_CONTACT_EMAIL — replace before publishing this file]**

Include as much of the following as you can:

- A description of the vulnerability and its potential impact
- Steps to reproduce it (a minimal proof-of-concept is ideal)
- The affected component (frontend, backend, a specific endpoint, etc.)
- Whether you've disclosed it anywhere else, or plan to

### What to expect

- **Acknowledgement:** within 3 business days of your report.
- **Initial assessment:** within 7 business days, including our
  severity classification and, where possible, an expected timeline for
  a fix.
- **Resolution:** timeline depends on severity and complexity, but we
  aim to patch critical issues (auth bypass, data exposure, RCE, etc.)
  within 14 days of confirming them.
- **Credit:** with your permission, we're happy to credit you by name
  (or handle) once the fix ships. Let us know your preference when you
  report.

We don't currently run a paid bug bounty program.

## Scope

**In scope:**

- This repository (`backend/` and `frontend/`)
- The deployed production platform (frontend on Vercel, backend on
  Render) at the domains listed in this repo's `README.md`

**Out of scope:**

- Third-party services we depend on but don't control (Vercel, Render,
  Neon, Resend) — please report those directly to the provider
- Social engineering of Alux Plaza staff, contractors, or clients
- Physical security of any facility
- Denial-of-service testing against the production environment —
  please report the theoretical issue instead of demonstrating it live
- Automated vulnerability scanning against production without prior
  written permission (email us first — we're generally happy to say
  yes, we just don't want unannounced scans tripping our own detection
  and rate-limiting systems)

## Safe harbor

If you make a good-faith effort to comply with this policy during your
research — including avoiding privacy violations, data destruction, and
service disruption — we will not pursue legal action against you for
that research, and we'll consider it authorized under any applicable
anti-hacking laws (e.g., the Computer Fraud and Abuse Act) and Kenya's
Computer Misuse and Cybercrimes Act. This safe harbor does not extend to
third-party systems (see Scope above) — you're on your own with them.

## Supported versions

Alux Plaza is a continuously-deployed web application, not a versioned
package — there is only ever one supported version: whatever is
currently live in production. We don't maintain security patches for
older commits or deployments.

## For developers working on this repo

A few things this codebase already does that are worth preserving in
any change you make:

- Client and admin sessions use separate httpOnly cookies
  (`clientToken` / `adminToken`) — never mix the two auth contexts.
- Every state-changing request requires a CSRF token
  (`x-csrf-token` header, from `GET /api/csrf-token`).
- `config.js` refuses to boot with a weak `JWT_SECRET` — don't weaken
  that check.
- Rate limiting is Postgres-backed (`src/lib/rate-limit-store.js`) —
  there is no Redis dependency, and none should be reintroduced without
  updating this policy and the relevant docs.
- Enumeration-resistant responses (signup, password reset, resend-
  verification all return identical success responses regardless of
  whether the account exists) — don't leak account existence through a
  new endpoint's error messages or status codes.

If you're unsure whether a change has security implications, ask before
merging rather than after.
