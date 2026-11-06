// backend/src/lib/totpReplay.js
// Single-use enforcement for TOTP codes. The UPDATE is atomic, so two
// concurrent verifications of the same code cannot both succeed.
import db from '../db.js';

export async function consumeTOTPStep(userId, step) {
  if (!Number.isInteger(step)) return false;
  const result = await db.query(
    `UPDATE admin_users
        SET mfa_last_used_step = $1
      WHERE id = $2
        AND (mfa_last_used_step IS NULL OR mfa_last_used_step < $1)
      RETURNING id`,
    [step, userId]
  );
  return result.rowCount > 0;
}
