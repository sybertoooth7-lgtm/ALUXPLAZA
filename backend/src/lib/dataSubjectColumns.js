// backend/src/lib/dataSubjectColumns.js
//
// Single source of truth for which columns of each personal-data table the
// data-subject export returns, and which it deliberately withholds.
//
// Every column that exists on these tables must appear in exactly one of the
// two lists. test/dataSubjects.test.js compares this file against the real
// schema (information_schema), so adding a column in a future migration
// without deciding here whether a person is entitled to see it fails CI,
// rather than silently making the export incomplete (or leaking a secret).
//
// "excluded" means one of:
//   - a secret or token (password hash, session id, link token, token hash)
//   - an internal key or an admin's own identity (updated_by, created_by)
//   - already represented in another field of the export

export const DATA_SUBJECT_TABLES = {
  contacts: {
    exported: [
      'id',
      'name',
      'email',
      'company',
      'message',
      'status',
      'consented_at',
      'created_at',
      'updated_at',
    ],
    excluded: [],
  },
  clients: {
    exported: [
      'id',
      'company_name',
      'email',
      'email_verified',
      'created_at',
      'consented_at',
      'disabled_at',
      'locked_until',
      'failed_login_count',
    ],
    excluded: ['password_hash'],
  },
  client_login_attempts: {
    exported: ['id', 'email_attempted', 'ip_address', 'user_agent', 'success', 'created_at'],
    excluded: ['client_id'],
  },
  client_sessions: {
    exported: ['id', 'ip_address', 'user_agent', 'created_at', 'last_seen_at', 'expires_at'],
    excluded: ['client_id', 'jti'],
  },
  risk_score_shares: {
    exported: ['id', 'created_at', 'expires_at', 'revoked_at'],
    excluded: ['client_id', 'token', 'created_by'],
  },
  client_compliance_status: {
    exported: ['status', 'notes', 'updated_at'],
    excluded: ['id', 'client_id', 'item_id', 'updated_by'],
  },
  client_email_verifications: {
    exported: [],
    excluded: ['id', 'client_id', 'token_hash', 'expires_at', 'used_at', 'created_at'],
  },
  client_password_resets: {
    exported: [],
    excluded: ['id', 'client_id', 'token_hash', 'expires_at', 'used_at', 'created_at'],
  },
};

/**
 * Comma-separated, optionally alias-qualified SELECT list for a table's
 * exported columns. Table and column names come only from the constant above,
 * never from user input, so interpolating them into SQL is safe.
 */
export function selectList(table, alias = null) {
  const def = DATA_SUBJECT_TABLES[table];
  if (!def) throw new Error(`Unknown data-subject table: ${table}`);
  return def.exported.map((c) => (alias ? `${alias}.${c}` : c)).join(', ');
}
