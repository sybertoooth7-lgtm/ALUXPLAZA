// backend/src/routes/adminDataSubjects.js
//
// Data-subject requests (Kenya DPA 2019 / Data Protection (General)
// Regulations 2021, regs 9 and 12): give a person a copy of everything held
// about them, or erase it.
//
// Mounted superadmin-only. Both endpoints take the email in a POST body, not
// the URL, so the address never lands in access logs or browser history.
//
// Nothing here ever writes the subject's email into audit_logs: the audit
// entries record who ran the request, when, and how many records were
// touched, and nothing else. (Writing the email there would recreate the very
// retention problem erasure exists to fix.)

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import db from '../db.js';
import { recordAuditLog } from '../middleware/auditLog.js';
import { selectList } from '../lib/dataSubjectColumns.js';

const router = Router();

// Same normalisation the contact form and client signup apply before storing
// an address, so what an operator types matches what is stored.
const validateSubject = [
  body('email')
    .isString()
    .trim()
    .isEmail()
    .custom((value) => !/["\\]/.test(value))
    .withMessage('Email contains characters that are not supported here.')
    .normalizeEmail()
    .isLength({ max: 254 }),
  body('confirm')
    .optional()
    .custom((value) => typeof value === 'boolean')
    .withMessage('confirm must be true or false.'),
];

const ADMIN_ACCOUNT_MESSAGE =
  'This email belongs to an admin account. Admin accounts are managed through /api/admin/users, not here.';

const RETAINED_AFTER_ERASURE = [
  'Compliance assessment records tied to the client account are kept, now unlinked from any person: the account email and company name are replaced.',
  'Audit log entries are kept as a record of what admins did; any occurrence of the email inside them is replaced with [erased].',
  'Not covered by this tool: database backups, Resend delivery logs, Sentry events, alert-channel messages, and any mailbox that received a notification email. See docs/DATA_SUBJECT_REQUESTS.md.',
];

const NOT_INCLUDED_IN_EXPORT = [
  'Secrets are never exported: password hash, login-session identifiers, verification and password-reset tokens, risk-score share tokens.',
  'Admin staff identities that appear in audit or compliance records are not exported.',
  'Copies held by third-party services and in backups are not included.',
];

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Matches the address only as a whole address: not when it is the tail or head
// of a longer one (erasing ann@x.com must not redact joann@x.com). Capture
// groups 1 and 2 keep the surrounding characters when we replace.
const ADDRESS_CHARS = 'A-Za-z0-9._%+-';
function wholeAddressPattern(email) {
  return `(^|[^${ADDRESS_CHARS}])${escapeRegex(email)}([^${ADDRESS_CHARS}]|$)`;
}
const REDACTION = '\\1[erased]\\2';

async function isAdminAccount(conn, email) {
  const { rowCount } = await conn.query('SELECT 1 FROM admin_users WHERE lower(email) = $1', [
    email,
  ]);
  return rowCount > 0;
}

async function queueTableExists(conn) {
  const { rows } = await conn.query("SELECT to_regclass('pgboss.job') IS NOT NULL AS present");
  return rows[0].present;
}

async function count(conn, sql, params) {
  const { rows } = await conn.query(sql, params);
  return Number(rows[0].n);
}

// ── Export ───────────────────────────────────────────────────────────────
router.post('/export', validateSubject, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const email = req.body.email;
  const emailPattern = wholeAddressPattern(email);

  try {
    if (await isAdminAccount(db, email)) {
      return res.status(409).json({ error: ADMIN_ACCOUNT_MESSAGE });
    }

    const contacts = (
      await db.query(
        `SELECT ${selectList('contacts')} FROM contacts WHERE lower(email) = $1 ORDER BY created_at, id`,
        [email]
      )
    ).rows;

    const client =
      (
        await db.query(`SELECT ${selectList('clients')} FROM clients WHERE lower(email) = $1`, [
          email,
        ])
      ).rows[0] || null;
    const clientId = client ? client.id : null;

    const loginAttempts = (
      await db.query(
        `SELECT ${selectList('client_login_attempts')} FROM client_login_attempts
         WHERE lower(email_attempted) = $1 OR client_id = $2::int
         ORDER BY created_at, id`,
        [email, clientId]
      )
    ).rows;

    const sessions = clientId
      ? (
          await db.query(
            `SELECT ${selectList('client_sessions')} FROM client_sessions WHERE client_id = $1 ORDER BY created_at, id`,
            [clientId]
          )
        ).rows
      : [];

    const riskScoreShares = clientId
      ? (
          await db.query(
            `SELECT ${selectList('risk_score_shares')} FROM risk_score_shares WHERE client_id = $1 ORDER BY created_at, id`,
            [clientId]
          )
        ).rows
      : [];

    const complianceRecords = clientId
      ? (
          await db.query(
            `SELECT i.framework, i.title, ${selectList('client_compliance_status', 's')}
             FROM client_compliance_status s
             JOIN compliance_items i ON i.id = s.item_id
             WHERE s.client_id = $1
             ORDER BY i.framework, i.sort_order, i.id`,
            [clientId]
          )
        ).rows
      : [];

    const actionsOnAccount = clientId
      ? (
          await db.query(
            `SELECT action, created_at FROM audit_logs
             WHERE target_table = 'clients' AND target_id = $1
             ORDER BY created_at, id`,
            [clientId]
          )
        ).rows
      : [];

    const auditEntriesMentioningEmail = await count(
      db,
      `SELECT COUNT(*) AS n FROM audit_logs WHERE old_value::text ~* $1 OR new_value::text ~* $1`,
      [emailPattern]
    );

    const queuedEmailJobs = (await queueTableExists(db))
      ? await count(
          db,
          `SELECT COUNT(*) AS n FROM pgboss.job
           WHERE name = 'email' AND lower(data->'payload'->>'email') = $1`,
          [email]
        )
      : 0;

    const found =
      contacts.length > 0 ||
      client !== null ||
      loginAttempts.length > 0 ||
      queuedEmailJobs > 0 ||
      auditEntriesMentioningEmail > 0;

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'data_subject.export',
      targetTable: 'data_subject',
      newValue: {
        found,
        contacts: contacts.length,
        client_account: client !== null,
        login_attempts: loginAttempts.length,
        sessions: sessions.length,
        risk_score_shares: riskScoreShares.length,
        compliance_records: complianceRecords.length,
        queued_email_jobs: queuedEmailJobs,
        audit_entries_mentioning_email: auditEntriesMentioningEmail,
      },
    });

    res.set('Cache-Control', 'no-store');
    res.json({
      generatedAt: new Date().toISOString(),
      subject: { email },
      found,
      contacts,
      client,
      loginAttempts,
      sessions,
      riskScoreShares,
      complianceRecords,
      queuedEmailJobs,
      auditLog: { actionsOnAccount, entriesMentioningEmail: auditEntriesMentioningEmail },
      notIncluded: NOT_INCLUDED_IN_EXPORT,
    });
  } catch (err) {
    console.error('[adminDataSubjects] Export error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Erase ────────────────────────────────────────────────────────────────
// Without "confirm": true this is a dry run: it reports what WOULD be erased
// and changes nothing.
router.post('/erase', validateSubject, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const email = req.body.email;
  const confirm = req.body.confirm === true;
  const emailPattern = wholeAddressPattern(email);

  try {
    if (await isAdminAccount(db, email)) {
      return res.status(409).json({ error: ADMIN_ACCOUNT_MESSAGE });
    }

    if (!confirm) {
      const client = (await db.query('SELECT id FROM clients WHERE lower(email) = $1', [email]))
        .rows[0];
      const clientId = client ? client.id : null;
      const wouldErase = {
        contacts: await count(db, 'SELECT COUNT(*) AS n FROM contacts WHERE lower(email) = $1', [
          email,
        ]),
        client_account: clientId !== null,
        login_attempts: await count(
          db,
          `SELECT COUNT(*) AS n FROM client_login_attempts
           WHERE lower(email_attempted) = $1 OR client_id = $2::int`,
          [email, clientId]
        ),
        sessions: await count(
          db,
          'SELECT COUNT(*) AS n FROM client_sessions WHERE client_id = $1::int',
          [clientId]
        ),
        verification_and_reset_tokens:
          (await count(
            db,
            'SELECT COUNT(*) AS n FROM client_email_verifications WHERE client_id = $1::int',
            [clientId]
          )) +
          (await count(
            db,
            'SELECT COUNT(*) AS n FROM client_password_resets WHERE client_id = $1::int',
            [clientId]
          )),
        risk_score_shares: await count(
          db,
          'SELECT COUNT(*) AS n FROM risk_score_shares WHERE client_id = $1::int',
          [clientId]
        ),
        audit_entries_to_redact: await count(
          db,
          `SELECT COUNT(*) AS n FROM audit_logs WHERE old_value::text ~* $1 OR new_value::text ~* $1`,
          [emailPattern]
        ),
        queued_email_jobs: (await queueTableExists(db))
          ? await count(
              db,
              `SELECT COUNT(*) AS n FROM pgboss.job
               WHERE name = 'email' AND lower(data->'payload'->>'email') = $1`,
              [email]
            )
          : 0,
      };
      return res.json({
        dryRun: true,
        message: 'Nothing was changed. Re-send with "confirm": true to erase.',
        wouldErase,
        retained: RETAINED_AFTER_ERASURE,
      });
    }

    const erased = await db.transaction(async (tx) => {
      const contacts = await tx.query('DELETE FROM contacts WHERE lower(email) = $1', [email]);

      const client = (
        await tx.query('SELECT id FROM clients WHERE lower(email) = $1 FOR UPDATE', [email])
      ).rows[0];
      const clientId = client ? client.id : null;

      let sessions = 0;
      let tokens = 0;
      let shares = 0;
      if (clientId !== null) {
        sessions = (await tx.query('DELETE FROM client_sessions WHERE client_id = $1', [clientId]))
          .rowCount;
        tokens =
          (
            await tx.query('DELETE FROM client_email_verifications WHERE client_id = $1', [
              clientId,
            ])
          ).rowCount +
          (await tx.query('DELETE FROM client_password_resets WHERE client_id = $1', [clientId]))
            .rowCount;
        shares = (await tx.query('DELETE FROM risk_score_shares WHERE client_id = $1', [clientId]))
          .rowCount;
      }

      const loginAttempts = await tx.query(
        `DELETE FROM client_login_attempts WHERE lower(email_attempted) = $1 OR client_id = $2::int`,
        [email, clientId]
      );

      if (clientId !== null) {
        await tx.query(
          `UPDATE clients
           SET email = 'erased-' || id || '@erased.invalid',
               company_name = '[erased]',
               password_hash = '!',
               email_verified = FALSE,
               failed_login_count = 0,
               locked_until = NULL,
               consented_at = NULL,
               disabled_at = COALESCE(disabled_at, NOW())
           WHERE id = $1`,
          [clientId]
        );
      }

      const auditRedacted = await tx.query(
        `UPDATE audit_logs
         SET old_value = CASE WHEN old_value::text ~* $1
                              THEN regexp_replace(old_value::text, $1, $2, 'gi')::jsonb
                              ELSE old_value END,
             new_value = CASE WHEN new_value::text ~* $1
                              THEN regexp_replace(new_value::text, $1, $2, 'gi')::jsonb
                              ELSE new_value END
         WHERE old_value::text ~* $1 OR new_value::text ~* $1`,
        [emailPattern, REDACTION]
      );

      return {
        contacts: contacts.rowCount,
        client_account_anonymised: clientId !== null,
        login_attempts: loginAttempts.rowCount,
        sessions,
        verification_and_reset_tokens: tokens,
        risk_score_shares: shares,
        audit_entries_redacted: auditRedacted.rowCount,
      };
    });

    // Queued email jobs are cleaned up after the commit and reported
    // separately: pg-boss owns that table, and a failure there must not undo
    // an erasure that has already succeeded.
    const warnings = [];
    let queuedJobsDeleted = 0;
    try {
      if (await queueTableExists(db)) {
        queuedJobsDeleted = (
          await db.query(
            `DELETE FROM pgboss.job
             WHERE name = 'email' AND lower(data->'payload'->>'email') = $1`,
            [email]
          )
        ).rowCount;
      }
    } catch (err) {
      console.error('[adminDataSubjects] Queue cleanup failed:', err.message);
      warnings.push(
        'The rest of the erasure succeeded, but queued email jobs for this address could not be removed. They expire on their own; re-run the erase to retry.'
      );
    }

    const summary = { ...erased, queued_email_jobs: queuedJobsDeleted };

    await recordAuditLog({
      adminEmail: req.user.email,
      action: 'data_subject.erase',
      targetTable: 'data_subject',
      newValue: summary,
    });

    res.json({ dryRun: false, erased: summary, retained: RETAINED_AFTER_ERASURE, warnings });
  } catch (err) {
    console.error('[adminDataSubjects] Erase error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
