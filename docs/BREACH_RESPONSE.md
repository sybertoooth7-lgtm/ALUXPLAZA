# Personal data breach response

What to do when personal data held by Alux Plaza may have been accessed, taken, lost, changed or destroyed without permission. It is written for one person acting under stress, so section 0 is the whole procedure in one page and the rest is the detail behind it.

**Keep a copy of this file and your incident log somewhere that does not depend on the platform** (printed, or on your own laptop). If the site or database is the thing that has been compromised, you cannot rely on reading this from it.

This is an operating procedure, not legal advice. Have a Kenyan data-protection lawyer review it, and agree in advance who you will call. Last reviewed 10 October 2026.

## 0. The first hour

1. **Write down the time you became aware.** Date, time, and how you found out. This starts the 72-hour clock (section 1).
2. **Open an incident log** outside the platform (template in section 9). Give the incident a reference such as `2026-10-10-01`. Write down everything you do, with times. Use client ids, not names or emails, in the log.
3. **Do not delete, clean up or "fix" anything yet.** You need the evidence, and the Data Commissioner can ask for it.
4. **Contain it** (section 3): stop the access first, then investigate.
5. **Preserve evidence** (section 3): set `RETENTION_MODE=off` and export the logs that expire on their own.
6. **Work out what was exposed** (section 4) and whether it must be reported.
7. **Decide within 24 hours** whether it is notifiable. If you are unsure, treat it as notifiable and get advice.
8. **Notify the Data Commissioner within 72 hours** (section 5), and tell the affected people.
9. **Record it** (section 8), whether or not you had to notify anyone.

## 1. What the law requires

From the Data Protection Act, 2019 (section 43) and the Data Protection (General) Regulations, 2021 (regulations 37 and 38).

| Rule                                                                                                                                                                                                                                                       | Source                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| A **personal data breach** is a breach of security leading to the accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to, personal data. It covers mistakes (a wrong recipient, a lost backup) as well as attacks. | Act, s.2                 |
| **Notify the Data Commissioner without delay, within 72 hours of becoming aware**, where personal data was accessed or acquired by an unauthorised person and there is a real risk of harm to the person.                                                  | s.43(1)(a)               |
| If you miss 72 hours, the notification **must say why**.                                                                                                                                                                                                   | s.43(2)                  |
| **Tell the affected people in writing** within a reasonably practical period, unless you cannot identify them.                                                                                                                                             | s.43(1)(b)               |
| You may delay or limit telling people if it is necessary and proportionate for the prevention, detection or investigation of an offence by the relevant body.                                                                                              | s.43(4)                  |
| You do **not** have to tell people if appropriate security safeguards were in place, such as encryption of the affected data. You still notify the Commissioner.                                                                                           | s.43(6)                  |
| If you cannot give all the information at once, **give it in phases** without undue delay.                                                                                                                                                                 | s.43(7)                  |
| A **processor** that learns of a breach must tell you without delay and, where practicable, within 48 hours. Your service providers are processors.                                                                                                        | s.43(3)                  |
| **Record every personal data breach**: the facts, its effects and the remedial action. This applies even when you did not have to notify anyone.                                                                                                           | s.43(8)                  |
| A breach is treated as a **real risk of harm** where the data is a person's full name or ID number together with certain categories of data, or **an account identifier together with any password, security code or access code that allows access**.     | Regulations, reg. 37(1)  |
| The notice to the Commissioner must contain the items in regulation 38(1). If you decide **not** to tell the affected people, you must give your grounds in that notice.                                                                                   | Regulations, reg. 38     |
| Whether you reported, and how quickly, is one of the things the Commissioner weighs when setting a penalty. Fines go up to KES 5 million or 1% of annual turnover, whichever is lower, and people can claim compensation.                                  | Act, ss.62(2)(h), 63, 65 |

**When does the clock start?** "Becoming aware" is when you have reasonable grounds to believe personal data was accessed or taken, not when you finish investigating. Record the evidence for your chosen time. If you are unsure, use the earlier time.

## 2. Detect and triage

### Where a breach shows up

| Source                                                                 | What it tells you                                                            | How long it is kept                           |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- |
| Discord alert channel (`ALERT_WEBHOOK_URL`)                            | Suspected attacks, auto-blocked IP addresses, server errors                  | Set by Discord                                |
| `GET /api/admin/security/events` (`security_events` table)             | Attack and abuse events: type, IP, path, whether blocked                     | 90 days once `RETENTION_MODE=enforce` is on   |
| `GET /api/admin/security/blocks`                                       | IP addresses currently blocked                                               | Removed 7 days after the block ends           |
| `client_login_attempts`                                                | Every sign-in attempt: email, IP, browser, success                           | **90 days**                                   |
| `client_sessions`                                                      | Sessions that are active now                                                 | Removed when they expire                      |
| `audit_logs`                                                           | What each staff member did and when                                          | 24 months once `RETENTION_MODE=enforce` is on |
| New-device emails and replies from clients ("this was not me")         | A client's account may be in someone else's hands                            | Your mailbox                                  |
| Notices from providers (Render, Vercel, Neon, Resend, Sentry, Discord) | A breach on their side. They must tell you within 48 hours where practicable | Your mailbox                                  |
| Render and Vercel logs, Sentry events                                  | Requests and errors around the time                                          | Set by each provider                          |
| `privacy@aluxplaza.com`, or a researcher or stranger who contacts you  | Someone says they found or hold your data                                    | Your mailbox                                  |

### Triage questions

Answer these in the log, in this order:

1. What happened, and how do we know? What is the earliest and latest time involved?
2. Is it still happening? (If yes, go to containment now.)
3. What kind of data could be involved: sign-in details, contact messages, client records, staff accounts, logs only?
4. How many people, roughly? Are they clients, enquirers, staff?
5. Was it unauthorised **access or acquisition**, or loss or damage (data deleted, backup lost, sent to the wrong person)?

An attempt that failed and touched no personal data is not a breach. Record it as an event and stop here.

## 3. Contain and preserve evidence

Stop the access first, then investigate. Do the least that stops the harm, and log each step.

| Situation                                        | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A client account is in someone else's hands      | `POST /api/admin/clients/:id/close`. It ends the account's access and sessions at once and keeps the data. The person cannot simply sign up again, because a closed account still holds their email address. When it is safe to give access back, reopen it **and invalidate the old password in the same statement**: `UPDATE clients SET disabled_at = NULL, password_hash = '!' WHERE id = 42;` (use the real id). They then use "forgot password" to choose a new one. Tell them (section 5).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| A staff account is compromised                   | A superadmin disables it with `POST /api/admin/users/:id/disable`. Every request from that account is refused from then on, whatever token it sends, and nothing is deleted, so the account and its audit history stay for the investigation; the action itself is recorded (`admin_user.disable`). Sign-in is refused too, with the same message as a wrong password. Deleting is optional, not the first move; `DELETE /api/admin/users/:id` still works if you want the account gone afterwards. Both routes refuse to act on your own account; delete also refuses the last remaining superadmin, and disable refuses the last remaining active one. If a replacement is needed, create one with `POST /api/admin/users`, or run `npm run create-admin` on a machine that has the production `DATABASE_URL`. If the compromised account is the last superadmin: rotate `JWT_SECRET` (below), reset its password by running `npm run create-admin` with the same email, sign in, disable MFA (`POST /api/admin/mfa/disable`) and enrol it again (`POST /api/admin/mfa/enroll`, then `/verify-enrollment`), because the script does not touch MFA. `ADMIN_BOOTSTRAP_*` only creates an admin when none exist, so it cannot help here. |
| One IP address is attacking                      | There is no admin screen to block an IP, only to unblock one. Use the SQL below (it takes effect on the next request), or your hosting provider's firewall.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Tokens or sessions may have been stolen          | Rotate `JWT_SECRET` on Render and redeploy. **Every** admin and client token stops working and everyone signs in again. **First make sure `MFA_ENCRYPTION_KEY` is set to its own separate value.** If it is not, the MFA key is derived from `JWT_SECRET` and rotating it makes every staff member's MFA secret unreadable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| A credential or key may have leaked              | Rotate it: the database password (and update `DATABASE_URL`), `RESEND_API_KEY`, `ALERT_WEBHOOK_URL`, any hosting or GitHub tokens. Rotate first, then look for how it leaked.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| The attacker is still inside and you cannot tell | Suspend the Render service from the dashboard. Taking the site down is a legitimate trade; a longer exposure is worse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Block an IP address by hand for 30 days (change the address and the reference):

```sql
INSERT INTO blocked_ips (ip_address, reason, severity, expires_at, auto_blocked)
VALUES ('203.0.113.9', 'incident 2026-10-10-01', 'high', NOW() + INTERVAL '30 days', FALSE)
ON CONFLICT (ip_address) DO UPDATE
SET reason = EXCLUDED.reason,
    severity = EXCLUDED.severity,
    blocked_at = NOW(),
    expires_at = EXCLUDED.expires_at,
    auto_blocked = FALSE;
```

### Preserve evidence

1. **Set `RETENTION_MODE=off` on Render and redeploy.** This stops the daily job deleting contact messages, closed client accounts, audit entries and security events while you investigate.
2. **That does not stop everything.** The daily cleanup still deletes sign-in attempts older than 90 days, IP blocks 7 days after they end, expired sessions and links, and finished email jobs after 24 hours. **Export the tables below on day one.** From a terminal with your database URL:

```bash
for t in client_login_attempts client_sessions security_events blocked_ips audit_logs; do
  psql "$DATABASE_URL" -c "\copy (SELECT * FROM $t) TO '$t.csv' CSV HEADER"
done
```

3. Keep the CSV files with the incident log. They contain personal data, so store them securely and delete them when the incident is closed and the retention decision is made.
4. Take a database backup or snapshot with your provider's tools, and ask Render, Vercel and Neon to keep the logs for the period involved.
5. Save the Discord alerts and any relevant emails.
6. **If someone asks you to erase data during an investigation**, do not erase data you may need as evidence. The Act says to restrict its processing instead and tell the person within a reasonable time (s.40(3)).

When the incident is closed, set `RETENTION_MODE` back to what it was.

## 4. Assess

### Is it a personal data breach?

Yes if personal data was destroyed, lost, altered, disclosed or accessed without authority (section 1). If yes, it goes in the register (section 8) whatever happens next.

### Is it notifiable to the Commissioner?

It is notifiable if the data was **accessed or acquired by an unauthorised person** and there is a **real risk of harm**. Use this as a guide, and when in doubt notify:

| What was exposed                                                                              | Likely notifiable?                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client email addresses **with** password hashes, session tokens, sign-in links or reset links | **Yes.** An account identifier with access data is covered by regulation 37(1)(b). Whether a hashed password counts is a question for your lawyer; treat it as notifiable until they say otherwise. |
| Staff accounts, password hashes, or MFA secrets                                               | **Yes**, for the same reason.                                                                                                                                                                       |
| Contact messages (name, email, company, message text)                                         | **Judge by what the messages say.** Free text can contain anything. If any could include financial, health or other sensitive details, or the exposure could hurt the sender, notify.               |
| Compliance records and notes for client companies                                             | Only if they identify individuals. Read the notes before deciding.                                                                                                                                  |
| IP addresses and request logs only                                                            | Usually not on its own. Record it.                                                                                                                                                                  |
| A provider (Resend, Neon, Render and others) tells you they had a breach                      | You decide, once you know whether **your** data was in it. Your 72 hours run from when you become aware.                                                                                            |
| Data deleted or lost with no unauthorised person involved                                     | Not notifiable under s.43(1) (it needs unauthorised access), but it is a breach: record it, and fix any backup gap.                                                                                 |

### Scope the exposure

Run these in your database console, changing the dates and addresses, to see how many people and what data.

How much the system holds in total:

```sql
SELECT
  (SELECT COUNT(*) FROM contacts) AS contact_messages,
  (SELECT COUNT(*) FROM clients WHERE disabled_at IS NULL) AS open_client_accounts,
  (SELECT COUNT(*) FROM clients WHERE disabled_at IS NOT NULL) AS closed_client_accounts,
  (SELECT COUNT(*) FROM admin_users) AS staff_accounts;
```

Everything one IP address did:

```sql
SELECT created_at, email_attempted, ip_address, user_agent, success
FROM client_login_attempts
WHERE ip_address = '203.0.113.9'
ORDER BY created_at;
```

Successful sign-ins in a time window (Nairobi is UTC+3):

```sql
SELECT created_at, client_id, email_attempted, ip_address, user_agent
FROM client_login_attempts
WHERE success = TRUE
  AND created_at >= '2026-10-08 00:00+03'
  AND created_at < '2026-10-11 00:00+03'
ORDER BY created_at DESC;
```

Sessions that are active right now:

```sql
SELECT client_id, ip_address, user_agent, created_at, last_seen_at, expires_at
FROM client_sessions
WHERE expires_at > NOW()
ORDER BY created_at DESC;
```

What staff did in a time window:

```sql
SELECT created_at, admin_email, action, target_table, target_id
FROM audit_logs
WHERE created_at >= '2026-10-08'
ORDER BY created_at;
```

Attack and abuse events from the Shield:

```sql
SELECT created_at, ip_address, event_type, severity, request_path, blocked
FROM security_events
WHERE created_at >= '2026-10-08'
ORDER BY created_at DESC
LIMIT 200;
```

To see everything held about one named person, use the export tool in `docs/DATA_SUBJECT_REQUESTS.md` (section 6).

## 5. Notify

### The Data Commissioner (within 72 hours)

Use the Commissioner's online form at **odpc.go.ke/report-a-data-breach**. It is for controllers reporting under section 43. The form asks for the items below. Prepare them in the incident log first, then copy them in, and **save a copy of what you submit** (a screenshot or the confirmation email).

| Form asks for                                                                | Where the answer comes from                                                            |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Description of the breach                                                    | Triage answers 1 and 5                                                                 |
| How the breach occurred                                                      | Your investigation so far. Say what is still unknown.                                  |
| Categories of people affected, and the type of personal information involved | Section 4 (clients, enquirers, staff; sign-in details, messages, and so on)            |
| Exact number of people affected (a best estimate is accepted)                | The scoping queries                                                                    |
| What you are doing, or will do, to help the affected people                  | Containment taken, what you tell them to do (a password change, watching for phishing) |
| Other authorities you have told or will tell                                 | Police, the national incident response team, a client's own regulator, if any          |
| Attachments                                                                  | An incident report (draft in section 9), and any report to another authority           |
| A request that the particulars be held in confidence                         | Decide with your lawyer; explain why if you ask                                        |

- **Do not wait until you know everything.** Send what you have inside the 72 hours and add the rest in phases (s.43(7)).
- **If it is late, say why** in the notice (s.43(2)).
- **If you decide not to tell the affected people, state your grounds** in the notice (reg. 38).
- The Act sets no format, so the form is the practical route. The Commissioner's general email is info@odpc.go.ke if the form is unavailable.

### The affected people (a reasonably practical period)

Tell each person in writing by email, or by another route if email is down. Each notice must give enough information for them to protect themselves (s.43(5)):

- what happened;
- what you have done and are doing about it;
- what they should do (change their password, watch for phishing, check their accounts);
- who took or accessed the data, if you know;
- who to contact for more.

A message template is in section 9. As a working aim, send it the same day as the Commissioner's notice. That is a target, not a legal deadline. Do not tell people if encryption or similar safeguards mean they cannot be harmed (s.43(6)) without checking with your lawyer first. Give the law-enforcement delay (s.43(4)) only if the police have asked.

### Others to consider

- **Clients.** If your contract with a client promises notice of a security incident, you may owe them a message even where the Commissioner does not need one.
- **Your providers.** Tell Render, Vercel, Neon, Resend or Sentry if the incident involved their service, and ask what they can see.
- **The police and the national incident response team.** Ask your lawyer before you report, and have the contact details ready in section 10.
- **Insurers**, if you have cover.

### Communicating

State what you know and what you do not. Do not speculate about who did it or how much was taken, and do not promise that the problem is fixed until it is.

## 6. Recover and fix

1. Fix the cause: the vulnerable code, the leaked credential, the missing control. Test the fix.
2. Restore anything that was lost or changed, from a known-good backup.
3. Put `RETENTION_MODE` back, restore any service you suspended, and re-enable alerts.
4. Watch for repeat activity for at least a week: new events, sign-in attempts from the same addresses, the same pattern.

## 7. Review

Within two weeks of closing the incident (a working aim), write down:

- the timeline, from the first sign to the last action;
- the root cause, and what let it happen;
- what worked and what slowed you down, including how long each step took against the 72 hours;
- the changes you will make, with an owner and a date (code, settings, monitoring, this runbook).

Update this runbook the same week.

## 8. The breach register

The Act requires you to record **every** personal data breach, notifiable or not (s.43(8)). Keep one register outside the platform with a row per incident:

| Field                                   | Notes                                             |
| --------------------------------------- | ------------------------------------------------- |
| Reference                               | For example `2026-10-10-01`                       |
| Time aware, time contained, time closed | In Nairobi time                                   |
| Facts: what happened and what data      | Required by s.43(8)(a)                            |
| Effects                                 | Required by s.43(8)(b); include how many people   |
| Remedial action taken                   | Required by s.43(8)(c)                            |
| Notifiable? Why, or why not             | Record the reasoning even when the answer is "no" |
| Commissioner notified: time, copy kept  | Include reasons if over 72 hours                  |
| Affected people told: when and how      | Or the grounds for not telling them               |
| Lessons and changes                     | From the review                                   |

The Act does not say how long to keep the register. Decide a period with your lawyer, and write it in the privacy policy's retention table once you have.

## 9. Templates

### Incident log (start this in the first hour)

```text
Incident reference:
Time aware (Nairobi time):            How we found out:
Time contained:                       Time closed:

Timeline (time, what happened or what I did, who):
-
-

What is exposed (data types, roughly how many people):
Still happening?  yes / no
Notifiable?  yes / no / unsure, and why:
Evidence preserved (files, backups, screenshots, where kept):
Decisions taken and by whom:
```

### Notice to the Data Commissioner (to copy into the form)

```text
We are notifying a personal data breach under section 43 of the Data Protection Act, 2019.

Controller: Alux Plaza, Nairobi, Kenya. Contact: privacy@aluxplaza.com.

What happened: [what occurred, when it began, when we became aware]
How it occurred: [what we know; say what is still being investigated]
People affected: [categories, for example clients, enquirers] - about [number]
Personal data involved: [for example email addresses, hashed passwords, contact messages]
Likely effects: [what could happen to the people]
Action taken: [containment and fixes, with dates and times]
Action for the affected people: [what we are telling them and when]
Other authorities told: [none / police / other]
We became aware at [date and time]. This notice is [within 72 hours / late because ...].
[If we are not telling the affected people: our grounds are ...]
Further information will follow as our investigation continues.
```

### Message to affected people

```text
Subject: A security incident affecting your Alux Plaza account

Hello [name],

We are writing to tell you about a security incident that involved some of your personal data.

What happened: [plain description, the date it was found]
What was involved: [the data types, for example your email address and a protected form of your password]
What we have done: [for example closed access, reset sessions, fixed the cause]
What we recommend you do: [for example change your password here and anywhere you reuse it; be careful with unexpected emails asking for your details]

We have told the Office of the Data Protection Commissioner. You can contact us about this at privacy@aluxplaza.com, and you may also complain to the Commissioner at www.odpc.go.ke.

We are sorry this happened.
Alux Plaza
```

## 10. Contacts to fill in now, before you need them

Fill these in and keep them in your offline copy:

| Who                                               | Name and number or email |
| ------------------------------------------------- | ------------------------ |
| Data-protection lawyer                            |                          |
| Someone who can help you, and when you would call |                          |
| Render support                                    |                          |
| Vercel support                                    |                          |
| Neon support                                      |                          |
| Resend support                                    |                          |
| Police or cybercrime unit contact                 |                          |
| National incident response team contact           |                          |
| Insurer, if any                                   |                          |

## 11. Practice and maintenance

- **Do a dry run once** before you need it. Pretend a client reports an unknown sign-in. Find each source in section 2, run the queries in section 4 on the live database, and time how long it takes to write the Commissioner notice. Fix whatever slows you down.
- **Check it again every six months**, and whenever you change a provider, add a data store, or the law changes.
- **Rotate the secrets in section 3 on a schedule**, not only after an incident. You will find any surprises on your own time.

## 12. Known limits

- This is a procedure, not legal advice. Several judgement calls above (whether a hashed password counts, when you may withhold notice from affected people, whether to ask for confidentiality) need your lawyer.
- The platform has no admin screen for blocking an IP or for incident handling. Everything here is SQL, API calls or provider dashboards.
- Evidence held by providers (Render, Vercel, Sentry, Discord) is kept on their schedules. Ask them early.
