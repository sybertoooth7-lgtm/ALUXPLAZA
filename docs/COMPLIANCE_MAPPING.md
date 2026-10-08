# Alux Plaza — Compliance Mapping

Maps the controls that exist in the repository to Kenya's Data Protection Act, 2019 (DPA), the Data Protection (General) Regulations 2021, PCI DSS and NIST SP 800-61, and lists the gaps.

**Last updated:** 8 October 2026.

**How this was produced:** every status below was checked against a fresh pull of `main` on that date (file paths given). DPA section numbers were checked against the Act's published table of contents, and regulation numbers against the Legal Notice 263 of 2021 text on Kenya Law. Nothing here is a legal opinion or a certification. Before relying on it for any client or regulator, have it reviewed by a qualified Kenyan data-protection lawyer.

**Not verified:** the state of the production database. The migration runner applies new migrations at boot, so migrations 026–029 should run on the next deploy, but this document cannot confirm they have.

**Status key:**

| Status | Meaning |
|---|---|
| Done | Implemented and present on `main`, with tests |
| Built, awaiting merge | Written and tested, but not on `main` when checked |
| Partial | Exists but incomplete |
| Gap | Not found in the repo |
| Organisational | Not a code matter |

---

## 0. Status at a glance

| Item | What | Status |
|---|---|---|
| 4.1 | Deleted contacts no longer leave personal data in `audit_logs`; existing rows scrubbed | **Done** |
| 4.2 | Export and erase tooling for data-subject requests, plus runbook | **Done** |
| 4.3 | Consent checkbox and `consented_at` on the contact form and client signup | **Done** (notice wording still incomplete, see 4.4) |
| 4.4 | Privacy policy: processors, transfers, cookies, retention, rights, complaints, content required by reg. 4(1) | **Built, awaiting merge** (needs your confirmation of provider facts and retention periods) |
| 4.5 | Written breach-response procedure | **Gap** |
| 4.6 | Concrete retention periods, enforced | **Gap** |
| 4.7 | Audit-log integrity | **Gap** (optional) |
| — | ODPC registration, DPIA, lawful-basis decision (including whether consent is valid for signup), processor contracts | **Organisational** |

Also fixed along the way: migration 026 adds the `disabled_at` columns that the authentication code reads but no earlier migration created.

---

## 1. Personal data inventory (what the system actually holds)

| Data | Where | Source of truth |
|---|---|---|
| Name, email, company, message, consent time | `contacts` | `routes/contact.js`, migrations 001, 004, 028 |
| Client account: company name, email, password hash, consent time | `clients` | `routes/clientAuth.js`, migrations 012, 015, 022, 026, 029 |
| Client sessions: IP address, browser, times | `client_sessions` | `middleware/clientAuth.js`, migrations 016, 022 |
| Email attempted, IP address, browser, success flag | `client_login_attempts` | `middleware/loginAudit.js`, migrations 014, 016 |
| Verification and password-reset tokens (hashed) | `client_email_verifications`, `client_password_resets` | migration 022 |
| Risk-score share links (publicly show the company name) | `risk_score_shares` | migration 013 |
| Compliance assessment records and free-text notes per client | `client_compliance_status` | migration 012 |
| Admin staff accounts, including the MFA secret (encrypted) | `admin_users` | migrations 001, 017, 019, 020 |
| Admin action, target, old and new values | `audit_logs` | `middleware/auditLog.js`, migration 007 |
| IPs and attack metadata | Shield tables, `blocked_ips`, `rate_limits` | `shield/`, migrations 005, 011, 024 |
| Queued email jobs (contain recipient emails and, for contact notifications, the sender's name, company, email and message); kept about 24 hours after completion | `pgboss.job` | `lib/email-queue.js` |

Third parties that receive data (processors): Resend (email), Sentry (errors, backend and frontend), and the alert webhook if `ALERT_WEBHOOK_URL` is set. The hosting and database providers are not determined from the repo code and should be confirmed. At least some of these are likely outside Kenya; see 4.4.

---

## 2. DPA 2019 and Regulations 2021 mapping

| Reference | Requirement (summary) | Evidence in repo | Status |
|---|---|---|---|
| DPA s.25 principles (minimisation, purpose limitation, storage limitation, accuracy) | Collect only what's needed; don't keep identifiable data longer than necessary | Contact form collects 4 fields with length limits (`contact.js`). `jobs/cleanup.js` purges tokens, sessions, rate limits, IP blocks (7 days after expiry), login attempts (90 days) and Shield counters | **Partial.** No retention rule for `contacts`, `audit_logs` or client records (see 4.6) |
| DPA s.25 / s.26 deletion integrity | Deleted data must actually be gone | Deleting a contact used to copy the whole row into `audit_logs.old_value`. Fixed in `routes/admin.js`; migration 027 scrubs existing rows; `test/adminAudit.test.js` | **Done** (4.1). Database backups taken earlier still hold the old data until they age out |
| DPA s.26 rights of the data subject (access, correction, deletion, objection); Regs. 9, 12 | Honour requests within the deadlines: access 7 days, erasure 14 days | Export and erase endpoints (superadmin-only, dry-run by default, audit-logged without the email), a schema-drift guard, and `docs/DATA_SUBJECT_REQUESTS.md` with deadlines, steps and a reply template; `test/dataSubjects.test.js` | **Done** (4.2). API-only; third-party and backup cleanup is manual; rectification and portability are by hand |
| DPA s.28, s.29, s.32 collection, notice, consent | Tell people why data is collected at the point of collection; consent must be demonstrable | Required checkbox linking to `/privacy-policy` on `Contact.tsx` and `ClientSignup.tsx`; server rejects anything but boolean `true`; time stored in `consented_at` (migrations 028, 029); tests in `contact.test.js`, `clientAuth.test.js` | **Done** (4.3), with caveats: the notice content is incomplete (next row); existing rows and admin-created clients have no consent recorded; which notice version someone saw is not stored |
| Reg. 4(1) content of the notice | When relying on consent, tell the person: who the controller is, the purpose, the type of data, the risks of transfers abroad, whether data is shared with third parties, the right to withdraw, and the implications of giving, withholding or withdrawing consent | Rewritten `PrivacyPolicy.tsx` covers every item: controller, purposes, data collected, a named-provider table, transfer risks, withdrawal, and what happens if consent is withheld. The checkbox text itself still only names the purpose and withdrawal, and links to the policy for the rest | **Built, awaiting merge** (4.4) |
| Reg. 4(4)(b), (d) consent must be freely given | Consent is not free if it is a non-negotiable part of the terms, or if several purposes are merged | The signup checkbox must be ticked to create an account, which may count as non-negotiable. The contact form is similar: you can't send a message without it | **Organisational.** Needs a lawyer: a contract basis may fit client accounts better than consent (see Lawful basis) |
| DPA s.41 data protection by design/default | Build protection in | httpOnly + Secure cookies, SameSite handling (`lib/auth-cookie.js`), CSRF double-submit (`middleware/csrf.js`), bcrypt cost 12, MFA secrets AES-256-GCM with HKDF key (`lib/mfa.js`), JWT 2h expiry, Helmet CSP + HSTS 1 year (`middleware/helmetConfig.js`), Postgres-backed rate limiting and token blocklist | **Done** |
| DPA s.43 breach notification (Commissioner within 72 hours; data subjects without undue delay) | Detect, assess, notify | Detection exists (Shield, new-device alerts, admin security dashboard, alert webhook). No written breach-notification procedure or ODPC notification template found; the NIST 800-61 methodology doc in `docs/` is a client-facing service, not Alux Plaza's own plan | **Partial** (4.5) |
| DPA Part VI and Regs. 40–48 transfers outside Kenya | Before transferring, ascertain a basis (safeguards, adequacy decision, necessity or consent). Transfers relying on safeguards must be documented: date and time, recipient, justification, description of the data (reg. 41(2)) | The policy now discloses the transfers, the providers and the risks. The legal basis for the transfers is not decided, and no transfer documentation exists | **Partial.** Disclosure done in 4.4; basis and documentation are **Organisational** |
| Reg. 19 retention schedule | Written schedule of retention periods | The rewritten policy states a schedule, but only the login-attempt and blocked-IP periods match what `jobs/cleanup.js` enforces today; the rest are proposals | **Gap** until 4.6 enforces and audits them |
| DPA s.18 registration of controllers/processors | Register with the ODPC unless exempt | Not a code matter; nothing in the repo confirms registration or an exemption decision | **Organisational.** Confirm status with the ODPC |
| Reg. 23 data protection policy | Develop, publish and regularly update a policy covering: the nature of data held, how to exercise rights, complaints handling, lawful purposes, transfers abroad and named recipients where possible, and the retention schedule | Rewritten `PrivacyPolicy.tsx` covers all of these, including named recipients, a retention table, response deadlines and the route to the Data Commissioner. The retention periods in it are proposals not yet enforced in code | **Built, awaiting merge** (4.4); retention enforcement is 4.6 |
| DPIA (Part IV) | Assess high-risk processing | None found. Probably low risk for a contact form; client security-assessment data may warrant one | **Organisational** |
| Lawful basis (reg. 5(2)–(3)) | Rely on one legal basis at a time per purpose, established before processing and demonstrable | The forms currently rely on consent. Whether consent is the right basis for answering an enquiry or running a client account (rather than, for example, a contract) is not decided, and reg. 4(4)(b) casts doubt on consent for signup | **Organisational.** Needs a lawyer |
| Regs. 24–25 processor contracts | A written contract with each processor containing the listed particulars (subject matter, duration, instructions, confidentiality, security measures, deletion or return at the end, audit rights) | Not a code matter; no contracts or data-processing terms are referenced in the repo for Resend, Sentry or the hosting providers | **Organisational.** Confirm the providers' data-processing terms cover these |

---

## 3. PCI DSS

No payment code was found: a search for Stripe, M-Pesa, PayPal, Flutterwave, Paystack and card-number fields across `backend/src` and `frontend/src` returned nothing relevant. The platform does not store, process or transmit cardholder data, so **PCI DSS scope is effectively nil today.**

Two things to keep true:
- If payments are added later, use a provider's hosted checkout so card data never touches your servers.
- The controls you already have are still good practice against the related PCI requirements (authentication, logging, secure development), but you can't claim PCI compliance because of them.

---

## 4. Gaps and what was done, in priority order

### 4.1 Contact deletion didn't actually erase the data — DONE
`DELETE /api/admin/submissions/:id` used to pass the full deleted row (name, email, message) into `audit_logs.old_value`, so the "deleted" personal data lived on indefinitely.

**Done:** the route now records only the id, status, creation time and whether a company was given. Migration 027 rewrites existing `submission.delete` audit rows to the same summary and is safe to re-run. `test/adminAudit.test.js` fails against the old behaviour.

**Remaining:** database backups taken before the fix still contain the old data until they expire.

### 4.2 No data subject request tooling — DONE
The privacy policy promises access, correction and deletion. Until now that worked only by an admin editing the database by hand.

**Done (on `main`):** `POST /api/admin/data-subjects/export` and `/erase` (superadmin-only; erase is a dry run unless `"confirm": true`).
- Export returns everything held by email: contacts, client account, login history, sessions, share links, compliance records, queued email jobs, and related audit entries. It excludes secrets and staff identities.
- Erase deletes contacts, login history, sessions, tokens, share links and queued email jobs; anonymises the client account (compliance records kept, unlinked from any person); and redacts the email inside audit entries, matching whole addresses only.
- Neither action writes the subject's email to the audit log.
- A test compares the exported-column lists with the live schema, so a future migration that adds a column must be classified before CI passes.
- `docs/DATA_SUBJECT_REQUESTS.md` gives the deadlines (access 7 days, erasure 14, rectification 14, portability 30), steps, a reply template, and a third-party cleanup checklist.

**Remaining:** Resend, Sentry, alert-channel messages, your own mailbox and backups need manual cleanup per the runbook. There is no admin screen yet. Free-text notes can hold personal data the tool can't find by email.

### 4.3 No consent or notice at the point of collection — DONE
**Done:** both the contact form and client signup now have a required checkbox linking to the Privacy Policy. The server rejects any submission where `consent` is not exactly boolean `true`, and stores `consented_at`. Honeypot behaviour on the contact form is preserved. Signup rejection is identical for registered and unregistered emails, and a signup attempt cannot stamp consent onto someone else's account.

**Remaining:**
- Rows that existed before, and accounts created by an admin, have no consent recorded. They were deliberately not back-filled.
- The notice text is a draft, and it is incomplete until 4.4 is done.
- Reg. 4(4)(b) says consent is not freely given if it is a non-negotiable part of the terms. Because the signup box must be ticked to create an account, a lawyer should decide whether client accounts should rest on a contract basis instead, with the box replaced by an acknowledgement of the notice.
- Which version of the wording a person saw is not stored. A `consent_version` column would close that.

### 4.4 Third-party processors, transfers and notice content not disclosed — BUILT, AWAITING MERGE
**Built:** `PrivacyPolicy.tsx` is rewritten and dated 8 October 2026. It now covers:
- what is collected and where it comes from (contact form, client account, engagement records, sign-in and security records, technical data);
- the purposes;
- a table of every provider that receives data: Vercel, Render, Neon, Resend, Sentry, Discord and Google Fonts, with what each receives;
- the transfer abroad and its risks, and the agreement given by ticking the form box;
- the cookies and browser storage actually used (`clientToken`, `csrfToken`, the `theme` setting);
- a retention table;
- the rights, the free-of-charge and 7 and 14 day response commitments from the regulations, and how to complain to the Data Commissioner.

Each factual statement was checked against the code (cookie names and lifetimes, the 90-day and 7-day cleanup periods, the 24-hour queue retention, no analytics or ad trackers, which providers are integrated). A render test confirmed the page contains each item reg. 4(1) lists.

**Needs your confirmation before merging:**
- Neon as the database host (the README says Render with Neon) and Discord as the alert channel (the code accepts Slack or Discord).
- That the providers process data outside Kenya, and in which regions you configured them.
- The retention periods (see 4.6): the policy states them as facts, but only two are enforced in code today.
- A lawyer's review of the whole text, including the consent-for-transfers wording and the lawful-basis question in section 2.

**Found while checking, not changed:**
- Every page view loads fonts from Google (`index.html`), which sends each visitor's IP address to Google. The policy now discloses it. Self-hosting the fonts would remove that provider entirely.
- Frontend Sentry attaches the signed-in user's email address (`useAuthSentry.ts`). Sending only the account id would send less personal data and shorten the policy.

**Still organisational:** a written contract with each provider (reg. 24), and documentation of each transfer that relies on safeguards (reg. 41(2)).

### 4.5 No written breach-response procedure — OPEN
**Fix:** a one-page internal runbook: how a suspected breach is triaged, who decides it is notifiable, an ODPC notification template, and a template message to affected clients. Use the same NIST SP 800-61 phases you already document for clients (preparation, detection/analysis, containment/eradication/recovery, post-incident), and record the 72-hour clock start time as a mandatory field. Two points from the regulations: a breach involving a client's account identifier together with a password or access code counts as notifiable (reg. 37(1)(b)), and the notice to the Commissioner has a required content list (reg. 38(1)) that makes a good template skeleton.

### 4.6 Retention periods are vague — OPEN
The policy says data is kept "for as long as reasonably necessary." That is hard to defend or audit, and reg. 19 expects a written schedule.

**Fix:** the rewritten policy already states proposed periods (contact messages 12 months after last update, client accounts and engagement records 24 months after the account is closed, staff-action records 24 months, login attempts 90 days as today). Confirm or change them, then extend `jobs/cleanup.js` to enforce the same values. Merge the enforcement together with the policy, or accept that the policy states periods the system does not yet enforce. `contacts`, client records and `audit_logs` currently have no automatic deletion. Reg. 19(3) says the schedule must state the purpose, the period, how the data is periodically audited and what happens afterwards; reg. 35(f) also expects you to decide how long backups and logs are kept.

### 4.7 Audit log integrity — OPEN (optional, lower priority)
`recordAuditLog` deliberately fails open (a logging failure doesn't block the action), and the table is ordinary mutable rows. That is a reasonable availability tradeoff but means the log isn't tamper-evident.

**Fix:** restrict the application DB role to INSERT/SELECT on `audit_logs`, and alert when an audit write fails.

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

1. ~~Fix audit-log leakage on contact deletion and scrub existing rows (4.1).~~ Done.
2. ~~Consent notice, checkbox and `consented_at` on both forms (4.3).~~ Done.
3. ~~Merge the data-subject tooling and runbook (4.2).~~ Done.
4. Confirm the provider facts and retention periods, have a lawyer review the rewritten policy, and merge it (4.4). This also completes the consent notice from 4.3.
5. Write the breach runbook (4.5).
6. Extend the cleanup job to enforce the retention periods the policy states (4.6).
7. Confirm ODPC registration status with the Commissioner's office. With a lawyer, decide the lawful basis for each purpose (in particular whether consent is valid for client signup) and confirm the processors' contracts.

## 7. What this document does not cover

Whether Alux Plaza must register with the ODPC, any lawful-basis decision, DPIA conclusions, certification, a threat model for the production environment, and the state of the production database. Those need a lawyer, the regulator, or a proper assessment.
