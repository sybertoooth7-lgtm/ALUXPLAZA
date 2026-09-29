# Enterprise Controls

Governance baseline for Alux Plaza. This is a starter governance file; tighten
it as the engagement model settles.

## Baseline

- Repository: https://github.com/sybertoooth7-lgtm/ALUXPLAZA
- Standards the product is built against: NIST SP 800-61, PCI DSS, Kenya Data
  Protection Act 2019
- Automated controls already in place: `codeql.yml`, `gitleaks.yml`,
  `dependabot.yml`, `ci.yml`, `backend-ci.yml`, `frontend-ci.yml`
- Review surfaces already in place: `SECURITY.md`, `CONTRIBUTING.md`,
  `.github/pull_request_template.md`, and the issue templates

## Approval Expectations

- Security-sensitive changes — anything touching `backend/src/shield/`,
  `backend/src/middleware/auth.js`, `backend/src/middleware/rbac.js`,
  `backend/src/middleware/csrf.js`, `backend/src/lib/auth-cookie.js`,
  `backend/src/lib/authAudit.js`, or `backend/migrations/` — require an
  explicit reviewer acknowledgement. These are load-bearing for every auth
  guarantee the platform makes.
- Any change that relaxes a rate limit, body limit, lockout threshold, or
  enumeration-resistance behaviour is a security decision, not a tuning change.
  It needs a written justification in the commit body.
- Suppressions must include a reason and the narrowest viable matcher. Never
  widen a lint rule, a CodeQL exclusion, or a gitleaks allowlist pattern to
  make a check pass.
- Suppressions are auditable: prefer fixing the code, and if that is genuinely
  not possible, scope the exclusion to the smallest path that needs it and say
  why in a comment at the site.

## Data Handling

- No real client data, credentials, or personal data in the repository, in
  fixtures, in screenshots, or in `docs/`. The existing mockup screenshot is
  labelled as synthetic; keep that standard.
- Test data in `backend/test/` must be obviously fake. The test signing key is
  deliberately kept out of gitleaks' generic-api-key rule — extend that
  pattern rather than loosening the scanner.

## Escalation

- Suspected credential exposure: stop, rotate the credential, then fix. Do not
  batch it with other work.
- A vulnerability that is exploitable against a live client follows the
  disclosure path in `SECURITY.md`.
- When a control genuinely conflicts with a delivery deadline, escalate rather
  than quietly disabling the control.
