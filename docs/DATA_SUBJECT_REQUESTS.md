# Handling data-subject requests (access and erasure)

Internal procedure for requests received at **privacy@aluxplaza.com** (the address the contact form, signup form and privacy policy tell people to use).

This is an operating procedure, not legal advice. Have a Kenyan data-protection lawyer review it, especially section 4 (when erasure may be refused).

## 1. Deadlines

From the Data Protection (General) Regulations (Legal Notice 263 of 2021), checked against the text on Kenya Law:

| Request                   | Deadline                                                                             | Regulation      |
| ------------------------- | ------------------------------------------------------------------------------------ | --------------- |
| Access to personal data   | **7 days** from the request, free of charge, electronic form if asked electronically | reg. 9(4)–(6)   |
| Erasure                   | **Respond within 14 days**, free of charge                                           | reg. 12(3), (5) |
| Rectification             | 14 days to correct; if declined, written reasons within 7 days                       | reg. 10(4)–(5)  |
| Objection to processing   | 14 days                                                                              | reg. 8(3)       |
| Restriction of processing | 14 days                                                                              | reg. 7(3)       |
| Data portability          | 30 days; if declined, written reasons within 7 days                                  | reg. 11(3), (6) |

The clock starts when the request arrives, not when you read it. Requesters may use Forms DPG 1–5 from the First Schedule, but the regulations say a request "may" be made on the form, so don't refuse a clear request just because it isn't on one. A person unhappy with the outcome can complain to the Data Commissioner (reg. 58); say so in any refusal.

## 2. Steps for every request

1. **Log it** in your request register (a spreadsheet kept outside this system): date received, who asked, type (access / erasure / other), deadline, outcome, date closed. Don't put the person's data in it beyond what you need to find the request again.
2. **Confirm who is asking.** Reply only to the address on file. If the request came from a different address, ask them to resend it from the address they used on the site. Never send an export to a new address on the strength of an email alone.
3. **Run the right procedure** below.
4. **Reply within the deadline**, even if the answer is "we hold nothing" or "we can't erase this because…".
5. **Close the entry** in the register.

## 3. Access request

1. Run the export (section 6) for the address.
2. If `found` is `false`, tell them you hold no personal data under that address.
3. Otherwise send the JSON file to the address on file, password-protected or through a link that expires. Send the password by a different route.
4. Include a short covering note answering reg. 9(1)(a)–(e). A template:

> Hello,
>
> Attached is a copy of the personal data Alux Plaza holds under this email address.
>
> - **Why we hold it:** _[purposes, as stated in the Privacy Policy, e.g. to respond to your enquiry; to provide and secure your client account]_
> - **Categories of data:** contact details you gave us, account details, login history (including IP address and browser), and consent records.
> - **Who receives it:** _[confirm the current list before sending: e.g. our email provider (Resend), our error-monitoring provider (Sentry), our hosting and database providers]_
> - **How long we keep it:** login attempts are deleted automatically after 90 days. _[Add your retention periods for contact messages, client accounts and audit records once they are decided.]_
> - **Where it came from:** you gave it to us through our contact form or signup form; login history is recorded automatically when you sign in.
>
> You can ask us to correct or erase it by replying to this email. If you are unhappy with our response you may complain to the Office of the Data Protection Commissioner.

The export deliberately leaves out secrets (password hash, session identifiers, link tokens) and staff identities. It does not cover backups or third-party copies; the note above should not claim it does.

## 4. Erasure request

**Before erasing, decide whether you may refuse.** Reg. 12(4) says erasure does not apply where processing is necessary to comply with a legal obligation, to establish, exercise or defend a legal claim, and in a few other cases. Examples to think about: an open dispute or invoice with that client, a security incident you are still investigating, or records you are legally required to keep. If you refuse, tell the person in writing, give reasons, and mention the right to complain to the Data Commissioner. Get legal advice for anything non-obvious.

If you can erase:

1. Run the **dry run** (section 6). It changes nothing and shows what would be removed. Check the counts look right for this person.
2. Run it again with `"confirm": true`.
3. Do the **third-party cleanup** in section 5. The tool cannot reach these.
4. Reply to the person: what was erased, what was kept and why (see below), and the date.

What the tool does when confirmed:

- Deletes their contact-form messages.
- Deletes their client login history (matched by account and by email address), sessions, verification and password-reset links, and risk-score share links. The share links are deleted rather than revoked because they publicly show the company name.
- **Anonymises** the client account instead of deleting it: the email becomes `erased-<id>@erased.invalid`, the company name becomes `[erased]`, the password is made unusable, and the account is disabled. Compliance assessment records are kept, now tied to an anonymous account.
- Replaces the email with `[erased]` wherever it appears in audit-log entries (whole addresses only, so other people's addresses are untouched). The entries themselves are kept.
- Deletes queued email jobs for that address.
- Writes one audit entry recording who ran it, when, and how many records were affected. The email address is never written to the audit log.

It refuses (HTTP 409) to run on an address that belongs to an admin account. Admin accounts are removed through `/api/admin/users`.

## 5. Third-party and backup cleanup (manual)

The tool only touches this application's database. For every erasure, also check:

- **Resend** (email provider): delivery logs and any stored message content for that address.
- **Sentry**: search recent events for the address or company name and delete matches.
- **Alert webhook channel** (if `ALERT_WEBHOOK_URL` is configured): messages that may include the address or IP.
- **Your own mailbox**: contact-form notifications are emailed to you and contain the sender's name, email and message. Delete the ones for this person.
- **Database backups**: you cannot edit a backup. Note the backup retention window in the register and, if you ever restore from a backup, **re-run every erasure completed since that backup was taken** (the dry run shows when something is back).

## 6. Using the endpoints

Both endpoints are superadmin-only. The email goes in the POST body, never the URL.

```
POST /api/admin/data-subjects/export   { "email": "person@example.com" }
POST /api/admin/data-subjects/erase    { "email": "person@example.com" }                    # dry run
POST /api/admin/data-subjects/erase    { "email": "person@example.com", "confirm": true }   # real erase
```

`confirm` must be the JSON boolean `true`. Anything else is rejected, so a typo can't trigger an erasure.

To call them with curl you need an authenticated session and a CSRF token, as for any other admin request:

1. `GET /api/csrf-token` (keep the cookie jar). Use the returned `csrfToken` as the `x-csrf-token` header on every POST. If a request is rejected on origin grounds, add an `Origin` header matching your site.
2. `POST /api/admin/login` with `{ "email", "password" }`. If the response says `mfaRequired`, then `POST /api/admin/mfa/verify` with `{ "mfaToken", "code" }`.
3. Call the endpoint above with the same cookie jar and the `x-csrf-token` header.

Email matching is case-insensitive and uses the same normalisation as the forms (for example Gmail dots and `+tags` are ignored), so run it once with the address the person wrote from.

## 7. Known limits

- There is no admin-screen for this yet; it is API only.
- Free-text fields can contain personal data the tool cannot find by email: compliance `notes`, and the body of a contact message about someone else. Read the export before sending it.
- `contacts`, client records and audit logs have no automatic retention limit yet (only login attempts, expired tokens and expired IP blocks are cleaned up). Reg. 19 expects a written retention schedule; deciding those periods is separate work.
- Rectification (correcting data) and portability are done by hand.
