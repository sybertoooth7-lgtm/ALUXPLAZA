# Alux Plaza — Compliance Mapping

Maps the controls that exist in the repository to Kenya's Data Protection Act, 2019 (DPA), PCI DSS and NIST SP 800-61, and lists the gaps.

**How this was produced:** every "Implemented" row below was checked against a fresh pull of `main` (file paths given). DPA section numbers were checked against the Act's published table of contents. Nothing here is a legal opinion or a certification. Before relying on it for any client or regulator, have it reviewed by a qualified Kenyan data-protection lawyer.

**Status key:** Implemented = verified in code. Partial = exists but incomplete. Gap = not found in repo. Organisational = not a code matter.

---

## 1. Personal data inventory (what the system actually holds)

| Data | Where | Source of truth |
|---|---|---|
| Name, email, company, message | `contacts` table | `routes/contact.js`, migrations 001, 004 |
| Client account email, password hash, MFA secret | `clients`, admin tables | migrations 001, 019, 022 |
| Email attempted, IP address, user agent, success flag | `client_login_attempts` | `middleware/loginAudit.js`, migration 014 |
| Admin email, action, old/new row values | `audit_logs` | `middleware/auditLog.js`, migration 007 |
| IPs and attack metadata | Shield tables, `blocked_ips`, `rate_limits` | `shield/`, migrations 005, 011, 024 |

Third parties that receive data (processors): Resend (email), Sentry (errors, backend and frontend), the alert webhook (Slack/Discord, if `ALERT_WEBHOOK_URL` set), plus hosting/database providers (Render, Vercel, Neon). Most of these are likely outside Kenya; see section 3.

---

## 2. DPA 2019 mapping

| DPA reference | Requirement (summary) | Evidence in repo | Status |
|---|---|---|---|
| s.25 principles (minimisation, purpose limitation, storage limitation, accuracy) | Collect only what's needed; don't keep identifiable data longer than necessary | Contact form collects 4 fields with length limits (`contact.js`). `jobs/cleanup.js` purges tokens, sessions, rate limits, IP blocks (7 days after expiry), login attempts (90 days), Shield counters | **Partial.** No retention rule for `contacts`, `audit_logs`, or client records |
| s.26 rights of the data subject (access, correction, deletion, objection) | Be able to honour these on request | Privacy policy promises all of them (`PrivacyPolicy.tsx`). Only `DELETE /api/admin/submissions/:id` exists for contacts; no client delete/export route | **Gap.** Promise made, no tooling behind it (see 4.1, 4.2) |
| s.28, s.29, s.32 collection, notice, consent | Tell people why data is collected at the point of collection; consent must be demonstrable | `PrivacyPolicy.tsx` states purposes. `Contact.tsx` has no consent text, checkbox, or link to the policy; no consent record is stored | **Gap** (see 4.3) |
| s.41 data protection by design/default | Build protection in | httpOnly + Secure cookies, SameSite handling (`lib/auth-cookie.js`), CSRF double-submit (`middleware/csrf.js`), bcrypt cost 12, MFA secrets AES-256-GCM with HKDF key (`lib/mfa.js`), JWT 2h expiry, Helmet CSP + HSTS 1 year (`middleware/helmetConfig.js`), Postgres-backed rate limiting and token blocklist | **Implemented** |
| s.43 breach notification (Commissioner within 72 hours; data subjects without undue delay) | Detect, assess, notify | Detection exists (Shield, new-device alerts, admin security dashboard, alert webhook). No written breach-notification procedure or ODPC notification template found in repo or docs; the NIST 800-61 methodology doc in `docs/` is a client-facing service, not Alux Plaza's own plan | **Partial** (see 4.5) |
| Part VI transfers outside Kenya | Safeguards required before transfer | Data flows to Resend, Sentry, hosting providers. Privacy policy does not mention transfers or processors | **Gap** (see 4.4) |
| s.18 registration of controllers/processors | Register with the ODPC unless exempt | Not a code matter; nothing in repo confirms registration or an exemption decision | **Organisational.** Confirm status with the ODPC |
| Data Protection (General) Regulations 2021, reg. 23 | Maintain a data protection policy | `PrivacyPolicy.tsx` is the public notice; no internal policy document found | **Partial** |
| DPIA (Part IV) | Assess high-risk processing | None found. Probably low risk for a contact form; client security-assessment data may warrant one | **Organisational** |

---

## 3. PCI DSS

No payment code was found: a search for Stripe, M-Pesa, PayPal, Flutterwave, Paystack and card-number fields across `backend/src` and `frontend/src` returned nothing relevant. The platform does not store, process or transmit cardholder data, so **PCI DSS scope is effectively nil today.**

Two things to keep true:
- If payments are added later, use a provider's hosted checkout so card data never touches your servers.
- The controls you already have are still good practice against the related PCI requirements (authentication, logging, secure development), but you can't claim PCI compliance because of them.

---

## 4. Gaps, in priority order, with concrete fixes

### 4.1 Contact deletion doesn't actually erase the data (highest priority)
`DELETE /api/admin/submissions/:id` runs `DELETE FROM contacts ... RETURNING *` and then passes the full deleted row (`name`, `email`, `message`) into `recordAuditLog` as `oldValue` (`routes/admin.js`, around lines 409–421). The "deleted" personal data therefore lives on indefinitely in `audit_logs.old_value`, and `audit_logs` has no retention job.

**Fix:** log only the id and a non-identifying summary (e.g. `{ status, had_company }`) for deletions, and add a retention rule for `audit_logs`. Existing rows containing deleted contacts need a one-off scrub.

### 4.2 No data subject request tooling
The policy says people can access, correct or delete their data. Today that works only by an admin manually editing the database.

**Fix:** a superadmin-only endpoint (audit-logged) that, for a given email, exports everything held (contacts, client record, login attempts) as JSON, and a matching erase/anonymise action. Also add a short internal procedure: who receives `privacy@aluxplaza.com` requests and the response deadline you commit to.

### 4.3 No consent or notice at the point of collection
`Contact.tsx` has no privacy notice link or consent statement, and nothing records consent.

**Fix:** a one-line notice under the form linking to `/privacy`, a required checkbox, and a `consented_at` column on `contacts` (new migration).

### 4.4 Third-party processors and cross-border transfers not disclosed
**Fix:** add a "Who we share data with" section to the privacy policy listing processors by name and purpose, and a "Transfers outside Kenya" paragraph. Confirm each processor's data-processing terms and where the data is hosted. Also check whether alert-webhook messages or Sentry events can contain emails or IPs; the backend Sentry config does not set any scrubbing.

### 4.5 No written breach-response procedure
**Fix:** a one-page internal runbook: how a suspected breach is triaged, who decides it is notifiable, an ODPC notification template, and a template message to affected clients. Use the same NIST SP 800-61 phases you already document for clients (preparation, detection/analysis, containment/eradication/recovery, post-incident), and record the 72-hour clock start time as a mandatory field.

### 4.6 Retention periods are vague
The policy says data is kept "for as long as reasonably necessary." That's hard to defend or audit.

**Fix:** pick concrete periods (for example: unanswered/closed contacts 12 months, client records 24 months after engagement ends, audit logs 24 months, login attempts 90 days as today), add them to the policy, and extend `jobs/cleanup.js` to enforce them.

### 4.7 Audit log integrity
`recordAuditLog` deliberately fails open (a logging failure doesn't block the action), and the table is ordinary mutable rows. That is a reasonable availability tradeoff but means the log isn't tamper-evident.

**Fix (optional, lower priority):** restrict the application DB role to INSERT/SELECT on `audit_logs`, and alert when an audit write fails.

---

## 5. NIST SP 800-61 (your own incident response)

| Phase | What exists | Missing |
|---|---|---|
| Preparation | Shield, rate limiting, MFA, RBAC, tests, CI | Written plan and contact list |
| Detection and analysis | Shield events, login-attempt logging, new-device alerts, admin security dashboard, alert webhook | Severity classification and "is this a notifiable breach?" decision step |
| Containment, eradication, recovery | IP blocking, session revocation, token blocklist | Documented steps and ownership |
| Post-incident | None | Review template |

---

## 6. Suggested order of work

1. Fix audit-log leakage on contact deletion and scrub existing rows (4.1).
2. Consent notice + checkbox + `consented_at` (4.3).
3. Export and erase endpoints for data subject requests (4.2).
4. Update the privacy policy: processors, transfers, concrete retention periods (4.4, 4.6).
5. Write the breach runbook (4.5).
6. Extend the cleanup job to enforce the retention periods (4.6).
7. Confirm ODPC registration status with the Commissioner's office.

## 7. What this document does not cover

Whether Alux Plaza must register with the ODPC, any lawful-basis decision beyond consent, DPIA conclusions, certification, and a threat model for the production environment. Those need a lawyer, the regulator, or a proper assessment.
