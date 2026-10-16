# Alux Plaza — Compliance Mapping

Maps the controls that exist in the repository to Kenya's Data Protection Act, 2019 (DPA), the Data Protection (General) Regulations 2021, PCI DSS and NIST SP 800-61, and lists the gaps.

**Last updated:** 16 October 2026. Items 4.5, 4.6, 4.8 and 4.9 were re-checked against a fresh pull of `main` on that date (files present, and the related tests pass on Node 24); the rest of the table is as checked on 10 October.

**How this was produced:** every status below was checked against a fresh pull of `main` on that date (file paths given). DPA section numbers were checked against the Act's published table of contents, and regulation numbers against the Legal Notice 263 of 2021 text on Kenya Law. Nothing here is a legal opinion or a certification. Before relying on it for any client or regulator, have it reviewed by a qualified Kenyan data-protection lawyer.

**Not verified:** the state of the production database. The migration runner applies new migrations at boot, so migrations 026–029 should run on the next deploy, but this document cannot confirm they have.

**Status key:**

| Status                | Meaning                                            |
| --------------------- | -------------------------------------------------- |
| Done                  | Implemented and present on `main`, with tests      |
| Built, awaiting merge | Written and tested, but not on `main` when checked |
| Partial               | Exists but incomplete                              |
| Gap                   | Not found in the repo                              |
| Organisational        | Not a code matter                                  |

---

## 0. Status at a glance

| Item | What                                                                                                                                                                           | Status                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 4.1  | Deleted contacts no longer leave personal data in `audit_logs`; existing rows scrubbed                                                                                         | **Done**                                                                                         |
| 4.2  | Export and erase tooling for data-subject requests, plus runbook                                                                                                               | **Done**                                                                                         |
| 4.3  | Consent checkbox and `consented_at` on the contact form and client signup                                                                                                      | **Done** (notice wording still incomplete, see 4.4)                                              |
| 4.4  | Privacy policy: processors, transfers, cookies, retention, rights, complaints, content required by reg. 4(1)                                                                   | **Done** (merged); provider facts, retention periods and a lawyer's review still to be confirmed |
| 4.5  | Written breach-response procedure                                                                                                                                              | **Done** (merged); contacts to fill in and one dry run still to do                               |
| 4.6  | Concrete retention periods, enforced                                                                                                                                           | **Done** (merged); deletes only once `RETENTION_MODE=enforce` is set                             |
| 4.7  | Audit-log integrity                                                                                                                                                            | **Gap** (optional)                                                                               |
| 4.8  | Account closure; disabled accounts keep working until their session expires                                                                                                    | **Done** (merged)                                                                                |
| 4.9  | Security-event records (IP addresses, request details) were never deleted and were not in the policy's retention table                                                         | **Done** (merged); 90 days to confirm with a lawyer                                              |
| —    | ODPC registration, DPIA, lawful-basis decision (including whether consent is valid for signup), processor contracts. A brief for the lawyer is in `docs/LEGAL_REVIEW_BRIEF.md` | **Organisational**                                                                               |

Also fixed along the way: migration 026 adds the `disabled_at` columns that the authentication code reads but no earlier migration created, and the email queue now deletes finished jobs after 24 hours (it was keeping them for 7 days, which made the policy's "about 24 hours" untrue).

---

## 1. Personal data inventory (what the system actually holds)

| Data                                                                                                                                                                                               | Where                                                  | Source of truth                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------- |
| Name, email, company, message, consent time                                                                                                                                                        | `contacts`                                             | `routes/contact.js`, migrations 001, 004, 028              |
| Client account: company name, email, password hash, consent time                                                                                                                                   | `clients`                                              | `routes/clientAuth.js`, migrations 012, 015, 022, 026, 029 |
| Client sessions: IP address, browser, times                                                                                                                                                        | `client_sessions`                                      | `middleware/clientAuth.js`, migrations 016, 022            |
| Email attempted, IP address, browser, success flag                                                                                                                                                 | `client_login_attempts`                                | `middleware/loginAudit.js`, migrations 014, 016            |
| Verification and password-reset tokens (hashed)                                                                                                                                                    | `client_email_verifications`, `client_password_resets` | migration 022                                              |
| Risk-score share links (publicly show the company name)                                                                                                                                            | `risk_score_shares`                                    | migration 013                                              |
| Compliance assessment records and free-text notes per client                                                                                                                                       | `client_compliance_status`                             | migration 012                                              |
| Admin staff accounts, including the MFA secret (encrypted)                                                                                                                                         | `admin_users`                                          | migrations 001, 017, 019, 020                              |
| Admin action, target, old and new values                                                                                                                                                           | `audit_logs`                                           | `middleware/auditLog.js`, migration 007                    |
| IPs and attack metadata                                                                                                                                                                            | Shield tables, `blocked_ips`, `rate_limits`            | `shield/`, migrations 005, 011, 024                        |
| Queued email jobs (contain recipient emails and, for contact notifications, the sender's name, company, email and message); kept about 24 hours after completion (7 days before the 4.6 queue fix) | `pgboss.job`                                           | `lib/email-queue.js`                                       |

Third parties that receive data (processors): Resend (email), Sentry (errors, backend and frontend), and the alert webhook if `ALERT_WEBHOOK_URL` is set. The hosting and database providers are not determined from the repo code and should be confirmed. At least some of these are likely outside Kenya; see 4.4.

---

## 2. DPA 2019 and Regulations 2021 mapping

| Reference                                                                                                           | Requirement (summary)                                                                                                                                                                                                                                               | Evidence in repo                                                                                                                                                                                                                                                                                                                                                                                                                                   | Status                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DPA s.25 principles (minimisation, purpose limitation, storage limitation, accuracy)                                | Collect only what's needed; don't keep identifiable data longer than necessary                                                                                                                                                                                      | Contact form collects 4 fields with length limits (`contact.js`). `jobs/cleanup.js` purges tokens, sessions, rate limits, IP blocks (7 days after expiry), login attempts (90 days) and Shield counters                                                                                                                                                                                                                                            | **Partial.** The retention job covers `contacts`, `audit_logs`, closed client accounts and (4.9) security events, but only deletes once switched on                                         |
| DPA s.25 / s.26 deletion integrity                                                                                  | Deleted data must actually be gone                                                                                                                                                                                                                                  | Deleting a contact used to copy the whole row into `audit_logs.old_value`. Fixed in `routes/admin.js`; migration 027 scrubs existing rows; `test/adminAudit.test.js`                                                                                                                                                                                                                                                                               | **Done** (4.1). Database backups taken earlier still hold the old data until they age out                                                                                                   |
| DPA s.26 rights of the data subject (access, correction, deletion, objection); Regs. 9, 12                          | Honour requests within the deadlines: access 7 days, erasure 14 days                                                                                                                                                                                                | Export and erase endpoints (superadmin-only, dry-run by default, audit-logged without the email), a schema-drift guard, and `docs/DATA_SUBJECT_REQUESTS.md` with deadlines, steps and a reply template; `test/dataSubjects.test.js`                                                                                                                                                                                                                | **Done** (4.2). API-only; third-party and backup cleanup is manual; rectification and portability are by hand                                                                               |
| DPA s.28, s.29, s.32 collection, notice, consent                                                                    | Tell people why data is collected at the point of collection; consent must be demonstrable                                                                                                                                                                          | Required checkbox linking to `/privacy-policy` on `Contact.tsx` and `ClientSignup.tsx`; server rejects anything but boolean `true`; time stored in `consented_at` (migrations 028, 029); tests in `contact.test.js`, `clientAuth.test.js`                                                                                                                                                                                                          | **Done** (4.3), with caveats: the notice content is incomplete (next row); existing rows and admin-created clients have no consent recorded; which notice version someone saw is not stored |
| Reg. 4(1) content of the notice                                                                                     | When relying on consent, tell the person: who the controller is, the purpose, the type of data, the risks of transfers abroad, whether data is shared with third parties, the right to withdraw, and the implications of giving, withholding or withdrawing consent | Rewritten `PrivacyPolicy.tsx` covers every item: controller, purposes, data collected, a named-provider table, transfer risks, withdrawal, and what happens if consent is withheld. The checkbox text itself still only names the purpose and withdrawal, and links to the policy for the rest                                                                                                                                                     | **Done** (4.4, merged)                                                                                                                                                                      |
| Reg. 4(4)(b), (d) consent must be freely given                                                                      | Consent is not free if it is a non-negotiable part of the terms, or if several purposes are merged                                                                                                                                                                  | The signup checkbox must be ticked to create an account, which may count as non-negotiable. The contact form is similar: you can't send a message without it                                                                                                                                                                                                                                                                                       | **Organisational.** Needs a lawyer: a contract basis may fit client accounts better than consent (see Lawful basis)                                                                         |
| DPA s.41 data protection by design/default                                                                          | Build protection in                                                                                                                                                                                                                                                 | httpOnly + Secure cookies, SameSite handling (`lib/auth-cookie.js`), CSRF double-submit (`middleware/csrf.js`), bcrypt cost 12, MFA secrets AES-256-GCM with HKDF key (`lib/mfa.js`), JWT 2h expiry, Helmet CSP + HSTS 1 year (`middleware/helmetConfig.js`), Postgres-backed rate limiting and token blocklist                                                                                                                                    | **Done**                                                                                                                                                                                    |
| DPA s.43 breach notification (Commissioner within 72 hours; data subjects without undue delay; record every breach) | Detect, assess, notify, record                                                                                                                                                                                                                                      | Detection exists (Shield, new-device alerts, admin security dashboard, alert webhook). `docs/BREACH_RESPONSE.md` now sets out the 72-hour clock, the notifiable test, containment using the platform's real controls, evidence preservation, the Commissioner's online form, message templates and the breach register                                                                                                                             | **Done** (merged, 4.5). The owner still has to fill in its contacts and do a dry run                                                                                                        |
| DPA Part VI and Regs. 40–48 transfers outside Kenya                                                                 | Before transferring, ascertain a basis (safeguards, adequacy decision, necessity or consent). Transfers relying on safeguards must be documented: date and time, recipient, justification, description of the data (reg. 41(2))                                     | The policy now discloses the transfers, the providers and the risks. The legal basis for the transfers is not decided, and no transfer documentation exists                                                                                                                                                                                                                                                                                        | **Partial.** Disclosure done in 4.4; basis and documentation are **Organisational**                                                                                                         |
| Reg. 19 retention schedule                                                                                          | Written schedule of retention periods                                                                                                                                                                                                                               | The policy states a schedule. The retention job enforces the contact, closed-account, audit-log and attack-record periods, `jobs/cleanup.js` the sign-in-attempt, blocked-IP and expired-link ones, and the queue the email-job one                                                                                                                                                                                                                | **Done** (merged, 4.6). Nothing is deleted until `RETENTION_MODE=enforce`; backups are not covered                                                                                          |
| DPA s.18 registration of controllers/processors                                                                     | Register with the ODPC unless exempt                                                                                                                                                                                                                                | Not a code matter. Secondary sources and the ODPC's guidance note say a controller with annual turnover under KES 5 million and fewer than 10 employees is exempt from mandatory registration (not from complying), unless it processes for a listed purpose or in a listed sector such as education, health or financial services. Alux Plaza is probably exempt if it stays under those thresholds, but nothing in the repo records the decision | **Organisational.** Confirm with a lawyer or the ODPC                                                                                                                                       |
| Reg. 23 data protection policy                                                                                      | Develop, publish and regularly update a policy covering: the nature of data held, how to exercise rights, complaints handling, lawful purposes, transfers abroad and named recipients where possible, and the retention schedule                                    | Rewritten `PrivacyPolicy.tsx` covers all of these, including named recipients, a retention table, response deadlines and the route to the Data Commissioner. The retention periods in it match the retention job's constants, and a test fails if they drift apart                                                                                                                                                                                 | **Done** (4.4, merged); retention enforcement is 4.6                                                                                                                                        |
| DPIA (Part IV)                                                                                                      | Assess high-risk processing                                                                                                                                                                                                                                         | None found. Probably low risk for a contact form; client security-assessment data may warrant one                                                                                                                                                                                                                                                                                                                                                  | **Organisational**                                                                                                                                                                          |
| Lawful basis (reg. 5(2)–(3))                                                                                        | Rely on one legal basis at a time per purpose, established before processing and demonstrable                                                                                                                                                                       | The forms currently rely on consent. Whether consent is the right basis for answering an enquiry or running a client account (rather than, for example, a contract) is not decided, and reg. 4(4)(b) casts doubt on consent for signup                                                                                                                                                                                                             | **Organisational.** Needs a lawyer                                                                                                                                                          |
| Regs. 24–25 processor contracts                                                                                     | A written contract with each processor containing the listed particulars (subject matter, duration, instructions, confidentiality, security measures, deletion or return at the end, audit rights)                                                                  | Not a code matter; no contracts or data-processing terms are referenced in the repo for Resend, Sentry or the hosting providers                                                                                                                                                                                                                                                                                                                    | **Organisational.** Confirm the providers' data-processing terms cover these                                                                                                                |

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

### 4.4 Third-party processors, transfers and notice content not disclosed — DONE (merged), with open confirmations

**Done (on `main`):** `PrivacyPolicy.tsx` is rewritten and dated 10 October 2026. It now covers:

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

### 4.5 No written breach-response procedure — DONE (merged)

**Done (on `main`):** `docs/BREACH_RESPONSE.md`, written for one person under stress. Section 0 is the whole procedure on one page. The rest covers:

- what the Act and Regulations require, checked against their text: the 72-hour notification and the reasons needed if late, telling affected people, the 48-hour duty on processors, the duty to record **every** breach, and the regulation 37 test for real risk of harm;
- where a breach shows up on this platform, and how long each source is kept;
- containment using controls that exist, including closing a client account, removing a staff account, rotating secrets and blocking an IP;
- evidence preservation, including setting `RETENTION_MODE=off` and exporting the tables the daily cleanup deletes anyway;
- a guide to whether a given exposure is notifiable, and tested queries to scope it;
- the Commissioner's online breach form, field by field, plus templates for the notice, the message to affected people and the incident log;
- the breach register, the post-incident review, and a dry-run exercise.

Every SQL block and the evidence-export script were run verbatim against a freshly migrated database, and every endpoint, setting and script the document names was checked against the code.

**Corrections made while writing it:**

- There is no admin action to block an IP, only to unblock one, so the runbook gives the SQL and notes that it takes effect on the next request.
- Rotating `JWT_SECRET` while `MFA_ENCRYPTION_KEY` is unset would also make every staff member's MFA secret unreadable, because the MFA key is derived from it. The runbook says to set the separate key first.
- `ADMIN_BOOTSTRAP_*` only creates an admin when none exist, and the staff delete route refuses to remove the last superadmin, so a lost superadmin is recovered with `npm run create-admin`.
- A closed client account keeps its email address, so the person cannot sign up again. Restoring access after a compromise needs a reopen that also invalidates the old password, and that sequence was tested.

**Remaining:**

- The owner fills in the contacts in section 10 and does one dry run, so the first real use is not the first time.
- A lawyer reviews the judgement calls, which are listed in `docs/LEGAL_REVIEW_BRIEF.md`: whether a hashed password counts as a password under regulation 37, when section 43(6) lets you skip telling people, and whether to ask the Commissioner for confidentiality.
- The Act does not say how long to keep the breach register, and the policy's retention table does not list it.
- `docs/` still holds only client-facing incident-response material (`incident-response-plan-template.docx` and the methodology note); the new file is Alux Plaza's own plan.

### 4.6 Retention periods are vague — DONE (merged), not yet switched on

The policy used to say data is kept "for as long as reasonably necessary." Reg. 19 expects a written schedule, and the rewritten policy now states one.

**Done (on `main`):**

- `backend/src/jobs/retention.js` enforces the periods the policy states: contact messages 12 months after they were last updated, closed client accounts 24 months after closure (deleting an account cascades to its compliance records, share links, sign-in attempts, sessions and links), and audit-log entries 24 months.
- It runs inside the existing daily cleanup job. **It defaults to `dry-run`**: it counts what would be deleted and logs that, and deletes nothing, until `RETENTION_MODE=enforce` is set on the server. `off` skips it, and any unrecognised value falls back to `dry-run`.
- Each rule deletes at most 500 rows per run, oldest first, so a wrong period or bad data cannot empty a table in one pass; a backlog drains over the following days. Logs contain counts only. When it deletes, it records a counts-only `retention.purge` audit entry.
- `jobs/cleanup.js` now also removes expired verification and password-reset links, which it never did before.
- The email queue now deletes finished jobs after 24 hours. It had been keeping them for 7 days: the queue's `retentionSeconds` setting only governs jobs still waiting, not finished ones. Existing queues are updated on boot because `createQueue` does nothing for a queue that already exists.
- Tests cover each rule's boundaries, dry-run, off, the cap, cascading deletion, expired links, the 90-day and 7-day cleanup periods, and the queue settings against real pg-boss. A test reads the retention table out of `PrivacyPolicy.tsx` and fails if any period differs from the code or if a row is added without enforcement.

**Remaining:**

- Read the `[retention] DRY RUN` log lines for a few days, then set `RETENTION_MODE=enforce` on Render. Until you do, the policy states periods that are not enforced.
- Security events are covered by the same job from 4.9, which is now merged.
- The closed-account rule only reaches accounts that have been closed. The new admin close action (4.8) is how to close one.
- Backups are not covered: reg. 35(f) expects you to decide how long backups and logs are kept, and the policy only says they are overwritten on the provider's schedule.
- The periods themselves are still proposals until you and your lawyer confirm them, in particular 24 months for client records.

### 4.7 Audit log integrity — OPEN (optional, lower priority)

`recordAuditLog` deliberately fails open (a logging failure doesn't block the action), and the table is ordinary mutable rows. That is a reasonable availability tradeoff but means the log isn't tamper-evident.

**Fix:** restrict the application DB role to INSERT/SELECT on `audit_logs`, and alert when an audit write fails.

### 4.8 Account closure and disabled-account handling — DONE (merged)

Found while building 4.6: `disabled_at` is the only marker the retention job can use for a closed client account, and it was not reliable.

- **Nothing closed an account.** No admin route set `clients.disabled_at`; only the data-erasure tool did.
- **The disabled check was backwards.** In `middleware/clientAuth.js` and `middleware/auth.js` the comparison rejected tokens issued _after_ the account was disabled and accepted tokens issued _before_ it. A probe confirmed it for both clients and admins: a token issued an hour before disabling kept working until it expired (2 hours by default).
- **Login and password reset ignored `disabled_at`.** They only appeared to work because the backwards check rejected the new token.
- **Erasure did not end sessions.** The erase tool deletes `client_sessions` rows, but the signed tokens stayed valid until they expired.

**Done (on `main`):**

- Both middlewares now reject every request from a disabled account, whatever the token's age.
- Login treats a closed account exactly like a wrong password or an unknown email: same status, same message, same work done, and it never reaches the lockout message. The refused attempt is logged as a failed login.
- Password-reset request, password-reset confirm, email verification and resend-verification all refuse a closed account, using the same generic replies as before so they reveal nothing.
- `POST /api/admin/clients/:id/close` closes an account: it sets `disabled_at`, revokes and blocklists active sessions, and deletes outstanding links. It is idempotent, so the retention clock keeps running from the first closure, and the response gives `closedAt` and `deletesAfter`. The audit entry records the client id only.
- Erasing a person now ends their existing sessions immediately, because the erase tool sets `disabled_at`. A test covers it.
- Tests cover both middlewares, each route, the close action and its authorisation, the link with the retention job, and the erase tool. Ten deliberate breakages were each caught.

**Remaining:**

- There is no admin screen for closing; it is API-only. Reopening an account closed by mistake is a one-line SQL statement (see `docs/DATA_SUBJECT_REQUESTS.md`, section 8).
- There is no admin screen for disabling staff; it is API-only: `POST /api/admin/users/:id/disable` (added 16 October 2026, with tests). Idempotent; refuses to disable your own account or the last remaining active superadmin; writes an `admin_user.disable` audit entry. Re-enabling is a one-line SQL statement: `UPDATE admin_users SET disabled_at = NULL WHERE id = <id>;`.

### 4.9 Security-event records were kept forever and were not in the policy — DONE (merged)

Found while writing 4.5. The Shield records every flagged request in `security_events`: IP address, page and method, the type of attack, the pattern that matched, and a sample of the matching text (up to 100 characters). Nothing deleted these rows, and the privacy policy's retention table did not list them.

**Done (on `main`):**

- A new rule in `jobs/retention.js` deletes security events older than 90 days. It is governed by `RETENTION_MODE` like the other retention rules (dry-run by default). One scan can create thousands of rows in a day, so this rule's per-run cap is ten times the usual one, or the job could never catch up. The audit entry for a purge now includes the number of events removed.
- The privacy policy now says what the firewall records and keeps them 90 days.
- Tests cover the boundary (an event 91 days old goes, one 89 days old stays, which also proves the period is read as days and not months), dry-run, the larger cap, the audit entry, and the daily job end to end. The test that checks the policy table against the code now includes this row. Seven deliberate breakages were each caught.

**Remaining:**

- Confirm 90 days with your lawyer. It is a proposal chosen to match the sign-in attempt period.
- Once enforcement is on, the admin events view only shows the last 90 days. Export older events first if an investigation needs them (`docs/BREACH_RESPONSE.md` says how).
- These rows are not found by email address, so a data-subject export does not include them and the erase tool does not remove them. They expire on their own, and the sample is short, but it can contain a fragment of what a visitor typed.

---

## 5. NIST SP 800-61 (your own incident response)

| Phase                              | What exists                                                                                                                                            | Missing                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Preparation                        | Shield, rate limiting, MFA, RBAC, tests, CI, `docs/BREACH_RESPONSE.md`                                                                                 | Owner to fill in the contacts and do a dry run          |
| Detection and analysis             | Shield events, login-attempt logging, new-device alerts, admin security dashboard, alert webhook, a triage and notifiability guide with tested queries | None, once the lawyer has confirmed the judgement calls |
| Containment, eradication, recovery | IP blocking, session revocation, token blocklist, account closure, documented steps                                                                    | An admin screen for blocking an IP (SQL only today)     |
| Post-incident                      | Review steps and a breach register in the runbook                                                                                                      | The register itself, kept outside the platform          |

---

## 6. Suggested order of work

1. ~~Fix audit-log leakage on contact deletion and scrub existing rows (4.1).~~ Done.
2. ~~Consent notice, checkbox and `consented_at` on both forms (4.3).~~ Done.
3. ~~Merge the data-subject tooling and runbook (4.2).~~ Done.
4. ~~Rewrite and merge the privacy policy (4.4).~~ Done. Still to confirm: provider facts, retention periods, and a lawyer's review.
5. ~~Merge the retention job (4.6).~~ Done. Read its dry-run logs for a few days, then set `RETENTION_MODE=enforce`.
6. ~~Fix disabled-account handling and add account closure (4.8).~~ Done.
7. ~~Write the breach runbook (4.5).~~ Done. Then fill in its contacts (section 10) and do one dry run.
8. ~~Choose and enforce a retention period for security-event records, and add it to the policy (4.9).~~ Done. Confirm 90 days with the lawyer.
9. Fill in the checklist in `docs/LEGAL_REVIEW_BRIEF.md` and send it to a lawyer. With them, decide the lawful basis for each purpose (in particular whether consent is valid for client signup), confirm the retention periods, the transfer basis and the processors' contracts, and settle whether Alux Plaza must register with the ODPC.

## 7. What this document does not cover

Whether Alux Plaza must register with the ODPC, any lawful-basis decision, DPIA conclusions, certification, a threat model for the production environment, and the state of the production database. Those need a lawyer, the regulator, or a proper assessment.
